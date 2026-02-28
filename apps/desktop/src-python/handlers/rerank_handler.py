"""
Rerank 处理器
"""

from __future__ import annotations

import asyncio
import os
from typing import Callable

from rerank_runtime import rerank_runtime


class RerankHandler:
    """本地 rerank RPC 处理器"""

    async def handle_rerank_texts(self, params: dict, on_progress: Callable) -> dict:
        query = params.get("query", "")
        texts = params.get("texts") or []
        model_dir = params.get("modelDir")
        model_name = params.get("modelName")
        batch_size = params.get("batchSize", 8)
        device_policy = params.get("devicePolicy", "auto")

        if not isinstance(query, str) or not query.strip():
            return {
                "available": False,
                "reason": "query is required",
                "scores": [],
            }

        if not isinstance(texts, list):
            return {
                "available": False,
                "reason": "texts must be an array",
                "scores": [],
            }

        if not model_dir or not model_name:
            return {
                "available": False,
                "reason": "modelDir and modelName are required",
                "scores": [],
            }

        model_path = os.path.join(model_dir, model_name)
        if not os.path.exists(model_path):
            return {
                "available": False,
                "reason": f"reranker model not found: {model_path}",
                "scores": [],
            }

        await on_progress(
            {
                "type": "progress",
                "percentage": 5,
                "message": "准备执行本地重排...",
            }
        )

        loop = asyncio.get_running_loop()
        try:
            result = await loop.run_in_executor(
                None,
                lambda: rerank_runtime.rerank(
                    query=query,
                    texts=[str(text) for text in texts],
                    model_path=model_path,
                    model_name=model_name,
                    batch_size=int(batch_size or 8),
                    device_policy=device_policy,
                ),
            )
        except Exception as exc:
            return {
                "available": False,
                "reason": str(exc),
                "scores": [],
            }

        await on_progress(
            {
                "type": "progress",
                "percentage": 100,
                "message": "本地重排完成",
            }
        )

        return {
            "available": True,
            "scores": result.get("scores", []),
            "device": result.get("device"),
            "modelName": result.get("model_name"),
        }

    def get_handlers(self) -> dict:
        return {
            "rerank_texts": self.handle_rerank_texts,
        }

