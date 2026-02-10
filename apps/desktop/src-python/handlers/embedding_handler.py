"""
Embedding 处理器
负责本地 embedding 推理与模型管理 RPC
"""

from __future__ import annotations

import asyncio
import os
import sys
from typing import Callable

from download_embedding_model import (
    EMBEDDING_MODELS,
    download_from_huggingface,
    download_from_modelscope,
    list_embedding_models,
    check_embedding_model_downloaded,
    get_downloaded_embedding_models,
    delete_embedding_model,
)
from embedding_runtime import embedding_runtime


class EmbeddingHandler:
    """本地 embedding RPC 处理器"""

    def __init__(self):
        self.cancelled_downloads: set[str] = set()

    async def handle_embed_texts(self, params: dict, on_progress: Callable) -> dict:
        texts = params.get("texts") or []
        model_dir = params.get("modelDir")
        model_name = params.get("modelName", "bge-m3")
        batch_size = params.get("batchSize", 8)
        device_policy = params.get("devicePolicy", "auto")

        if not model_dir:
            raise ValueError("modelDir is required")
        if not isinstance(texts, list):
            raise ValueError("texts must be an array")

        resolved_model_dir = os.path.join(model_dir, model_name)
        if not os.path.exists(resolved_model_dir):
            raise FileNotFoundError(f"Embedding model not found: {resolved_model_dir}")

        await on_progress(
            {
                "type": "progress",
                "percentage": 5,
                "message": "准备加载 embedding 模型...",
            }
        )

        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            None,
            lambda: embedding_runtime.encode(
                texts=texts,
                model_path=resolved_model_dir,
                model_name=model_name,
                batch_size=int(batch_size or 8),
                device_policy=device_policy,
            ),
        )

        await on_progress(
            {
                "type": "progress",
                "percentage": 100,
                "message": "向量化完成",
            }
        )

        return {
            "embeddings": result["embeddings"],
            "dimensions": result["dimensions"],
            "device": result["device"],
        }

    async def handle_embedding_health(self, params: dict, on_progress: Callable) -> dict:
        model_dir = params.get("modelDir")
        model_name = params.get("modelName", "bge-m3")
        device_policy = params.get("devicePolicy", "auto")

        health = embedding_runtime.health()

        if model_dir:
            model_path = os.path.join(model_dir, model_name)
            if os.path.exists(model_path) and (
                not health.get("loaded")
                or health.get("model_path") != model_path
            ):
                loop = asyncio.get_running_loop()
                await loop.run_in_executor(
                    None,
                    lambda: embedding_runtime.ensure_loaded(
                        model_path=model_path,
                        model_name=model_name,
                        device_policy=device_policy,
                    ),
                )
                health = embedding_runtime.health()

        return {
            "success": True,
            "health": health,
        }

    async def handle_download_embedding_model(self, params: dict, on_progress: Callable) -> dict:
        source = params.get("source")
        model_name = params.get("modelName")
        output_dir = params.get("outputDir")

        if not source or not model_name or not output_dir:
            raise ValueError("source, modelName and outputDir are required")

        model_cfg = EMBEDDING_MODELS.get(model_name)
        if not model_cfg:
            raise ValueError(f"Unknown embedding model: {model_name}")

        model_id = model_cfg.get(source)
        if not model_id:
            raise ValueError(f"Model {model_name} not available on {source}")

        download_key = f"{source}:{model_name}"
        self.cancelled_downloads.discard(download_key)
        loop = asyncio.get_running_loop()

        class AsyncProgressTracker:
            def __init__(tracker_self, callback, handler, key, event_loop):
                tracker_self.callback = callback
                tracker_self.handler = handler
                tracker_self.key = key
                tracker_self.loop = event_loop
                tracker_self.last_percentage = -1
                tracker_self.last_message = ""

            def update(
                tracker_self,
                percentage: int,
                message: str = "",
                downloaded_bytes: int | None = None,
                total_bytes: int | None = None,
                source: str | None = None,
            ):
                if tracker_self.key in tracker_self.handler.cancelled_downloads:
                    raise InterruptedError("Download cancelled")
                if (
                    percentage == tracker_self.last_percentage
                    and message == tracker_self.last_message
                ):
                    return
                tracker_self.last_percentage = percentage
                tracker_self.last_message = message
                tracker_self.loop.call_soon_threadsafe(
                    lambda: asyncio.create_task(
                        tracker_self.callback(
                            {
                                "type": "progress",
                                "percentage": percentage,
                                "message": message,
                                "downloadedBytes": downloaded_bytes,
                                "totalBytes": total_bytes,
                                "source": source,
                            }
                        )
                    )
                )

        tracker = AsyncProgressTracker(on_progress, self, download_key, loop)

        try:
            if source == "modelscope":
                model_dir = await loop.run_in_executor(
                    None,
                    lambda: download_from_modelscope(
                        model_id=model_id,
                        output_dir=output_dir,
                        model_name=model_name,
                        progress_tracker=tracker,
                    ),
                )
            elif source == "huggingface":
                model_dir = await loop.run_in_executor(
                    None,
                    lambda: download_from_huggingface(
                        model_id=model_id,
                        output_dir=output_dir,
                        model_name=model_name,
                        progress_tracker=tracker,
                    ),
                )
            else:
                raise ValueError(f"Unknown source: {source}")

            if download_key in self.cancelled_downloads:
                self.cancelled_downloads.discard(download_key)
                return {
                    "success": False,
                    "error": "Download cancelled",
                }

            return {
                "success": True,
                "model_dir": model_dir,
            }
        except InterruptedError:
            self.cancelled_downloads.discard(download_key)
            return {
                "success": False,
                "error": "Download cancelled",
            }
        finally:
            self.cancelled_downloads.discard(download_key)

    async def handle_cancel_embedding_download(self, params: dict, on_progress: Callable) -> dict:
        source = params.get("source")
        model_name = params.get("modelName")

        if not source or not model_name:
            raise ValueError("source and modelName are required")

        download_key = f"{source}:{model_name}"
        self.cancelled_downloads.add(download_key)
        print(f"[EmbeddingHandler] Download cancelled: {download_key}", file=sys.stderr)

        return {
            "success": True,
            "message": f"Download {download_key} marked for cancellation",
        }

    async def handle_list_embedding_models(self, params: dict, on_progress: Callable) -> dict:
        models_dir = params.get("modelsDir")
        return list_embedding_models(models_dir)

    async def handle_check_embedding_model(self, params: dict, on_progress: Callable) -> dict:
        model_name = params.get("modelName")
        models_dir = params.get("modelsDir")
        if not model_name or not models_dir:
            raise ValueError("modelName and modelsDir are required")

        return {
            "model_name": model_name,
            "downloaded": check_embedding_model_downloaded(model_name, models_dir),
        }

    async def handle_delete_embedding_model(self, params: dict, on_progress: Callable) -> dict:
        model_name = params.get("modelName")
        models_dir = params.get("modelsDir")
        if not model_name or not models_dir:
            raise ValueError("modelName and modelsDir are required")

        return {
            "success": delete_embedding_model(model_name, models_dir),
            "model_name": model_name,
        }

    async def handle_get_downloaded_embedding_models(self, params: dict, on_progress: Callable) -> dict:
        models_dir = params.get("modelsDir")
        if not models_dir:
            raise ValueError("modelsDir is required")

        return {
            "downloaded_models": get_downloaded_embedding_models(models_dir),
        }

    def get_handlers(self) -> dict:
        return {
            "embed_texts": self.handle_embed_texts,
            "embedding_health": self.handle_embedding_health,
            "download_embedding_model": self.handle_download_embedding_model,
            "cancel_embedding_download": self.handle_cancel_embedding_download,
            "list_embedding_models": self.handle_list_embedding_models,
            "check_embedding_model": self.handle_check_embedding_model,
            "delete_embedding_model": self.handle_delete_embedding_model,
            "get_downloaded_embedding_models": self.handle_get_downloaded_embedding_models,
        }
