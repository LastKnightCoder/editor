#!/usr/bin/env python3
"""
音频转录脚本 - 基于 Faster-Whisper
支持词级时间戳、智能断句、多种输出格式

用法:
    python transcribe.py audio.mp3 --model base --language zh
    python transcribe.py audio.mp3 --model base --word-timestamps
    python transcribe.py audio.mp3 --model large-v3 --device cuda
"""

import sys
import os
import json
import argparse
import time
from dataclasses import dataclass, asdict
from typing import List, Optional
from pathlib import Path


def setup_cuda_paths():
    """
    在 Windows 上设置 CUDA DLL 路径
    nvidia-cudnn-cu12 和 nvidia-cublas-cu12 的 DLL 文件在 site-packages 中，
    需要添加到 PATH 才能被找到
    """
    if sys.platform != "win32":
        return

    try:
        import site
        site_packages = site.getsitepackages()

        # 可能的 DLL 路径
        dll_paths = []
        for sp in site_packages:
            sp_path = Path(sp)
            # nvidia-cudnn-cu12
            cudnn_bin = sp_path / "nvidia" / "cudnn" / "bin"
            if cudnn_bin.exists():
                dll_paths.append(str(cudnn_bin))
            # nvidia-cublas-cu12
            cublas_bin = sp_path / "nvidia" / "cublas" / "bin"
            if cublas_bin.exists():
                dll_paths.append(str(cublas_bin))
            # nvidia-cuda-runtime-cu12
            cuda_runtime_bin = sp_path / "nvidia" / "cuda_runtime" / "bin"
            if cuda_runtime_bin.exists():
                dll_paths.append(str(cuda_runtime_bin))
            # nvidia-cufft-cu12
            cufft_bin = sp_path / "nvidia" / "cufft" / "bin"
            if cufft_bin.exists():
                dll_paths.append(str(cufft_bin))

        if dll_paths:
            # 添加到 PATH 环境变量
            current_path = os.environ.get("PATH", "")
            new_paths = ";".join(dll_paths)
            os.environ["PATH"] = f"{new_paths};{current_path}"
            print(f"Added CUDA DLL paths: {dll_paths}", file=sys.stderr)

            # Python 3.8+ 还需要使用 os.add_dll_directory
            if hasattr(os, "add_dll_directory"):
                for dll_path in dll_paths:
                    try:
                        os.add_dll_directory(dll_path)
                    except OSError:
                        pass

    except Exception as e:
        print(f"Warning: Failed to setup CUDA paths: {e}", file=sys.stderr)


# 在导入任何 CUDA 相关库之前设置路径
setup_cuda_paths()


@dataclass
class TranscriptionSegment:
    """转录片段"""
    text: str
    start: int  # 毫秒
    end: int    # 毫秒


@dataclass
class TranscriptionResult:
    """转录结果"""
    text: str
    language: str
    language_probability: float
    duration: float
    processing_time: float
    segments: List[TranscriptionSegment]
    word_segments: Optional[List[TranscriptionSegment]] = None


class AudioTranscriber:
    """音频转录器"""

    def __init__(
        self,
        model_size: str = "base",
        device: str = "cpu",
        compute_type: str = "auto",
        model_dir: Optional[str] = None
    ):
        """
        初始化转录器

        Args:
            model_size: 模型大小 (tiny/base/small/medium/large-v3)
            device: 计算设备 (cpu/cuda)
            compute_type: 计算类型 (int8/int16/float16/float32/auto)
            model_dir: 模型目录路径
        """
        # 延迟导入，避免启动时间过长
        from faster_whisper import WhisperModel

        print(f"Loading model: {model_size}...", file=sys.stderr)
        start_time = time.time()

        # 自动选择计算类型
        if compute_type == "auto":
            if device == "cuda":
                compute_type = "float16"  # GPU 上 float16 最快
            else:
                compute_type = "int8"  # CPU 上 int8 最快

        print(f"Device: {device}, Compute type: {compute_type}", file=sys.stderr)

        # 检查本地模型是否存在
        model_path = None
        if model_dir:
            # 尝试查找本地下载的模型
            local_model_path = Path(model_dir) / f"faster-whisper-{model_size}"
            if local_model_path.exists() and (local_model_path / "model.bin").exists():
                model_path = str(local_model_path)
                print(f"Using local model: {model_path}", file=sys.stderr)

        if model_path:
            # 使用本地模型路径
            self.model = WhisperModel(
                model_path,
                device=device,
                compute_type=compute_type,
            )
        else:
            # 使用模型名称（会从 HuggingFace 下载）
            self.model = WhisperModel(
                model_size,
                device=device,
                compute_type=compute_type,
                download_root=model_dir
            )

        load_time = time.time() - start_time
        print(f"Model loaded in {load_time:.2f}s", file=sys.stderr)

    def transcribe(
        self,
        audio_path: str,
        language: Optional[str] = None,
        word_timestamps: bool = False,
        vad_filter: bool = True,
        vad_parameters: Optional[dict] = None,
        on_progress: Optional[callable] = None
    ) -> TranscriptionResult:
        """
        转录音频文件

        Args:
            audio_path: 音频文件路径
            language: 语言代码 (zh/en/etc.)，None 为自动检测
            word_timestamps: 是否生成词级时间戳
            vad_filter: 是否启用 VAD 过滤
            vad_parameters: VAD 参数
            on_progress: 进度回调函数，接收一个 0-100 的整数参数

        Returns:
            TranscriptionResult: 转录结果
        """
        if not Path(audio_path).exists():
            raise FileNotFoundError(f"Audio file not found: {audio_path}")

        print(f"Transcribing: {audio_path}", file=sys.stderr)
        start_time = time.time()

        # 默认 VAD 参数
        if vad_parameters is None:
            vad_parameters = {
                "min_silence_duration_ms": 500,
                "speech_pad_ms": 200
            }

        # 执行转录
        segments_generator, info = self.model.transcribe(
            audio_path,
            language=language,
            vad_filter=vad_filter,
            vad_parameters=vad_parameters,
            word_timestamps=word_timestamps
        )

        # 收集结果
        result_segments = []
        word_segments = [] if word_timestamps else None
        full_text_parts = []
        segment_count = 0
        duration = info.duration  # 音频总时长（秒）
        last_progress = -1

        for segment in segments_generator:
            segment_count += 1

            # 句级时间戳
            result_segments.append(TranscriptionSegment(
                text=segment.text.strip(),
                start=int(segment.start * 1000),
                end=int(segment.end * 1000)
            ))
            full_text_parts.append(segment.text.strip())

            # 词级时间戳
            if word_timestamps and segment.words:
                for word in segment.words:
                    word_segments.append(TranscriptionSegment(
                        text=word.word.strip(),
                        start=int(word.start * 1000),
                        end=int(word.end * 1000)
                    ))

            # 输出百分比进度（基于已处理的时间占总时长的比例）
            if duration > 0:
                progress = min(int((segment.end / duration) * 100), 99)
                if progress != last_progress:
                    last_progress = progress
                    print(f"{progress}%", file=sys.stderr)
                    if on_progress:
                        on_progress(progress)

        processing_time = time.time() - start_time
        full_text = " ".join(full_text_parts)

        print(f"Transcription completed in {processing_time:.2f}s", file=sys.stderr)
        print(f"Detected language: {info.language} ({info.language_probability:.2%})", file=sys.stderr)

        return TranscriptionResult(
            text=full_text,
            language=info.language,
            language_probability=info.language_probability,
            duration=info.duration,
            processing_time=processing_time,
            segments=result_segments,
            word_segments=word_segments
        )


