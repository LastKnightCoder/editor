#!/usr/bin/env python3
"""
Embedding 模型下载工具

当前支持：
- BAAI/bge-m3
- 下载源：ModelScope / HuggingFace
"""

from __future__ import annotations

import io
import json
import os
import shutil
import threading
import time
from contextlib import contextmanager, redirect_stdout, redirect_stderr
from pathlib import Path
from typing import Optional


EMBEDDING_MODELS = {
    "bge-m3": {
        "name": "bge-m3",
        "label": "BAAI/bge-m3",
        "description": "多语言通用向量模型（本地离线）",
        "size": "~2.2GB",
        "dimensions": 1024,
        "recommended": True,
        "modelscope": "BAAI/bge-m3",
        "huggingface": "BAAI/bge-m3",
    }
}

_CORE_FILES = ["config.json"]
_TOKENIZER_FILES = ["tokenizer_config.json", "tokenizer.json", "sentencepiece.bpe.model"]
_WEIGHT_FILES = [
    "model.safetensors",
    "model.safetensors.index.json",
    "pytorch_model.bin",
    "pytorch_model.bin.index.json",
]


class ProgressTracker:
    """线程安全进度跟踪器"""

    def __init__(self):
        self.last_percentage = -1
        self.last_message = ""
        self._stderr = os.sys.stderr

    def update(
        self,
        percentage: int,
        message: str = "",
        downloaded_bytes: Optional[int] = None,
        total_bytes: Optional[int] = None,
        source: Optional[str] = None,
    ):
        if percentage == self.last_percentage and message == self.last_message:
            return
        self.last_percentage = percentage
        self.last_message = message
        print(
            json.dumps(
                {
                    "type": "progress",
                    "percentage": percentage,
                    "message": message,
                    "downloadedBytes": downloaded_bytes,
                    "totalBytes": total_bytes,
                    "source": source,
                },
                ensure_ascii=False,
            ),
            file=self._stderr,
        )
        self._stderr.flush()


def _format_bytes(size: float) -> str:
    if size >= 1024 * 1024 * 1024:
        return f"{size / (1024 * 1024 * 1024):.2f}GB"
    if size >= 1024 * 1024:
        return f"{size / (1024 * 1024):.2f}MB"
    if size >= 1024:
        return f"{size / 1024:.2f}KB"
    return f"{int(size)}B"


