import { type RemoteVideoStreamProgress } from "@tau/shared";

interface RemoteVideoLoaderProps {
  loading: boolean;
  error: string | null;
  streamProgress: RemoteVideoStreamProgress | null;
}

const formatBytes = (bytes?: number): string => {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
};

const RemoteVideoLoader = ({
  loading,
  error,
  streamProgress,
}: RemoteVideoLoaderProps) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[280px] p-8">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="relative">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-teal-500/20 to-cyan-500/20 dark:from-teal-500/30 dark:to-cyan-500/30 flex items-center justify-center border border-teal-500/30 dark:border-teal-400/40">
                <svg
                  className="w-6 h-6 text-teal-600 dark:text-teal-400 animate-pulse"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </div>
              <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-teal-500 rounded-full animate-ping" />
              <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-teal-500 rounded-full" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                正在下载视频
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {streamProgress?.message || "正在准备下载..."}
              </p>
            </div>
          </div>

          {/* Progress */}
          {streamProgress ? (
            <div className="space-y-4">
              {/* Download Progress */}
              {streamProgress.stage === "downloading" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                      <svg
                        className="w-3.5 h-3.5 text-teal-500 dark:text-teal-400"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <rect x="2" y="2" width="20" height="20" rx="2.18" />
                        <path d="m7 2 10 10-10 10" />
                      </svg>
                      下载进度
                    </span>
                    <span className="text-gray-600 dark:text-gray-400 tabular-nums">
                      {formatBytes(streamProgress.downloaded)} /{" "}
                      {formatBytes(streamProgress.total)}
                    </span>
                  </div>
                  <div className="relative h-2 bg-gray-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-teal-500 to-cyan-500 dark:from-teal-400 dark:to-cyan-400 rounded-full transition-all duration-300 ease-out"
                      style={{
                        width: `${Math.min(streamProgress.percent || 0, 100)}%`,
                      }}
                    >
                      <div className="absolute inset-0 bg-white/30 animate-pulse" />
                    </div>
                  </div>
                  <div className="text-center text-xs text-gray-500 dark:text-gray-400">
                    {(streamProgress.percent || 0).toFixed(1)}%
                  </div>
                </div>
              )}

              {/* Completed */}
              {streamProgress.stage === "completed" && (
                <div className="flex items-center justify-center gap-2 p-4 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 rounded-xl">
                  <svg
                    className="w-5 h-5 text-green-600 dark:text-green-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  <span className="text-sm font-medium text-green-700 dark:text-green-300">
                    视频加载完成
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center p-6 bg-gray-50 dark:bg-zinc-800/50 border border-gray-200 dark:border-gray-700 rounded-xl">
              <div className="flex items-center gap-3">
                <svg
                  className="w-5 h-5 text-teal-500 dark:text-teal-400 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  正在准备下载...
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[280px] p-8">
        <div className="w-full max-w-md">
          <div className="bg-white dark:bg-zinc-800 border border-red-200 dark:border-red-900/50 rounded-2xl p-6 shadow-lg">
            {/* Error Icon */}
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-red-50 dark:bg-red-500/10 flex items-center justify-center border border-red-200 dark:border-red-500/20">
                <svg
                  className="w-8 h-8 text-red-600 dark:text-red-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="m15 9-6 6M9 9l6 6" />
                </svg>
              </div>
            </div>

            {/* Error Title */}
            <h3 className="text-center text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              视频下载失败
            </h3>

            {/* Error Message */}
            <div className="bg-red-50 dark:bg-red-500/5 border border-red-100 dark:border-red-500/20 rounded-lg p-3 mb-4">
              <p className="text-sm text-red-800 dark:text-red-300 text-center break-words">
                {error}
              </p>
            </div>

            {/* Suggestions */}
            <div className="space-y-2">
              <p className="text-xs text-gray-600 dark:text-gray-400 text-center">
                请尝试以下解决方案：
              </p>
              <ul className="space-y-1.5 text-xs text-gray-600 dark:text-gray-400">
                <li className="flex items-start gap-2">
                  <svg
                    className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 mt-0.5 shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                  <span>检查网络连接是否正常</span>
                </li>
                <li className="flex items-start gap-2">
                  <svg
                    className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 mt-0.5 shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                  <span>确认视频链接是否有效</span>
                </li>
                <li className="flex items-start gap-2">
                  <svg
                    className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 mt-0.5 shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                    <path d="M21 3v5h-5" />
                  </svg>
                  <span>稍后重试或尝试其他视频链接</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default RemoteVideoLoader;
