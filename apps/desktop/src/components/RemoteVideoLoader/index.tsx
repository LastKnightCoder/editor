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

const RemoteVideoLoader = ({ loading, error, streamProgress }: RemoteVideoLoaderProps) => {
  if (loading) {
    return (
      <div className="flex min-h-[280px] items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="mb-6 flex items-center justify-center gap-3">
            <div className="relative">
              <div className="border-[var(--th-border-focus)]/40 flex h-12 w-12 items-center justify-center rounded-full border bg-[var(--th-accent-soft)]">
                <svg
                  className="h-6 w-6 animate-pulse text-[var(--th-accent)]"
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
              <div className="absolute -right-0.5 -top-0.5 h-3 w-3 animate-ping rounded-full bg-[var(--th-accent)]" />
              <div className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-[var(--th-accent)]" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                正在下载视频
              </h3>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
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
                    <span className="flex items-center gap-1.5 font-medium text-gray-700 dark:text-gray-300">
                      <svg
                        className="h-3.5 w-3.5 text-[var(--th-accent)]"
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
                    <span className="tabular-nums text-gray-600 dark:text-gray-400">
                      {formatBytes(streamProgress.downloaded)} / {formatBytes(streamProgress.total)}
                    </span>
                  </div>
                  <div className="relative h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-zinc-700">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[var(--th-accent)] to-[var(--th-accent-hover)] transition-all duration-300 ease-out"
                      style={{
                        width: `${Math.min(streamProgress.percent || 0, 100)}%`,
                      }}
                    >
                      <div className="absolute inset-0 animate-pulse bg-white/30" />
                    </div>
                  </div>
                  <div className="text-center text-xs text-gray-500 dark:text-gray-400">
                    {(streamProgress.percent || 0).toFixed(1)}%
                  </div>
                </div>
              )}

              {/* Completed */}
              {streamProgress.stage === "completed" && (
                <div className="bg-[var(--th-success)]/10 border-[var(--th-success)]/20 flex items-center justify-center gap-2 rounded-xl border p-4">
                  <svg
                    className="text-status-success h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  <span className="text-status-success text-sm font-medium">视频加载完成</span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center rounded-xl border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-zinc-800/50">
              <div className="flex items-center gap-3">
                <svg
                  className="h-5 w-5 animate-spin text-[var(--th-accent)]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                <span className="text-sm text-gray-600 dark:text-gray-400">正在准备下载...</span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[280px] items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="border-[var(--th-danger)]/30 rounded-2xl border bg-white p-6 shadow-lg dark:bg-zinc-800">
            {/* Error Icon */}
            <div className="mb-4 flex justify-center">
              <div className="bg-[var(--th-danger)]/10 border-[var(--th-danger)]/20 flex h-16 w-16 items-center justify-center rounded-full border">
                <svg
                  className="text-status-error h-8 w-8"
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
            <h3 className="mb-2 text-center text-lg font-semibold text-gray-900 dark:text-gray-100">
              视频下载失败
            </h3>

            {/* Error Message */}
            <div className="bg-[var(--th-danger)]/5 border-[var(--th-danger)]/20 mb-4 rounded-lg border p-3">
              <p className="text-status-error break-words text-center text-sm">{error}</p>
            </div>

            {/* Suggestions */}
            <div className="space-y-2">
              <p className="text-center text-xs text-gray-600 dark:text-gray-400">
                请尝试以下解决方案：
              </p>
              <ul className="space-y-1.5 text-xs text-gray-600 dark:text-gray-400">
                <li className="flex items-start gap-2">
                  <svg
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-gray-500"
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
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-gray-500"
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
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-gray-500"
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
