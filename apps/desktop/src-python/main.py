#!/usr/bin/env python3
"""
Python WebSocket 服务器入口
连接到 Electron 的 WebSocket 服务器，处理 RPC 请求

用法:
    python main.py --port 24678
    uv run python main.py --port 24678
"""

import sys
import json
import asyncio
import argparse
import traceback
from typing import Optional, Any

# 设置 CUDA 路径（在导入任何 CUDA 相关库之前）
from transcribe import setup_cuda_paths
setup_cuda_paths()

# 导入处理器模块
from handlers import (
    TranscriptionHandler,
    ModelHandler,
    MarkItDownHandler,
    TranscriptionOptimizer,
    EmbeddingHandler,
    QueryExpansionHandler,
    RerankHandler,
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

        # 初始化处理器
        self._transcription_handler = TranscriptionHandler()
        self._model_handler = ModelHandler()
        self._markitdown_handler = MarkItDownHandler()
        self._transcription_optimizer = TranscriptionOptimizer()
        self._embedding_handler = EmbeddingHandler()
        self._query_expansion_handler = QueryExpansionHandler()
        self._rerank_handler = RerankHandler()

        # 注册消息处理器（合并所有处理器提供的方法）
        self.handlers = {}
        self._register_handlers()

    def _register_handlers(self):
        """注册所有处理器"""
        handler_modules = [
            self._transcription_handler,
            self._model_handler,
            self._markitdown_handler,
            self._transcription_optimizer,
            self._embedding_handler,
            self._query_expansion_handler,
            self._rerank_handler,
        ]

        for module in handler_modules:
            self.handlers.update(module.get_handlers())

        print(f"[PythonServer] Registered {len(self.handlers)} handlers: {list(self.handlers.keys())}", file=sys.stderr)

    async def connect(self):
        """连接到 WebSocket 服务器"""
        import websockets

        print(f"[PythonServer] Connecting to {self.ws_url}", file=sys.stderr)

        while self.running:
            try:
                async with websockets.connect(self.ws_url) as ws:
                    self.ws = ws
                    print("[PythonServer] Connected to WebSocket server", file=sys.stderr)
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
