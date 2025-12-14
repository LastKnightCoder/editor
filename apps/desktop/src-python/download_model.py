#!/usr/bin/env python3
"""
模型下载脚本 - 支持 ModelScope 和 HuggingFace

用法:
    python download_model.py modelscope pengzhendong/faster-whisper-base /path/to/models
    python download_model.py huggingface Systran/faster-whisper-base /path/to/models
    python download_model.py list  # 列出可用模型
"""

import sys
import json
import argparse
import os
from pathlib import Path
from typing import Optional

# 模型配置
MODELS = {
    "faster-whisper-tiny": {
        "modelscope": "pengzhendong/faster-whisper-tiny",
        "huggingface": "Systran/faster-whisper-tiny",
        "size": "75MB"
    },
    "faster-whisper-base": {
        "modelscope": "pengzhendong/faster-whisper-base",
        "huggingface": "Systran/faster-whisper-base",
        "size": "150MB"
    },
    "faster-whisper-small": {
        "modelscope": "pengzhendong/faster-whisper-small",
        "huggingface": "Systran/faster-whisper-small",
        "size": "500MB"
    },
    "faster-whisper-medium": {
        "modelscope": "pengzhendong/faster-whisper-medium",
        "huggingface": "Systran/faster-whisper-medium",
        "size": "1.5GB"
    },
    "faster-whisper-large-v1": {
        "modelscope": "pengzhendong/faster-whisper-large-v1",
        "huggingface": "Systran/faster-whisper-large-v1",
        "size": "3GB"
    },
    "faster-whisper-large-v2": {
        "modelscope": "pengzhendong/faster-whisper-large-v2",
        "huggingface": "Systran/faster-whisper-large-v2",
        "size": "3GB"
    },
    "faster-whisper-large-v3": {
        "modelscope": "pengzhendong/faster-whisper-large-v3",
        "huggingface": "Systran/faster-whisper-large-v3",
        "size": "3GB"
    }
}


class ProgressTracker:
    """进度跟踪器，用于输出下载进度"""

    def __init__(self):
        self.last_percentage = -1
        # 保存原始 stderr，避免被 redirect_stderr 影响
        self._original_stderr = sys.stderr

    def update(self, percentage: int, message: str = ""):
        # 只在百分比变化时输出，避免刷屏
        if percentage != self.last_percentage:
            self.last_percentage = percentage
            progress_info = {
                "type": "progress",
                "percentage": percentage,
                "message": message
            }
            # 使用原始 stderr，确保进度信息不会被重定向捕获
            print(json.dumps(progress_info, ensure_ascii=False), file=self._original_stderr)
            self._original_stderr.flush()


class JsonProgressBar:
    """自定义进度条类，输出 JSON 格式进度"""

    def __init__(self, *args, **kwargs):
        self.total = kwargs.get('total', 0)
        self.n = 0
        self.desc = kwargs.get('desc', '')
        self.tracker = kwargs.get('tracker', None)

    def update(self, n=1):
        self.n += n
        if self.total > 0 and self.tracker:
            percentage = int(self.n * 100 / self.total)
            self.tracker.update(percentage, f"下载中: {self.desc}")

    def close(self):
        pass

    def set_description(self, desc):
        self.desc = desc

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()


