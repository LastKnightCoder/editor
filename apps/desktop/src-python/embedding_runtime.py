"""
本地 embedding 运行时

职责：
- 懒加载 BGE-M3 模型（单例缓存）
- 按 devicePolicy 选择运行设备
- 提供文本向量化与健康检查
"""

from __future__ import annotations

import inspect
import threading
from typing import Any


class EmbeddingRuntime:
    """本地 embedding 运行时（线程安全）"""

    def __init__(self):
        self._model = None
        self._model_path: str | None = None
        self._model_name: str | None = None
        self._device: str = "cpu"
        self._dimensions: int = 0
        self._lock = threading.Lock()

    def _resolve_dimensions(self, model_name: str) -> int:
        """尽量在不执行 encode 的情况下获取向量维度"""
        model = self._model
        if model is None:
            return 0

        for attr in ("dim", "dimensions", "embedding_dim"):
            value = getattr(model, attr, None)
            if isinstance(value, int) and value > 0:
                return value

        model_config = getattr(model, "model", None)
        model_config = getattr(model_config, "config", None)
        if model_config is not None:
            for attr in ("hidden_size", "d_model"):
                value = getattr(model_config, attr, None)
                if isinstance(value, int) and value > 0:
                    return value

        if (model_name or "").lower() == "bge-m3":
            return 1024

        return 0

    def _resolve_device(self, device_policy: str) -> str:
        """解析设备策略"""
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

    def _validate_transformers_version(self) -> None:
        """校验 transformers 主版本，避免已知不兼容组合"""
        try:
            import transformers
        except Exception as exc:
            raise RuntimeError(
                "未检测到 transformers 依赖，请先安装 embedding 运行依赖。"
            ) from exc

        version = getattr(transformers, "__version__", "")
        major_text = version.split(".", 1)[0] if version else ""
        try:
            major = int(major_text)
        except ValueError:
            return

        if major >= 5:
            raise RuntimeError(
                f"检测到 transformers {version} 与 FlagEmbedding 不兼容，请安装 "
                "transformers<5（建议 4.57.1）。"
            )

    def _build_model(self, model_path: str, device: str):
        """创建 FlagEmbedding 模型实例（兼容不同版本参数）"""
        self._validate_transformers_version()

        try:
            from FlagEmbedding import BGEM3FlagModel
        except ImportError as exc:
            error_message = str(exc)
            if "is_torch_fx_available" in error_message:
                raise RuntimeError(
                    "检测到 transformers 5.x 与 FlagEmbedding 不兼容，请安装 "
                    "transformers<5（建议 4.57.1）。"
                ) from exc
            raise RuntimeError(f"加载 FlagEmbedding 失败：{error_message}") from exc

        init_signature = inspect.signature(BGEM3FlagModel.__init__)
        kwargs: dict[str, Any] = {
            "use_fp16": device == "cuda",
        }

        if "device" in init_signature.parameters:
            kwargs["device"] = device
        elif "devices" in init_signature.parameters:
            kwargs["devices"] = device

        return BGEM3FlagModel(model_path, **kwargs)

    def ensure_loaded(
        self,
        model_path: str,
        model_name: str,
        device_policy: str = "auto",
    ) -> None:
        """确保模型已加载"""
        target_device = self._resolve_device(device_policy)

        with self._lock:
            if (
                self._model is not None
                and self._model_path == model_path
                and self._device == target_device
            ):
                return

            self._model = self._build_model(model_path, target_device)
            self._model_path = model_path
            self._model_name = model_name
            self._device = target_device
            self._dimensions = self._resolve_dimensions(model_name)

    def encode(
        self,
        texts: list[str],
        model_path: str,
        model_name: str,
        batch_size: int = 8,
        device_policy: str = "auto",
    ) -> dict:
        """文本向量化"""
        if not texts:
            return {
                "embeddings": [],
                "dimensions": self._dimensions,
                "device": self._device,
            }

        self.ensure_loaded(model_path, model_name, device_policy)

        result = self._model.encode(
            texts,
            batch_size=max(1, int(batch_size or 8)),
        )

        dense_vectors = result.get("dense_vecs") if isinstance(result, dict) else result
        if dense_vectors is None:
            raise RuntimeError("Embedding result does not contain dense_vecs")

        embeddings: list[list[float]] = []
        for vector in dense_vectors:
            if hasattr(vector, "tolist"):
                vector = vector.tolist()
            embeddings.append(vector)

        if self._dimensions <= 0 and embeddings:
            self._dimensions = len(embeddings[0])

        return {
            "embeddings": embeddings,
            "dimensions": self._dimensions,
            "device": self._device,
        }

    def health(self) -> dict:
        """返回运行时健康状态"""
        return {
            "loaded": self._model is not None,
            "model_path": self._model_path,
            "model_name": self._model_name,
            "device": self._device,
            "dimensions": self._dimensions,
        }


embedding_runtime = EmbeddingRuntime()
