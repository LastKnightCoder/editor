"""
本地 rerank 运行时

职责：
- 懒加载 FlagEmbedding 的 FlagReranker
- 基于本地模型对 query / text 对进行相关性打分
- 模型不可用时抛出异常，由 handler 返回 available=False
"""

from __future__ import annotations

import inspect
import threading
from typing import Any


class RerankRuntime:
    """本地 rerank 运行时（线程安全）"""

    def __init__(self):
        self._reranker = None
        self._model_path: str | None = None
        self._model_name: str | None = None
        self._device: str = "cpu"
        self._lock = threading.Lock()

    def _resolve_device(self, device_policy: str) -> str:
        try:
            import torch
        except Exception:
            return "cpu"

        policy = (device_policy or "auto").lower()
        cuda_available = bool(torch.cuda.is_available())
        if policy == "cuda":
            return "cuda" if cuda_available else "cpu"
        if policy == "cpu":
            return "cpu"
        return "cuda" if cuda_available else "cpu"

    def _build_reranker(self, model_path: str, device: str):
        try:
            from FlagEmbedding import FlagReranker
        except Exception as exc:
            raise RuntimeError(f"加载 FlagReranker 失败: {exc}") from exc

        signature = inspect.signature(FlagReranker.__init__)
        kwargs: dict[str, Any] = {
            "use_fp16": device == "cuda",
        }
        if "devices" in signature.parameters:
            kwargs["devices"] = device
        return FlagReranker(model_path, **kwargs)

    def ensure_loaded(
        self,
        model_path: str,
        model_name: str,
        device_policy: str = "auto",
    ) -> None:
        target_device = self._resolve_device(device_policy)
        with self._lock:
            if (
                self._reranker is not None
                and self._model_path == model_path
                and self._device == target_device
            ):
                return

            self._reranker = self._build_reranker(model_path, target_device)
            self._model_path = model_path
            self._model_name = model_name
            self._device = target_device

    def rerank(
        self,
        query: str,
        texts: list[str],
        model_path: str,
        model_name: str,
        batch_size: int = 8,
        device_policy: str = "auto",
    ) -> dict[str, Any]:
        if not texts:
            return {
                "scores": [],
                "device": self._device,
                "model_name": self._model_name,
            }

        self.ensure_loaded(model_path, model_name, device_policy)

        pairs = [[query, text] for text in texts]
        try:
            raw_scores = self._reranker.compute_score(
                pairs,
                batch_size=max(1, int(batch_size or 8)),
                normalize=True,
            )
        except TypeError:
            raw_scores = self._reranker.compute_score(pairs)

        if not isinstance(raw_scores, list):
            raw_scores = [raw_scores]

        scores: list[float] = []
        for score in raw_scores:
            if isinstance(score, (int, float)):
                scores.append(float(score))
            else:
                scores.append(0.0)

        return {
            "scores": scores,
            "device": self._device,
            "model_name": self._model_name,
        }


rerank_runtime = RerankRuntime()