def to_srt_time(ms: int) -> str:
    """将毫秒转换为 SRT 时间格式 (HH:MM:SS,mmm)"""
    total_seconds, milliseconds = divmod(ms, 1000)
    minutes, seconds = divmod(total_seconds, 60)
    hours, minutes = divmod(minutes, 60)
    return f"{int(hours):02}:{int(minutes):02}:{int(seconds):02},{int(milliseconds):03}"


def to_vtt_time(ms: int) -> str:
    """将毫秒转换为 VTT 时间格式 (HH:MM:SS.mmm)"""
    return to_srt_time(ms).replace(",", ".")


def export_srt(segments: List[TranscriptionSegment]) -> str:
    """导出 SRT 格式"""
    lines = []
    for i, seg in enumerate(segments, 1):
        lines.append(str(i))
        lines.append(f"{to_srt_time(seg.start)} --> {to_srt_time(seg.end)}")
        lines.append(seg.text)
        lines.append("")
    return "\n".join(lines)


def export_vtt(segments: List[TranscriptionSegment]) -> str:
    """导出 VTT 格式"""
    lines = ["WEBVTT", ""]
    for seg in segments:
        lines.append(f"{to_vtt_time(seg.start)} --> {to_vtt_time(seg.end)}")
        lines.append(seg.text)
        lines.append("")
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="Audio transcription using Faster-Whisper"
    )
    parser.add_argument(
        "audio_path",
        help="Path to audio file"
    )
    parser.add_argument(
        "--model", "-m",
        default="base",
        choices=["tiny", "base", "small", "medium", "large-v1", "large-v2", "large-v3"],
        help="Model size (default: base)"
    )
    parser.add_argument(
        "--language", "-l",
        default=None,
        help="Language code (zh/en/etc.), auto-detect if not specified"
    )
    parser.add_argument(
        "--device", "-d",
        default="cpu",
        choices=["cpu", "cuda"],
        help="Compute device (default: cpu)"
    )
    parser.add_argument(
        "--compute-type",
        default="int8",
        choices=["int8", "int16", "float16", "float32"],
        help="Compute type (default: int8)"
    )
    parser.add_argument(
        "--word-timestamps", "-w",
        action="store_true",
        help="Generate word-level timestamps"
    )
    parser.add_argument(
        "--model-dir",
        default=None,
        help="Custom model directory"
    )
    parser.add_argument(
        "--output-format", "-o",
        default="json",
        choices=["json", "srt", "vtt", "text"],
        help="Output format (default: json)"
    )
    parser.add_argument(
        "--no-vad",
        action="store_true",
        help="Disable VAD filter"
    )

    args = parser.parse_args()

    try:
        # 创建转录器
        transcriber = AudioTranscriber(
            model_size=args.model,
            device=args.device,
            compute_type=args.compute_type,
            model_dir=args.model_dir
        )

        # 执行转录
        result = transcriber.transcribe(
            args.audio_path,
            language=args.language,
            word_timestamps=args.word_timestamps,
            vad_filter=not args.no_vad
        )

        # 输出结果
        if args.output_format == "json":
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
            print(json.dumps(output, ensure_ascii=False, indent=2))

        elif args.output_format == "srt":
            print(export_srt(result.segments))

        elif args.output_format == "vtt":
            print(export_vtt(result.segments))

        elif args.output_format == "text":
            print(result.text)

    except FileNotFoundError as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False), file=sys.stdout)
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False), file=sys.stdout)
        sys.exit(1)


if __name__ == "__main__":
    main()
