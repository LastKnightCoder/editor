const PYTHON_RUNTIME_ERROR_MESSAGE_MAP: Record<string, string> = {
  PY_RUNTIME_NOT_READY: "Python 服务正在准备中，请稍后重试。",
  PY_RUNTIME_DOWNLOAD_FAILED: "Python 服务下载失败，请检查网络后重试。",
  PY_RUNTIME_PLATFORM_UNSUPPORTED: "当前系统暂不支持 Python 本地服务。",
};

const extractErrorCode = (message: string): string | null => {
  const match = message.match(/^\[([A-Z0-9_]+)\]/);
  if (!match) {
    return null;
  }
  return match[1];
};

export const getFriendlyPythonRuntimeErrorMessage = (
  error: unknown,
  fallback: string,
): string => {
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : fallback;

  const code = extractErrorCode(rawMessage);
  if (code && PYTHON_RUNTIME_ERROR_MESSAGE_MAP[code]) {
    return PYTHON_RUNTIME_ERROR_MESSAGE_MAP[code];
  }

  if (
    rawMessage.includes("Python service client is not available") ||
    rawMessage.includes("Python server is not ready") ||
    rawMessage.includes("Timeout waiting for Python server")
  ) {
    return "Python 服务尚未就绪，请稍后重试。";
  }

  return rawMessage || fallback;
};