class DownloadProgressAggregator:
    """聚合多下载任务进度，按字节计算真实百分比"""

    def __init__(
        self,
        progress_tracker: Optional[ProgressTracker],
        source: str,
        model_id: str,
    ):
        self.progress_tracker = progress_tracker
        self.source = source
        self.model_id = model_id
        self._lock = threading.Lock()
        self._next_id = 0
        self._bars: dict[int, dict[str, Optional[float]]] = {}
        self._downloaded_bytes: float = 0
        self._total_bytes: float = 0
        self._last_emit_at = 0.0

    def start(self):
        if self.progress_tracker:
            self.progress_tracker.update(
                0,
                f"从 {self.source} 下载: {self.model_id}",
                downloaded_bytes=0,
                total_bytes=None,
                source=self.source.lower(),
            )

    def _current_percentage(self) -> int:
        if self._total_bytes <= 0:
            return 0
        percentage = int((self._downloaded_bytes / self._total_bytes) * 100)
        return max(0, min(percentage, 99))

    def _current_message(self, prefix: str = "正在下载模型...") -> str:
        if self._total_bytes > 0:
            return (
                f"{prefix} {_format_bytes(self._downloaded_bytes)}"
                f" / {_format_bytes(self._total_bytes)}"
            )
        return f"{prefix} 已下载 {_format_bytes(self._downloaded_bytes)}"

    def _emit_progress_locked(self, force: bool = False):
        if not self.progress_tracker:
            return

        now = time.monotonic()
        percentage = self._current_percentage()

        if not force and percentage == self.progress_tracker.last_percentage:
            if now - self._last_emit_at < 0.25:
                return

        self._last_emit_at = now
        self.progress_tracker.update(
            percentage,
            self._current_message(),
            downloaded_bytes=int(self._downloaded_bytes),
            total_bytes=int(self._total_bytes) if self._total_bytes > 0 else None,
            source=self.source.lower(),
        )

    def register_bar(self, total: Optional[float], initial: float = 0) -> int:
        with self._lock:
            self._next_id += 1
            bar_id = self._next_id

            normalized_total = float(total) if total and total > 0 else None
            safe_initial = max(float(initial or 0), 0.0)

            self._bars[bar_id] = {
                "total": normalized_total,
                "current": safe_initial,
            }

            if normalized_total is not None:
                self._total_bytes += normalized_total
            if safe_initial > 0:
                self._downloaded_bytes += safe_initial

            self._emit_progress_locked()
            return bar_id

    def advance(self, bar_id: int, delta: float):
        if delta <= 0:
            return

        with self._lock:
            state = self._bars.get(bar_id)
            if not state:
                return

            previous = float(state["current"] or 0)
            target = previous + float(delta)
            total = state["total"]
            if total is not None:
                target = min(target, total)

            increment = max(0.0, target - previous)
            state["current"] = target
            self._downloaded_bytes += increment
            self._emit_progress_locked()

    def close_bar(self, bar_id: int):
        with self._lock:
            state = self._bars.pop(bar_id, None)
            if not state:
                return

            total = state["total"]
            current = float(state["current"] or 0)
            if total is not None and current < total:
                self._downloaded_bytes += max(0.0, total - current)

            self._emit_progress_locked(force=True)

    def update_stage(self, percentage: int, message: str):
        if not self.progress_tracker:
            return

        with self._lock:
            safe_percentage = max(self._current_percentage(), min(99, percentage))
            self.progress_tracker.update(
                safe_percentage,
                message,
                downloaded_bytes=int(self._downloaded_bytes),
                total_bytes=int(self._total_bytes) if self._total_bytes > 0 else None,
                source=self.source.lower(),
            )

    def complete(self, message: str = "下载完成"):
        if not self.progress_tracker:
            return

        with self._lock:
            if self._total_bytes <= 0:
                self._total_bytes = max(self._downloaded_bytes, 1)
            if self._downloaded_bytes < self._total_bytes:
                self._downloaded_bytes = self._total_bytes

            self.progress_tracker.update(
                100,
                message,
                downloaded_bytes=int(self._downloaded_bytes),
                total_bytes=int(self._total_bytes),
                source=self.source.lower(),
            )

    def create_tqdm_proxy(self):
        aggregator = self

        class ProgressTqdm:
            def __init__(self, *args, **kwargs):
                total = kwargs.get("total")
                initial = kwargs.get("initial", 0)
                self.n = float(initial or 0)
                self.total = total
                self._bar_id = aggregator.register_bar(total, initial)

            def update(self, n=1):
                increment = float(n or 0)
                if increment <= 0:
                    return
                self.n += increment
                aggregator.advance(self._bar_id, increment)

            def close(self):
                aggregator.close_bar(self._bar_id)

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc_value, traceback):
                self.close()
                return False

            def set_description(self, *_args, **_kwargs):
                return None

            def set_postfix(self, *_args, **_kwargs):
                return None

            def refresh(self):
                return None

        return ProgressTqdm


@contextmanager
def _patch_module_attr(module: object, attr_name: str, attr_value):
    has_attr = hasattr(module, attr_name)
    original = getattr(module, attr_name, None)

    if has_attr:
        setattr(module, attr_name, attr_value)

    try:
        yield
    finally:
        if has_attr:
            setattr(module, attr_name, original)


def _resolve_model_dir_name(model_name: str, model_id: str) -> str:
    if model_name:
        return model_name
    return model_id.split("/")[-1]


def _copy_downloaded_dir(src_dir: str, target_dir: str):
    if not os.path.exists(src_dir):
        raise FileNotFoundError(f"Downloaded model directory not found: {src_dir}")

    if os.path.exists(target_dir):
        shutil.rmtree(target_dir)

    try:
        shutil.move(src_dir, target_dir)
    except Exception:
        shutil.copytree(src_dir, target_dir)


