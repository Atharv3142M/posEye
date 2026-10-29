from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urljoin
from zipfile import ZipFile

import httpx

logger = logging.getLogger("orchestrator.nodeodm")

ProgressCb = Callable[[str, float, str], None]


def nodeodm_url() -> str:
    return os.environ.get("NODEODM_URL", "http://127.0.0.1:3000").rstrip("/")


def _mime_for(path: Path) -> str:
    s = path.suffix.lower()
    if s == ".png":
        return "image/png"
    if s in {".tif", ".tiff"}:
        return "image/tiff"
    return "image/jpeg"


@dataclass
class TaskInfo:
    uuid: str
    status_code: int
    progress: float
    message: str
    raw: dict[str, Any]

    @property
    def completed(self) -> bool:
        return self.status_code == 40

    @property
    def failed(self) -> bool:
        return self.status_code == 30

    @property
    def canceled(self) -> bool:
        return self.status_code == 50


class NodeODMError(RuntimeError):
    pass


class NodeODMClient:
    def __init__(self, base_url: str | None = None, timeout: float = 30.0):
        self.base_url = (base_url or nodeodm_url()).rstrip("/") + "/"
        self.timeout = timeout

    def _url(self, path: str) -> str:
        return urljoin(self.base_url, path.lstrip("/"))

    def info(self) -> dict[str, Any]:
        with httpx.Client(timeout=self.timeout) as client:
            r = client.get(self._url("info"))
            r.raise_for_status()
            return r.json()

    def create_task(
        self,
        images_dir: Path,
        options: list[dict[str, str]],
        zip_path: Path | None = None,
        name: str = "",
    ) -> str:
        """
        Upload images to NodeODM. Uses official multi-step lifecycle (/task/new/init ->
        /task/new/upload/{uuid} -> /task/new/commit/{uuid}) with field name 'images',
        falling back to single-shot POST /task/new with multipart field name 'images'.
        Prevents NodeODM 'Unexpected field' multer errors.
        """
        images = sorted(
            p for p in images_dir.iterdir()
            if p.suffix.lower() in {".jpg", ".jpeg", ".tif", ".tiff", ".png"}
        )
        if not images:
            raise NodeODMError(f"No images in {images_dir}")

        if zip_path is not None:
            zip_path.parent.mkdir(parents=True, exist_ok=True)
            with ZipFile(zip_path, "w") as zf:
                for image in images:
                    zf.write(image, arcname=image.name)

        with httpx.Client(timeout=120.0) as client:
            # 1. Try official multi-stage init/upload/commit lifecycle
            multi_stage_supported = False
            task_uuid = None
            try:
                init_data: dict[str, str] = {"options": json.dumps(options)}
                if name:
                    init_data["name"] = name
                init_res = client.post(self._url("task/new/init"), data=init_data)
                if init_res.status_code == 200:
                    init_payload = init_res.json()
                    task_uuid = init_payload.get("uuid")
                    if task_uuid:
                        multi_stage_supported = True
                        batch_size = 12
                        for i in range(0, len(images), batch_size):
                            batch = images[i : i + batch_size]
                            files_to_send = []
                            file_handles = []
                            try:
                                for img in batch:
                                    fh = img.open("rb")
                                    file_handles.append(fh)
                                    files_to_send.append(("images", (img.name, fh, _mime_for(img))))
                                upload_res = client.post(
                                    self._url(f"task/new/upload/{task_uuid}"),
                                    files=files_to_send,
                                )
                                if upload_res.status_code >= 400:
                                    self.cancel_task(task_uuid)
                                    raise NodeODMError(
                                        f"NodeODM batch upload rejected for task {task_uuid}: "
                                        f"HTTP {upload_res.status_code} {upload_res.text}"
                                    )
                            finally:
                                for fh in file_handles:
                                    fh.close()

                        commit_res = client.post(self._url(f"task/new/commit/{task_uuid}"))
                        if commit_res.status_code < 400:
                            return str(task_uuid)
                        self.cancel_task(task_uuid)
                        raise NodeODMError(
                            f"NodeODM commit rejected for task {task_uuid}: "
                            f"HTTP {commit_res.status_code} {commit_res.text}"
                        )
                elif init_res.status_code in {404, 405}:
                    logger.info(
                        "NodeODM does not support /task/new/init (status %s); falling back to single-shot upload",
                        init_res.status_code,
                    )
                else:
                    logger.warning(
                        "NodeODM /task/new/init returned status %s (%s); falling back to single-shot upload",
                        init_res.status_code,
                        init_res.text,
                    )
            except NodeODMError:
                raise
            except (httpx.ConnectError, httpx.TimeoutException) as exc:
                if multi_stage_supported and task_uuid:
                    self.cancel_task(task_uuid)
                    raise NodeODMError(f"NodeODM connection failed during image upload: {exc}") from exc
                logger.warning("NodeODM multi-stage init connection failed (%s); trying single-shot POST /task/new", exc)
            except Exception as exc:
                if multi_stage_supported and task_uuid:
                    self.cancel_task(task_uuid)
                    raise NodeODMError(f"NodeODM multi-stage upload failed: {exc}") from exc
                logger.warning("NodeODM multi-stage init unexpected error (%s); trying single-shot POST /task/new", exc)

            # 2. Single-shot POST /task/new with field 'images'
            files_to_send = []
            file_handles = []
            try:
                for img in images:
                    fh = img.open("rb")
                    file_handles.append(fh)
                    files_to_send.append(("images", (img.name, fh, _mime_for(img))))

                data_payload: dict[str, str] = {"options": json.dumps(options)}
                if name:
                    data_payload["name"] = name

                r = client.post(
                    self._url("task/new"),
                    data=data_payload,
                    files=files_to_send,
                )
                if r.status_code >= 400:
                    raise NodeODMError(f"NodeODM rejected task: {r.status_code} {r.text}")
                payload = r.json()
                task_uuid = payload.get("uuid")
                if not task_uuid:
                    raise NodeODMError(f"NodeODM did not return a uuid: {payload}")
                return str(task_uuid)
            finally:
                for fh in file_handles:
                    fh.close()

    def task_info(self, uuid: str) -> TaskInfo:
        with httpx.Client(timeout=self.timeout) as client:
            r = client.get(self._url(f"task/{uuid}/info"))
            r.raise_for_status()
            data = r.json()
        status = data.get("status") or {}
        return TaskInfo(
            uuid=uuid,
            status_code=int(status.get("code", 0)),
            progress=float(data.get("progress") or 0),
            message=str(status.get("errorMessage") or data.get("processingTime") or ""),
            raw=data,
        )

    def task_output(self, uuid: str, line: int = 0) -> list[str]:
        """Fetch incremental console lines from OpenDroneMap."""
        try:
            with httpx.Client(timeout=10.0) as client:
                r = client.get(self._url(f"task/{uuid}/output"), params={"line": line})
                if r.status_code == 200:
                    data = r.json()
                    if isinstance(data, list):
                        return [str(item) for item in data if item]
        except Exception as exc:
            logger.debug("Failed to fetch task output for %s line %s: %s", uuid, line, exc)
        return []

    def wait(
        self,
        uuid: str,
        *,
        poll_s: float = 1.5,
        progress: ProgressCb | None = None,
        should_stop: Callable[[], bool] | None = None,
    ) -> TaskInfo:
        last_line = 0
        while True:
            if should_stop and should_stop():
                self.cancel_task(uuid)
                raise NodeODMError("Job canceled")

            info = self.task_info(uuid)
            new_lines = self.task_output(uuid, line=last_line)
            if new_lines:
                last_line += len(new_lines)

            if progress:
                # NodeODM 0-100% maps to orchestrator 42-88%
                pct = 42.0 + min(46.0, info.progress * 0.46)
                if new_lines:
                    for line in new_lines:
                        clean_line = line.strip()
                        if clean_line:
                            progress("reconstructing", pct, clean_line)
                else:
                    msg = info.raw.get("status", {}).get("errorMessage") or "Reconstructing"
                    if not isinstance(msg, str) or not msg:
                        msg = f"NodeODM {info.progress:.0f}%"
                    progress("reconstructing", pct, msg)

            if info.completed:
                return info
            if info.failed or info.canceled:
                raise NodeODMError(info.message or f"NodeODM task {uuid} failed ({info.status_code})")
            time.sleep(poll_s)

    def cancel_task(self, uuid: str) -> bool:
        """Cancel task using POST /task/cancel or POST /task/{uuid}/cancel."""
        cancelled = False
        try:
            with httpx.Client(timeout=self.timeout) as client:
                r = client.post(self._url("task/cancel"), data={"uuid": uuid})
                if r.status_code == 200:
                    cancelled = True
                else:
                    r2 = client.post(self._url(f"task/{uuid}/cancel"))
                    if r2.status_code == 200:
                        cancelled = True
        except Exception as exc:
            logger.warning("Error sending cancel to NodeODM for task %s: %s", uuid, exc)
        return cancelled

    def ping(self) -> dict[str, Any]:
        return self.info()

    def download_asset(self, uuid: str, asset: str, dest: Path) -> Path:
        dest.parent.mkdir(parents=True, exist_ok=True)
        with httpx.Client(timeout=None) as client:
            with client.stream("GET", self._url(f"task/{uuid}/download/{asset}")) as r:
                r.raise_for_status()
                with dest.open("wb") as fh:
                    for chunk in r.iter_bytes():
                        fh.write(chunk)
        return dest


def cli_main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Submit a folder of stills to NodeODM")
    parser.add_argument("--images", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--url", default=None)
    parser.add_argument("--preset", default="medium", choices=["low", "medium", "high"])
    args = parser.parse_args(argv)

    from orchestrator.presets import preset_options

    client = NodeODMClient(args.url)
    zip_path = args.out / "upload.zip"
    uuid = client.create_task(args.images, preset_options(args.preset), zip_path)
    print(f"task {uuid}", flush=True)
    client.wait(uuid, progress=lambda s, p, m: print(f"[{s}] {p:.0f}% {m}", flush=True))
    client.download_asset(uuid, "all.zip", args.out / "all.zip")
    print(f"downloaded {args.out / 'all.zip'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(cli_main())
