"""
转录处理器模块
处理音频转录相关的 RPC 请求
"""

import sys
import asyncio
from typing import Optional, Callable
from dataclasses import asdict
from pathlib import Path

from transcribe import AudioTranscriber


class TranscriptionHandler:
    """音频转录处理器"""

    def __init__(self):
        self.transcriber_cache: dict[str, AudioTranscriber] = {}

    async def handle_transcribe(self, params: dict, on_progress: Callable) -> dict:
        """
        处理转录请求
        
        参数：
            audioPath: 音频文件路径（必填）
            model: 模型大小 (tiny/base/small/medium/large-v1/large-v2/large-v3)
            language: 语言代码
            device: 设备类型 (cpu/cuda)
            computeType: 计算类型 (auto/int8/int16/float16/float32)
            wordTimestamps: 是否启用词级时间戳
            modelDir: 模型目录
            vadFilter: 是否启用 VAD 过滤
        """
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
            await on_progress({
                "type": "progress",
                "percentage": 0,
                "message": "Loading model..."
            })
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

    def get_handlers(self) -> dict:
        """返回该模块提供的处理器映射"""
        return {
            "transcribe": self.handle_transcribe,
        }