def download_from_modelscope(
    model_id: str,
    output_dir: str,
    model_name: str,
    progress_tracker: Optional[ProgressTracker] = None,
) -> str:
    try:
        from modelscope.hub.snapshot_download import snapshot_download
        from modelscope.hub import file_download as ms_file_download
    except ImportError as exc:
        raise ImportError("modelscope is not installed") from exc

    progress = DownloadProgressAggregator(progress_tracker, "ModelScope", model_id)
    progress.start()

    model_dir_name = _resolve_model_dir_name(model_name, model_id)
    target_dir = os.path.join(output_dir, model_dir_name)
    cache_dir = os.path.join(output_dir, ".embedding_modelscope_cache")
    os.makedirs(output_dir, exist_ok=True)

    try:
        sink = io.StringIO()
        with (
            _patch_module_attr(ms_file_download, "tqdm", progress.create_tqdm_proxy()),
            redirect_stdout(sink),
            redirect_stderr(sink),
        ):
            model_dir = snapshot_download(
                model_id,
                cache_dir=cache_dir,
                revision="master",
            )

        progress.update_stage(96, "下载完成，正在复制文件...")

        _copy_downloaded_dir(model_dir, target_dir)
    finally:
        if os.path.exists(cache_dir):
            shutil.rmtree(cache_dir, ignore_errors=True)

    progress.complete("下载完成")

    return target_dir


def download_from_huggingface(
    model_id: str,
    output_dir: str,
    model_name: str,
    progress_tracker: Optional[ProgressTracker] = None,
) -> str:
    try:
        from huggingface_hub import snapshot_download
        from huggingface_hub import file_download as hf_file_download
    except ImportError as exc:
        raise ImportError("huggingface_hub is not installed") from exc

    progress = DownloadProgressAggregator(progress_tracker, "HuggingFace", model_id)
    progress.start()

    model_dir_name = _resolve_model_dir_name(model_name, model_id)
    target_dir = os.path.join(output_dir, model_dir_name)
    os.makedirs(output_dir, exist_ok=True)

    sink = io.StringIO()
    with (
        _patch_module_attr(hf_file_download, "tqdm", progress.create_tqdm_proxy()),
        redirect_stdout(sink),
        redirect_stderr(sink),
    ):
        snapshot_download(
            model_id,
            local_dir=target_dir,
            local_dir_use_symlinks=False,
        )

    progress.complete("下载完成")

    return target_dir


def check_embedding_model_downloaded(model_name: str, models_dir: str) -> bool:
    model_path = Path(models_dir) / model_name
    if not model_path.exists() or not model_path.is_dir():
        return False

    has_core = all((model_path / file).exists() for file in _CORE_FILES)
    has_tokenizer = any((model_path / file).exists() for file in _TOKENIZER_FILES)
    has_weight = any((model_path / file).exists() for file in _WEIGHT_FILES)
    return has_core and has_tokenizer and has_weight


def list_embedding_models(models_dir: Optional[str] = None) -> dict:
    result = []
    for key, info in EMBEDDING_MODELS.items():
        item = {
            "name": info["name"],
            "label": info["label"],
            "description": info["description"],
            "size": info["size"],
            "dimensions": info["dimensions"],
            "recommended": info.get("recommended", False),
            "modelscope": info["modelscope"],
            "huggingface": info["huggingface"],
            "downloaded": False,
        }
        if models_dir:
            item["downloaded"] = check_embedding_model_downloaded(key, models_dir)
        result.append(item)

    return {"models": result}


def get_downloaded_embedding_models(models_dir: str) -> list[str]:
    downloaded: list[str] = []
    for model_name in EMBEDDING_MODELS.keys():
        if check_embedding_model_downloaded(model_name, models_dir):
            downloaded.append(model_name)
    return downloaded


def delete_embedding_model(model_name: str, models_dir: str) -> bool:
    model_path = Path(models_dir) / model_name
    if not model_path.exists():
        return False
    shutil.rmtree(model_path)
    return True