def download_from_modelscope(
    model_id: str,
    output_dir: str,
    progress_tracker: Optional[ProgressTracker] = None
) -> str:
    """
    从 ModelScope 下载模型（国内镜像）

    Args:
        model_id: 模型 ID (如 pengzhendong/faster-whisper-base)
        output_dir: 输出目录
        progress_tracker: 进度跟踪器

    Returns:
        下载的模型路径
    """
    try:
        from modelscope.hub.snapshot_download import snapshot_download
    except ImportError:
        raise ImportError(
            "modelscope is not installed. Run: pip install modelscope"
        )

    if progress_tracker:
        progress_tracker.update(0, "Downloading from ModelScope: " + model_id)

    # 模拟进度更新（ModelScope 不提供简单的进度回调）
    import threading
    import time
    import io
    import shutil
    from contextlib import redirect_stdout

    # 构建目标目录路径（与 HuggingFace 保持一致）
    model_name = model_id.split("/")[-1]
    target_dir = os.path.join(output_dir, model_name)

    stop_progress = threading.Event()
    current_progress = [5]  # 使用列表以便在闭包中修改

    def fake_progress():
        while not stop_progress.is_set() and current_progress[0] < 95:
            time.sleep(2)
            if not stop_progress.is_set():
                current_progress[0] = min(current_progress[0] + 5, 95)
                if progress_tracker:
                    progress_tracker.update(current_progress[0], "Downloading: " + model_id)

    progress_thread = threading.Thread(target=fake_progress, daemon=True)
    progress_thread.start()

    try:
        # 重定向 stdout 和 stderr 到 devnull，避免库的输出干扰我们的 JSON
        devnull = io.StringIO()
        from contextlib import redirect_stderr
        with redirect_stdout(devnull), redirect_stderr(devnull):
            # ModelScope 下载到临时缓存目录
            cache_dir = os.path.join(output_dir, ".modelscope_cache")
            model_dir = snapshot_download(
                model_id,
                cache_dir=cache_dir,
                revision='master'
            )

        # 复制文件到目标目录（与 HuggingFace 目录结构保持一致）
        if progress_tracker:
            progress_tracker.update(95, f"Copying files from {model_dir} to {target_dir}...")

        # 确保 model_dir 存在
        if not os.path.exists(model_dir):
            raise Exception(f"Downloaded model directory not found: {model_dir}")

        # 列出下载的文件
        downloaded_files = os.listdir(model_dir)
        if progress_tracker:
            progress_tracker.update(96, f"Found {len(downloaded_files)} files: {', '.join(downloaded_files[:5])}...")

        if os.path.exists(target_dir):
            shutil.rmtree(target_dir)

        # 尝试移动目录（更快），如果失败则复制
        try:
            shutil.move(model_dir, target_dir)
            if progress_tracker:
                progress_tracker.update(98, "Moved files successfully")
        except Exception as move_err:
            if progress_tracker:
                progress_tracker.update(97, f"Move failed ({move_err}), trying copy...")
            # 移动失败，尝试复制
            shutil.copytree(model_dir, target_dir)

        # 清理缓存目录
        try:
            if os.path.exists(cache_dir):
                shutil.rmtree(cache_dir)
        except Exception as cleanup_err:
            # 清理失败不影响主流程，只记录警告
            print(json.dumps({
                "type": "warning",
                "message": f"Failed to cleanup cache: {cleanup_err}"
            }, ensure_ascii=False), file=sys.stderr)

    except Exception as e:
        stop_progress.set()
        progress_thread.join(timeout=1)
        raise Exception(f"Download failed: {str(e)}")
    finally:
        stop_progress.set()
        progress_thread.join(timeout=1)

    if progress_tracker:
        progress_tracker.update(100, "Download completed")

    return target_dir


def download_from_huggingface(
    model_id: str,
    output_dir: str,
    progress_tracker: Optional[ProgressTracker] = None
) -> str:
    """
    从 HuggingFace 下载模型

    Args:
        model_id: 模型 ID (如 Systran/faster-whisper-base)
        output_dir: 输出目录
        progress_tracker: 进度跟踪器

    Returns:
        下载的模型路径
    """
    try:
        from huggingface_hub import snapshot_download
    except ImportError:
        raise ImportError(
            "huggingface_hub is not installed. Run: pip install huggingface-hub"
        )

    if progress_tracker:
        progress_tracker.update(0, "Downloading from HuggingFace: " + model_id)

    # 构建本地目录路径
    model_name = model_id.split("/")[-1]
    local_dir = os.path.join(output_dir, model_name)

    # 模拟进度更新（HuggingFace 的进度回调比较复杂）
    import threading
    import time
    import io
    from contextlib import redirect_stdout

    stop_progress = threading.Event()
    current_progress = [5]

    def fake_progress():
        while not stop_progress.is_set() and current_progress[0] < 95:
            time.sleep(2)
            if not stop_progress.is_set():
                current_progress[0] = min(current_progress[0] + 5, 95)
                if progress_tracker:
                    progress_tracker.update(current_progress[0], "Downloading: " + model_id)

    progress_thread = threading.Thread(target=fake_progress, daemon=True)
    progress_thread.start()

    try:
        # 重定向 stdout 和 stderr 到 devnull，避免库的输出干扰我们的 JSON
        devnull = io.StringIO()
        from contextlib import redirect_stderr
        with redirect_stdout(devnull), redirect_stderr(devnull):
            model_dir = snapshot_download(
                model_id,
                local_dir=local_dir,
                local_dir_use_symlinks=False
            )

        # 验证下载结果
        if progress_tracker:
            if os.path.exists(local_dir):
                files = os.listdir(local_dir)
                progress_tracker.update(98, f"Downloaded {len(files)} files to {local_dir}")
            else:
                progress_tracker.update(98, f"Download completed, verifying...")

    except Exception as e:
        stop_progress.set()
        progress_thread.join(timeout=1)
        raise Exception(f"HuggingFace download failed: {str(e)}")
    finally:
        stop_progress.set()
        progress_thread.join(timeout=1)

    if progress_tracker:
        progress_tracker.update(100, "Download completed")

    return model_dir


