"""
模型管理处理器模块
处理模型下载、检查、删除等相关的 RPC 请求
"""

import sys
import asyncio
from typing import Callable

from download_model import (
    download_from_modelscope,
    download_from_huggingface,
    check_model_downloaded,
    get_downloaded_models,
    list_models,
    delete_model,
)


class ModelHandler:
    """模型管理处理器"""

    def __init__(self):
        self.cancelled_downloads: set[str] = set()

    async def handle_download_model(self, params: dict, on_progress: Callable) -> dict:
        """
        处理模型下载请求
        
        参数：
            source: 下载源 (modelscope/huggingface)
            modelId: 模型 ID
            outputDir: 输出目录
        """
        source = params.get("source")
        model_id = params.get("modelId")
        output_dir = params.get("outputDir")

        if not source or not model_id or not output_dir:
            raise ValueError("source, modelId, and outputDir are required")

        # 从取消列表中移除（如果存在）
        download_key = f"{source}:{model_id}"
        self.cancelled_downloads.discard(download_key)

        # 获取当前事件循环
        loop = asyncio.get_running_loop()

        # 创建进度跟踪器（线程安全）
        class AsyncProgressTracker:
            def __init__(tracker_self, callback, handler, key, event_loop):
                tracker_self.callback = callback
                tracker_self.handler = handler
                tracker_self.key = key
                tracker_self.loop = event_loop
                tracker_self.last_percentage = -1

            def update(tracker_self, percentage: int, message: str = ""):
                # 检查是否已取消
                if tracker_self.key in tracker_self.handler.cancelled_downloads:
                    raise InterruptedError("Download cancelled")
                if percentage != tracker_self.last_percentage:
                    tracker_self.last_percentage = percentage
                    # 从线程中安全地调度异步任务
                    tracker_self.loop.call_soon_threadsafe(
                        lambda: asyncio.create_task(tracker_self.callback({
                            "type": "progress",
                            "percentage": percentage,
                            "message": message
                        }))
                    )

        tracker = AsyncProgressTracker(on_progress, self, download_key, loop)

        try:
            if source == "modelscope":
                model_dir = await loop.run_in_executor(
                    None,
                    lambda: download_from_modelscope(model_id, output_dir, tracker)
                )
            elif source == "huggingface":
                model_dir = await loop.run_in_executor(
                    None,
                    lambda: download_from_huggingface(model_id, output_dir, tracker)
                )
            else:
                raise ValueError(f"Unknown source: {source}")

            # 下载完成后检查是否被取消
            if download_key in self.cancelled_downloads:
                self.cancelled_downloads.discard(download_key)
                return {
                    "success": False,
                    "error": "Download cancelled"
                }

            return {
                "success": True,
                "model_dir": model_dir
            }
        except InterruptedError:
            self.cancelled_downloads.discard(download_key)
            return {
                "success": False,
                "error": "Download cancelled"
            }
        finally:
            self.cancelled_downloads.discard(download_key)

    async def handle_cancel_download(self, params: dict, on_progress: Callable) -> dict:
        """处理取消下载请求"""
        source = params.get("source")
        model_id = params.get("modelId")

        if not source or not model_id:
            raise ValueError("source and modelId are required")

        download_key = f"{source}:{model_id}"
        self.cancelled_downloads.add(download_key)

        print(f"[ModelHandler] Download cancelled: {download_key}", file=sys.stderr)

        return {
            "success": True,
            "message": f"Download {download_key} marked for cancellation"
        }

    async def handle_list_models(self, params: dict, on_progress: Callable) -> dict:
        """处理列出模型请求"""
        models_dir = params.get("modelsDir")
        result = list_models(models_dir)
        return result

    async def handle_check_model(self, params: dict, on_progress: Callable) -> dict:
        """处理检查模型请求"""
        model_name = params.get("modelName")
        models_dir = params.get("modelsDir")

        if not model_name or not models_dir:
            raise ValueError("modelName and modelsDir are required")

        is_downloaded = check_model_downloaded(model_name, models_dir)
        return {
            "model_name": model_name,
            "downloaded": is_downloaded
        }

    async def handle_delete_model(self, params: dict, on_progress: Callable) -> dict:
        """处理删除模型请求"""
        model_name = params.get("modelName")
        models_dir = params.get("modelsDir")

        if not model_name or not models_dir:
            raise ValueError("modelName and modelsDir are required")

        success = delete_model(model_name, models_dir)
        return {
            "success": success,
            "model_name": model_name
        }

    async def handle_get_downloaded_models(self, params: dict, on_progress: Callable) -> dict:
        """处理获取已下载模型列表请求"""
        models_dir = params.get("modelsDir")

        if not models_dir:
            raise ValueError("modelsDir is required")

        downloaded = get_downloaded_models(models_dir)
        return {
            "downloaded_models": downloaded
        }

    def get_handlers(self) -> dict:
        """返回该模块提供的处理器映射"""
        return {
            "download_model": self.handle_download_model,
            "cancel_download": self.handle_cancel_download,
            "list_models": self.handle_list_models,
            "check_model": self.handle_check_model,
            "delete_model": self.handle_delete_model,
            "get_downloaded_models": self.handle_get_downloaded_models,
        }
