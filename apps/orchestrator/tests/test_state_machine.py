from __future__ import annotations

import threading
import time
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from orchestrator.jobs import JobStore, TERMINAL_STAGES
from orchestrator.main import app


def test_terminal_states_immutable(tmp_path: Path):
    store = JobStore(tmp_path)
    job = store.create(tmp_path / "video.mp4")

    # Transition to ready
    store._emit(job, "validating", 1.0, "Validating")
    store._emit(job, "extracting", 10.0, "Extracting")
    store._emit(job, "ready", 100.0, "Model ready")
    assert job.stage == "ready"

    # Attempt transition from ready -> cancelled (MUST be blocked)
    store._emit(job, "cancelled", job.percent, "Try cancel")
    assert job.stage == "ready"

    # Attempt transition from ready -> extracting (MUST be blocked)
    store._emit(job, "extracting", 20.0, "Try rewind")
    assert job.stage == "ready"

    # Attempt transition from ready -> error (MUST be blocked)
    store._emit(job, "error", 50.0, "Try error")
    assert job.stage == "ready"

    # Test another terminal state: error -> cancelled (MUST be blocked)
    job2 = store.create(tmp_path / "video2.mp4")
    store._emit(job2, "error", 20.0, "Failed")
    assert job2.stage == "error"
    store._emit(job2, "cancelled", 20.0, "Cancel after error")
    assert job2.stage == "error"

    # Test cancelled -> ready (MUST be blocked)
    job3 = store.create(tmp_path / "video3.mp4")
    store._emit(job3, "cancelled", 30.0, "Canceled")
    assert job3.stage == "cancelled"
    store._emit(job3, "ready", 100.0, "Try ready")
    assert job3.stage == "cancelled"

    # Test interrupted -> ready (MUST be blocked)
    job4 = store.create(tmp_path / "video4.mp4")
    store._emit(job4, "interrupted", 40.0, "Interrupted")
    assert job4.stage == "interrupted"
    store._emit(job4, "ready", 100.0, "Try ready")
    assert job4.stage == "interrupted"


def test_cancellation_with_active_worker(tmp_path: Path):
    store = JobStore(tmp_path)
    job = store.create(tmp_path / "video.mp4")

    # Simulate an active worker thread
    stop_event = threading.Event()

    def dummy_worker():
        with store.lock:
            store._workers[job.id] = threading.current_thread()
        store._emit(job, "extracting", 10.0, "Extracting")
        while not stop_event.is_set():
            time.sleep(0.01)
        with store.lock:
            store._workers.pop(job.id, None)

    t = threading.Thread(target=dummy_worker)
    t.start()
    time.sleep(0.05)

    assert store.is_worker_running(job.id) is True

    # Calling cancel while worker is running should set cancellation_requested
    store.cancel(job)
    assert job.canceled is True
    assert job.stage == "cancellation_requested"

    # Deleting while cancellation is in progress / worker running must be rejected
    with pytest.raises(RuntimeError, match="Cannot delete active job"):
        store.delete(job)

    # Let the worker stop
    stop_event.set()
    t.join(timeout=2.0)
    assert store.is_worker_running(job.id) is False

    # Once worker terminates, final stage can become cancelled
    store._emit(job, "cancelled", job.percent, "Canceled")
    assert job.stage == "cancelled"

    # Now deletion must succeed
    store.delete(job)
    assert store.get(job.id) is None


def test_progress_monotonicity(tmp_path: Path):
    store = JobStore(tmp_path)
    job = store.create(tmp_path / "video.mp4")

    store._emit(job, "extracting", 25.0, "Extracting")
    assert job.percent == 25.0

    # Progress should not move backwards
    store._emit(job, "extracting", 15.0, "Late event with lower percent")
    assert job.percent == 25.0

    store._emit(job, "extracting", 30.0, "Advance")
    assert job.percent == 30.0


def test_concurrent_cancellation_idempotent(tmp_path: Path):
    store = JobStore(tmp_path)
    job = store.create(tmp_path / "video.mp4")

    # Call cancel multiple times concurrently
    threads = [threading.Thread(target=store.cancel, args=(job,)) for _ in range(10)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert job.canceled is True
    assert job.stage == "cancelled"
