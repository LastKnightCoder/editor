#!/usr/bin/env python3
"""
Python WebSocket 服务器入口
连接到 Electron 的 WebSocket 服务器，处理 RPC 请求

用法:
    python main.py --port 24678
    uv run python main.py --port 24678
"""

import sys
import os
import json
import asyncio
import argparse
import traceback
from typing import Optional, Callable, Any
from dataclasses import asdict

# 设置 CUDA 路径（在导入任何 CUDA 相关库之前）
from transcribe import setup_cuda_paths, AudioTranscriber, TranscriptionResult
setup_cuda_paths()

from download_model import (
    download_from_modelscope,
    download_from_huggingface,
    check_model_downloaded,
    get_downloaded_models,
    list_models,
    delete_model,
    ProgressTracker,
)


class RpcMessageType:
    """RPC 消息类型"""
    Request = "JsonRpcRequest"
    Response = "JsonRpcResponse"
    Notification = "JsonRpcNotification"
    Ping = "ping"
    Pong = "pong"


class PythonServer:
    """Python WebSocket 服务器"""

    def __init__(self, port: int):
        self.port = port
        self.ws_url = f"ws://localhost:{port}/python-server?isServer=true"
        self.ws = None
        self.running = False
        self.transcriber_cache: dict[str, AudioTranscriber] = {}
        self.cancelled_downloads: set[str] = set()  # 已取消的下载任务
        
        # 注册消息处理器
        self.handlers = {
            "transcribe": self.handle_transcribe,
            "download_model": self.handle_download_model,
            "cancel_download": self.handle_cancel_download,
            "list_models": self.handle_list_models,
            "check_model": self.handle_check_model,
            "delete_model": self.handle_delete_model,
            "get_downloaded_models": self.handle_get_downloaded_models,
        }

    async def connect(self):
        """连接到 WebSocket 服务器"""
        import websockets
        
        print(f"[PythonServer] Connecting to {self.ws_url}", file=sys.stderr)
        
        while self.running:
            try:
                async with websockets.connect(self.ws_url) as ws:
                    self.ws = ws
                    print(f"[PythonServer] Connected to WebSocket server", file=sys.stderr)
                    await self.message_loop()
            except Exception as e:
                print(f"[PythonServer] Connection error: {e}", file=sys.stderr)
                if self.running:
                    print("[PythonServer] Reconnecting in 2 seconds...", file=sys.stderr)
                    await asyncio.sleep(2)

    async def message_loop(self):
        """消息处理循环"""
        try:
            async for message in self.ws:
                try:
                    msg = json.loads(message)
                    await self.handle_message(msg)
                except json.JSONDecodeError as e:
                    print(f"[PythonServer] Invalid JSON: {e}", file=sys.stderr)
                except Exception as e:
                    print(f"[PythonServer] Error handling message: {e}", file=sys.stderr)
                    traceback.print_exc(file=sys.stderr)
        except Exception as e:
            print(f"[PythonServer] Message loop error: {e}", file=sys.stderr)

    async def handle_message(self, msg: dict):
        """处理收到的消息"""
        msg_type = msg.get("type")
        
        if msg_type == RpcMessageType.Ping:
            await self.send_message({"type": RpcMessageType.Pong})
            return
        
        if msg_type == RpcMessageType.Request:
            await self.handle_request(msg)
            return
        
        print(f"[PythonServer] Unknown message type: {msg_type}", file=sys.stderr)

    async def handle_request(self, msg: dict):
        """处理 RPC 请求"""
        msg_id = msg.get("id")
        method = msg.get("method")
        params = msg.get("params", {})
        
        print(f"[PythonServer] Handling request: {method}", file=sys.stderr)
        
        handler = self.handlers.get(method)
        if not handler:
            await self.send_response(msg_id, method, None, {
                "code": -32601,
                "message": f"Method not found: {method}"
            })
            return
        
        try:
            # 创建进度回调
            async def on_progress(data: dict):
                await self.send_notification(f"{method}:progress", {
                    "requestId": msg_id,
                    **data
                })
            
            result = await handler(params, on_progress)
            await self.send_response(msg_id, method, result, None)
        except Exception as e:
            print(f"[PythonServer] Handler error: {e}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            await self.send_response(msg_id, method, None, {
                "code": -32000,
                "message": str(e)
            })

    async def send_message(self, msg: dict):
        """发送消息"""
        if self.ws:
            await self.ws.send(json.dumps(msg, ensure_ascii=False))

    async def send_response(self, msg_id: str, method: str, result: Any, error: Optional[dict]):
        """发送 RPC 响应"""
        response = {
            "id": msg_id,
            "type": RpcMessageType.Response,
            "method": method,
            "result": result,
            "error": error
        }
        await self.send_message(response)

    async def send_notification(self, method: str, data: Any):
        """发送通知"""
        notification = {
            "type": RpcMessageType.Notification,
            "method": method,
            "data": data
        }
        await self.send_message(notification)

    # ==================== 请求处理器 ====================

    async def handle_transcribe(self, params: dict, on_progress: Callable) -> dict:
        """处理转录请求"""
        audio_path = params.get("audioPath")
        model_size = params.get("model", "base")
        language = params.get("language")
        device = params.get("device", "cpu")
        compute_type = params.get("computeType", "auto")
        word_timestamps = params.get("wordTimestamps", False)
        model_dir = params.get("modelDir")
        vad_filter = params.get("vadFilter", True)
        
        if not audio_path:
            raise ValueError("audioPath is required")
        
        # 获取或创建转录器（缓存以复用模型）
        cache_key = f"{model_size}:{device}:{compute_type}:{model_dir}"
        if cache_key not in self.transcriber_cache:
            await on_progress({"type": "progress", "percentage": 0, "message": "Loading model..."})
            self.transcriber_cache[cache_key] = AudioTranscriber(
                model_size=model_size,
                device=device,
                compute_type=compute_type,
                model_dir=model_dir
            )
        
        transcriber = self.transcriber_cache[cache_key]
        
        # 获取当前事件循环
        loop = asyncio.get_running_loop()
        
        # 创建进度跟踪（线程安全）
        last_progress = [0]
        
        def progress_callback(progress: int):
            if progress != last_progress[0]:
                last_progress[0] = progress
                # 从线程中安全地调度异步任务
                loop.call_soon_threadsafe(
                    lambda: asyncio.create_task(on_progress({
                        "type": "progress",
                        "percentage": progress,
                        "message": f"Transcribing... {progress}%"
                    }))
                )
        
        # 执行转录（在线程池中运行以避免阻塞）
        result = await loop.run_in_executor(
            None,
            lambda: self._do_transcribe(
                transcriber, audio_path, language, 
                word_timestamps, vad_filter, progress_callback
            )
        )
        
        return result

    def _do_transcribe(
        self,
        transcriber: AudioTranscriber,
        audio_path: str,
        language: Optional[str],
        word_timestamps: bool,
        vad_filter: bool,
        progress_callback: Callable[[int], None]
    ) -> dict:
        """执行实际的转录工作"""
        from pathlib import Path
        
        if not Path(audio_path).exists():
            raise FileNotFoundError(f"Audio file not found: {audio_path}")
        
        # 执行转录
        result = transcriber.transcribe(
            audio_path,
            language=language,
            word_timestamps=word_timestamps,
            vad_filter=vad_filter,
            on_progress=progress_callback
        )
        
        # 转换结果为字典
        output = {
            "text": result.text,
            "language": result.language,
            "language_probability": result.language_probability,
            "duration": result.duration,
            "processing_time": result.processing_time,
            "segments": [asdict(s) for s in result.segments],
        }
        if result.word_segments:
            output["word_segments"] = [asdict(s) for s in result.word_segments]

        return output

    async def handle_download_model(self, params: dict, on_progress: Callable) -> dict:
        """处理模型下载请求"""
        source = params.get("source")  # "modelscope" or "huggingface"
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
            def __init__(self, callback, server, key, event_loop):
                self.callback = callback
                self.server = server
                self.key = key
                self.loop = event_loop
                self.last_percentage = -1
            
            def update(self, percentage: int, message: str = ""):
                # 检查是否已取消
                if self.key in self.server.cancelled_downloads:
                    raise InterruptedError("Download cancelled")
                if percentage != self.last_percentage:
                    self.last_percentage = percentage
                    # 从线程中安全地调度异步任务
                    self.loop.call_soon_threadsafe(
                        lambda: asyncio.create_task(self.callback({
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
        
        print(f"[PythonServer] Download cancelled: {download_key}", file=sys.stderr)
        
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

    async def start(self):
        """启动服务器"""
        self.running = True
        await self.connect()

    def stop(self):
        """停止服务器"""
        self.running = False
        if self.ws:
            asyncio.create_task(self.ws.close())


async def main():
    parser = argparse.ArgumentParser(description="Python WebSocket Server for Tau")
    parser.add_argument(
        "--port", "-p",
        type=int,
        default=24678,
        help="WebSocket server port (default: 24678)"
    )
    
    args = parser.parse_args()
    
    server = PythonServer(args.port)
    
    try:
        await server.start()
    except KeyboardInterrupt:
        print("\n[PythonServer] Shutting down...", file=sys.stderr)
        server.stop()


if __name__ == "__main__":
    asyncio.run(main())