def check_model_downloaded(model_name: str, models_dir: str) -> bool:
    """
    检查模型是否已下载

    Args:
        model_name: 模型名称 (如 faster-whisper-base)
        models_dir: 模型目录

    Returns:
        是否已下载
    """
    model_path = Path(models_dir) / model_name
    model_bin = model_path / "model.bin"
    return model_bin.exists()


def get_downloaded_models(models_dir: str) -> list:
    """
    获取已下载的模型列表

    Args:
        models_dir: 模型目录

    Returns:
        已下载的模型名称列表
    """
    downloaded = []
    models_path = Path(models_dir)

    if not models_path.exists():
        return downloaded

    for model_name in MODELS.keys():
        if check_model_downloaded(model_name, models_dir):
            downloaded.append(model_name)

    return downloaded


def list_models(models_dir: Optional[str] = None) -> dict:
    """
    列出所有可用模型及其状态

    Args:
        models_dir: 模型目录（用于检查下载状态）

    Returns:
        模型信息字典
    """
    result = []

    for name, info in MODELS.items():
        model_info = {
            "name": name,
            "size": info["size"],
            "modelscope": info["modelscope"],
            "huggingface": info["huggingface"],
            "downloaded": False
        }

        if models_dir:
            model_info["downloaded"] = check_model_downloaded(name, models_dir)

        result.append(model_info)

    return {"models": result}


def delete_model(model_name: str, models_dir: str) -> bool:
    """
    删除已下载的模型

    Args:
        model_name: 模型名称
        models_dir: 模型目录

    Returns:
        是否删除成功
    """
    import shutil

    model_path = Path(models_dir) / model_name

    if not model_path.exists():
        return False

    shutil.rmtree(model_path)
    return True


def main():
    parser = argparse.ArgumentParser(
        description="Download Whisper models from ModelScope or HuggingFace"
    )

    subparsers = parser.add_subparsers(dest="command", help="Commands")

    # download 命令
    download_parser = subparsers.add_parser("download", help="Download a model")
    download_parser.add_argument(
        "source",
        choices=["modelscope", "huggingface"],
        help="Download source"
    )
    download_parser.add_argument(
        "model_id",
        help="Model ID (e.g., pengzhendong/faster-whisper-base)"
    )
    download_parser.add_argument(
        "output_dir",
        help="Output directory"
    )

    # list 命令
    list_parser = subparsers.add_parser("list", help="List available models")
    list_parser.add_argument(
        "--models-dir",
        default=None,
        help="Models directory (to check download status)"
    )

    # check 命令
    check_parser = subparsers.add_parser("check", help="Check if a model is downloaded")
    check_parser.add_argument(
        "model_name",
        help="Model name (e.g., faster-whisper-base)"
    )
    check_parser.add_argument(
        "models_dir",
        help="Models directory"
    )

    # delete 命令
    delete_parser = subparsers.add_parser("delete", help="Delete a downloaded model")
    delete_parser.add_argument(
        "model_name",
        help="Model name (e.g., faster-whisper-base)"
    )
    delete_parser.add_argument(
        "models_dir",
        help="Models directory"
    )

    # downloaded 命令
    downloaded_parser = subparsers.add_parser(
        "downloaded",
        help="Get list of downloaded models"
    )
    downloaded_parser.add_argument(
        "models_dir",
        help="Models directory"
    )

    args = parser.parse_args()

    try:
        if args.command == "download":
            progress_tracker = ProgressTracker()

            if args.source == "modelscope":
                model_dir = download_from_modelscope(
                    args.model_id,
                    args.output_dir,
                    progress_tracker
                )
            else:
                model_dir = download_from_huggingface(
                    args.model_id,
                    args.output_dir,
                    progress_tracker
                )

            result = {
                "success": True,
                "model_dir": model_dir
            }
            # 确保清空缓冲区后再输出 JSON
            sys.stdout.flush()
            print(json.dumps(result, ensure_ascii=False))
            sys.stdout.flush()

        elif args.command == "list":
            result = list_models(args.models_dir)
            print(json.dumps(result, ensure_ascii=False, indent=2))

        elif args.command == "check":
            is_downloaded = check_model_downloaded(args.model_name, args.models_dir)
            result = {
                "model_name": args.model_name,
                "downloaded": is_downloaded
            }
            print(json.dumps(result, ensure_ascii=False))

        elif args.command == "delete":
            success = delete_model(args.model_name, args.models_dir)
            result = {
                "success": success,
                "model_name": args.model_name
            }
            print(json.dumps(result, ensure_ascii=False))

        elif args.command == "downloaded":
            downloaded = get_downloaded_models(args.models_dir)
            result = {
                "downloaded_models": downloaded
            }
            print(json.dumps(result, ensure_ascii=False))

        else:
            parser.print_help()
            sys.exit(1)

    except Exception as e:
        error_result = {
            "success": False,
            "error": str(e)
        }
        print(json.dumps(error_result, ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    main()
