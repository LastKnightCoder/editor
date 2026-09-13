#!/usr/bin/env bash
# 一键构建 release APK 并安装到已连接的设备
# 用法: pnpm apk  （或 bash scripts/android-release-install.sh）
set -euo pipefail

# 尊重外部已设置的环境变量，未设置时回退到本机默认路径，避免换机后脚本直接失效
if [[ "$(uname -s)" == "Darwin" ]]; then
  # macOS：未装独立 JDK 时回退 Android Studio 自带的 JBR；路径无需 cygpath 转换
  if [[ -z "${JAVA_HOME:-}" ]]; then
    JAVA_HOME="$(/usr/libexec/java_home 2>/dev/null || true)"
    JBR_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
    if [[ -z "${JAVA_HOME}" && -d "${JBR_HOME}" ]]; then
      JAVA_HOME="${JBR_HOME}"
    fi
  fi
  : "${ANDROID_HOME:=$HOME/Library/Android/sdk}"
  to_bash_path() { printf '%s' "$1"; }
  to_tool_path() { printf '%s' "$1"; }
  ADB_NAME="adb"
else
  : "${JAVA_HOME:=C:\Program Files\Java\jdk-23}"
  : "${ANDROID_HOME:=C:\Users\pc\AppData\Local\Android\Sdk}"
  to_bash_path() { cygpath -u "$1"; }
  to_tool_path() { cygpath -w "$1"; }
  ADB_NAME="adb.exe"
fi
[[ -n "${JAVA_HOME}" ]] || { echo "未找到 JDK，请设置 JAVA_HOME。"; exit 1; }
export JAVA_HOME ANDROID_HOME
if [[ -z "${NDK_HOME:-}" ]]; then
  # 自动选取 NDK 目录下版本号最高的已安装版本，避免硬编码版本号随 NDK 升级失效
  NDK_HOME="$(ls -1d "$(to_bash_path "${ANDROID_HOME}")"/ndk/*/ 2>/dev/null | sort -V | tail -n1 || true)"
  [[ -n "${NDK_HOME}" ]] || { echo "未在 ${ANDROID_HOME}/ndk 下找到 NDK，请设置 NDK_HOME。"; exit 1; }
  NDK_HOME="$(to_tool_path "${NDK_HOME%/}")"
fi
export NDK_HOME
export PATH="$(to_bash_path "${JAVA_HOME}")/bin:${ANDROID_HOME}/platform-tools:$PATH"

ADB="${ANDROID_HOME}/platform-tools/${ADB_NAME}"
APK="src-tauri/gen/android/app/build/outputs/apk/arm64/release/app-arm64-release.apk"
BUILD_LOG="$(mktemp)"
trap 'rm -f "${BUILD_LOG}"' EXIT

build_release() {
  pnpm build:android:release 2>&1 | tee "${BUILD_LOG}"
}

if ! build_release; then
  # Windows 上 vite 重建 dist 与 rustc 嵌入前端资源存在偶发竞争（couldn't read ... os error 3），重试一次即可恢复
  if grep -q "couldn't read" "${BUILD_LOG}"; then
    echo ""
    echo "检测到前端资源读取失败（Windows 偶发竞争），自动重试构建..."
    build_release
  else
    exit 1
  fi
fi

[[ -f "${APK}" ]] || { echo "构建完成但未找到 APK: ${APK}"; exit 1; }
"$ADB" install -r "$APK"
