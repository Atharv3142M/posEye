from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

from pipeline.errors import MaskingFailed

MOVING_CLASSES = {
    "person",
    "bicycle",
    "car",
    "motorcycle",
    "bus",
    "truck",
    "boat",
    "bird",
    "cat",
    "dog",
    "horse",
    "sheep",
    "cow",
}


def _write_mask(image_path: Path, mask: np.ndarray) -> Path:
    dest = image_path.with_name(f"{image_path.stem}_mask.jpg")
    cv2.imwrite(str(dest), mask)
    return dest


def generate_moving_object_masks(
    frames: list[Path],
    *,
    conf: float = 0.35,
    model_name: str = "yolov8n.pt",
) -> list[Path]:
    """Write ODM masks: black = skip reconstruction, white = keep."""
    try:
        from ultralytics import YOLO
    except ImportError as exc:
        raise RuntimeError("ultralytics is required for moving-object masks") from exc

    try:
        model = YOLO(model_name)
    except Exception as exc:
        raise MaskingFailed(
            f"YOLO weights '{model_name}' could not be loaded offline; place '{model_name}' locally or disable moving-object masks: {exc}"
        ) from exc
    names = model.names
    out: list[Path] = []
    for frame in frames:
        image = cv2.imread(str(frame))
        if image is None:
            continue
        h, w = image.shape[:2]
        mask = np.full((h, w), 255, dtype=np.uint8)
        result = model.predict(source=str(frame), conf=conf, verbose=False)[0]
        if result.boxes is not None:
            for box in result.boxes:
                cls_id = int(box.cls[0])
                label = names.get(cls_id, "") if isinstance(names, dict) else names[cls_id]
                if label not in MOVING_CLASSES:
                    continue
                xyxy = box.xyxy[0]
                if hasattr(xyxy, "tolist"):
                    xyxy = xyxy.tolist()
                x1, y1, x2, y2 = (int(v) for v in xyxy)
                cv2.rectangle(mask, (x1, y1), (x2, y2), 0, thickness=-1)
        out.append(_write_mask(frame, mask))
    return out
