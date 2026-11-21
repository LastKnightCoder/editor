"""Build the Apple Silicon Qwen runtime on macOS with Python 3.12+."""

import gzip
import hashlib
import json
import os
import platform
import shutil
import subprocess
import tarfile
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "apps/desktop/release/qwen-runtime"
LOCK = ROOT / "apps/desktop/src-electron/main/services/qwen/requirements.txt"
PYTHON_RELEASE = "https://github.com/astral-sh/python-build-standalone/releases/download/20251209/cpython-3.12.12%2B20251209-aarch64-apple-darwin-install_only_stripped.tar.gz"
PYTHON_SHA = "7e162bf77f6c2ecd7602960162c1b867eb61ac348863546e66db632b5731a5ea"
NOTICES_URL = "https://codeload.github.com/astral-sh/python-build-standalone/tar.gz/refs/tags/20251209"
NOTICES_SHA = "ca563684f7a8829c1fc0cd3e73b66e2788381b5c047e21476333b8e856b09023"


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def fetch(name, url, checksum):
    path = OUTPUT / name
    if not path.exists() or digest(path) != checksum:
        subprocess.run(["curl", "--fail", "--location", "--retry", "3", "--output", path, url], check=True)
    if digest(path) != checksum:
        raise ValueError(f"上游文件校验失败 {name}")
    return path


def assemble(root):
    with tarfile.open(fetch("upstream.tar.gz", PYTHON_RELEASE, PYTHON_SHA)) as archive:
        archive.extractall(root, filter="data")
    python_dir = root / "python"
    python = python_dir / "bin/python3.12"
    wheels = OUTPUT / "wheels"
    wheels.mkdir(exist_ok=True)
    selection = ["--platform", "macosx_14_0_arm64", "--only-binary=:all:", "--require-hashes", "--no-deps", "-r", LOCK]
    pip = [python, "-I", "-B", "-m", "pip", "--isolated", "--disable-pip-version-check"]
    subprocess.run([*pip, "download", "--dest", wheels, *selection], check=True)
    installed = root / "dependencies"
    subprocess.run([*pip, "install", "--no-index", "--find-links", wheels, "--no-compile", "--target", installed, *selection], check=True)
    # The worker uses Python imports. pip's generated CLI scripts have build-machine shebangs.
    for item in installed.iterdir():
        if item.name != "bin":
            shutil.move(item, python_dir / "lib/python3.12/site-packages" / item.name)
    notices = python_dir / "share/licenses/python-build-standalone"
    notices.mkdir(parents=True)
    with tarfile.open(fetch("upstream-notices.tar.gz", NOTICES_URL, NOTICES_SHA)) as archive:
        for member in archive:
            name = Path(member.name)
            if member.isfile() and len(name.parts) == 2 and name.name.startswith("LICENSE"):
                (notices / name.name).write_bytes(archive.extractfile(member).read())
    subprocess.run([python, "-I", "-B", "-m", "pip", "check"], check=True)
    subprocess.run([python, "-I", "-B", "-c", "import mlx.core as mx, mlx_qwen3_asr, nagisa, soynlp; mx.eval(mx.ones(1))"], check=True)
    return python_dir


def archive_runtime(python_dir, output):
    # Normalize metadata and exclude bytecode carrying build paths.
    with output.open("wb") as raw, gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0, compresslevel=6) as gz:
        with tarfile.open(mode="w|", fileobj=gz) as tar:
            for item in sorted(python_dir.rglob("*")):
                relative = item.relative_to(python_dir.parent)
                if "__pycache__" in relative.parts or item.suffix in {".pyc", ".pyo"}:
                    continue
                if item.is_symlink() and (os.path.isabs(os.readlink(item)) or not item.resolve(strict=True).is_relative_to(python_dir)):
                    raise ValueError(f"运行包链接指向外部 {relative}")
                info = tar.gettarinfo(item, str(relative))
                info.uid = info.gid = info.mtime = 0
                info.uname = info.gname = ""
                if info.isfile():
                    with item.open("rb") as data:
                        tar.addfile(info, data)
                else:
                    tar.addfile(info)


def main():
    if platform.system() != "Darwin" or platform.machine() != "arm64":
        raise SystemExit("请在 Apple Silicon Mac 上构建运行包")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=OUTPUT) as staging:
        root = Path(staging)
        archive = root / "runtime.tar.gz"
        archive_runtime(assemble(root), archive)
        sha = digest(archive)
        manifest = {"sha256": sha, "bytes": archive.stat().st_size, "requirementsSha256": digest(LOCK)}
        archive.replace(OUTPUT / f"{sha}.tar.gz")
        temp_manifest = root / "bundle.json"
        temp_manifest.write_text(json.dumps(manifest, indent=2) + "\n")
        temp_manifest.replace(OUTPUT / "bundle.json")
        print(OUTPUT / f"{sha}.tar.gz")


if __name__ == "__main__":
    main()
