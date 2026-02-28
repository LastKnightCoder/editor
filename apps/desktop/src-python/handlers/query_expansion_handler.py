"""
查询扩展处理器
"""

from __future__ import annotations

import asyncio
import os
from typing import Callable

from query_expansion_runtime import query_expansion_runtime


class QueryExpansionHandler:
    """本地查询扩展 RPC 处理器"""

    async def handle_expand_query(self, params: dict, on_progress: Callable) -> dict:
        query = params.get("query", "")
        model_dir = params.get("modelDir")
        model_name = params.get("modelName")
        max_alternatives = params.get("maxAlternatives", 2)
        device_policy = params.get("devicePolicy", "auto")

        if not isinstance(query, str) or not query.strip():
            return {
                "available": False,
                "reason": "query is required",
                "expansions": [],
            }

        if not model_dir or not model_name:
            return {
                "available": False,
                "reason": "modelDir and modelName are required",
                "expansions": [],
            }

        model_path = os.path.join(model_dir, model_name)
        if not os.path.exists(model_path):
            return {
                "available": False,
                "reason": f"query expansion model not found: {model_path}",
                "expansions": [],
            }

        await on_progress(
            {
                "type": "progress",
                "percentage": 5,
                "message": "准备执行查询扩展...",
            }
        )

        loop = asyncio.get_running_loop()
        try:
            result = await loop.run_in_executor(
                None,
                lambda: query_expansion_runtime.expand(
                    query=query,
                    model_path=model_path,
                    model_name=model_name,
                    max_alternatives=int(max_alternatives or 2),
                    device_policy=device_policy,
                ),
            )
        except Exception as exc:
            return {
                "available": False,
                "reason": str(exc),
                "expansions": [],
            }

        await on_progress(
            {
                "type": "progress",
                "percentage": 100,
                "message": "查询扩展完成",
            }
        )

        return result

    def get_handlers(self) -> dict:
        return {
            "expand_query": self.handle_expand_query,
        }
