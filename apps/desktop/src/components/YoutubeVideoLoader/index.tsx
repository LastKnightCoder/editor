import type { VideoLoaderStreamProgress } from "@/editor-providers/types";

interface YoutubeVideoLoaderProps {
  loading: boolean;
  error: string | null;
  streamProgress: VideoLoaderStreamProgress | null;
}

const formatBytes = (bytes?: number): string => {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
};

const YoutubeVideoLoader = ({ loading, error, streamProgress }: YoutubeVideoLoaderProps) => {
  if (loading) {
    return (
      <div className="flex min-h-[280px] items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="mb-6 flex items-center justify-center gap-3">
            <div className="relative">
              <div className="border-[var(--th-border-focus)]/40 flex h-12 w-12 items-center justify-center rounded-full border bg-[var(--th-accent-soft)]">
                <svg
                  className="h-6 w-6 animate-pulse text-[var(--th-active-text)]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" />
                  <path d="m9.75 15.02 5.75-3.27-5.75-3.27v6.54z" />
                </svg>
              </div>
              <div className="absolute -right-0.5 -top-0.5 h-3 w-3 animate-ping rounded-full bg-[var(--th-accent)]" />
              <div className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-[var(--th-accent)]" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                正在加载 YouTube 视频
              </h3>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {streamProgress?.message || "正在准备下载..."}
              </p>
            </div>
          </div>

          {/* Progress */}
          {streamProgress ? (
            <div className="space-y-4">
              {/* Video Progress */}
              {streamProgress.stage === "downloading" && streamProgress.videoTotal && (
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
                      视频流
                    </span>
                    <span className="tabular-nums text-gray-600 dark:text-gray-400">
                      {formatBytes(streamProgress.videoDownloaded)} /{" "}
                      {formatBytes(streamProgress.videoTotal)}
                    </span>
                  </div>
                  <div className="relative h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-zinc-700">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[var(--th-accent)] to-[var(--th-accent-hover)] transition-all duration-300 ease-out"
                      style={{
                        width: `${Math.min(
                          ((streamProgress.videoDownloaded || 0) /
                            (streamProgress.videoTotal || 1)) *
                            100,
                          100
                        )}%`,
                      }}
                    >
                      <div className="absolute inset-0 animate-pulse bg-white/30" />
                    </div>
                  </div>
                </div>
              )}

              {/* Audio Progress */}
              {streamProgress.stage === "downloading" && streamProgress.audioTotal && (
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
                        <path d="M9 18V5l12-2v13" />
                        <circle cx="6" cy="18" r="3" />
                        <circle cx="18" cy="16" r="3" />
                      </svg>
                      音频流
                    </span>
                    <span className="tabular-nums text-gray-600 dark:text-gray-400">
                      {formatBytes(streamProgress.audioDownloaded)} /{" "}
                      {formatBytes(streamProgress.audioTotal)}
                    </span>
                  </div>
                  <div className="relative h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-zinc-700">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[var(--th-accent)] to-[var(--th-accent-hover)] transition-all duration-300 ease-out"
                      style={{
                        width: `${Math.min(
                          ((streamProgress.audioDownloaded || 0) /
                            (streamProgress.audioTotal || 1)) *
                            100,
                          100
                        )}%`,
                      }}
                    >
                      <div className="absolute inset-0 animate-pulse bg-white/30" />
                    </div>
                  </div>
                </div>
              )}

              {/* Merging Progress */}
              {streamProgress.stage === "merging" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 font-medium text-gray-700 dark:text-gray-300">
                      <svg
                        className="h-3.5 w-3.5 animate-spin text-[var(--th-accent)]"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                      </svg>
                      合并处理
                    </span>
                    <span className="text-gray-600 dark:text-gray-400">
                      {streamProgress.processed}%
                    </span>
                  </div>
                  <div className="relative h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-zinc-700">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[var(--th-accent)] to-[var(--th-accent-hover)] transition-all duration-300"
                      style={{ width: `${streamProgress.processed}%` }}
                    >
                      <div className="absolute inset-0 animate-pulse bg-white/30" />
                    </div>
                  </div>
                </div>
              )}

              {/* Completed */}
              {streamProgress.stage === "completed" && (
                <div className="border-[var(--th-success)]/30 bg-[var(--th-success)]/10 flex items-center justify-center gap-2 rounded-xl border p-4">
                  <svg
                    className="h-5 w-5 text-[var(--th-accent)]"
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
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  正在获取视频信息...
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
      <div className="flex min-h-[280px] items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-lg dark:border-red-900/50 dark:bg-zinc-800">
            {/* Error Icon */}
            <div className="mb-4 flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border border-red-200 bg-red-50 dark:border-red-500/20 dark:bg-red-500/10">
                <svg
                  className="h-8 w-8 text-red-600 dark:text-red-400"
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
              YouTube 视频加载失败
            </h3>

            {/* Error Message */}
            <div className="mb-4 rounded-lg border border-red-100 bg-red-50 p-3 dark:border-red-500/20 dark:bg-red-500/5">
              <p className="break-words text-center text-sm text-red-800 dark:text-red-300">
                {error}
              </p>
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
                    <path d="M12 2v6M12 18v4M4.93 4.93l4.24 4.24M14.83 14.83l4.24 4.24M2 12h6M18 12h4M4.93 19.07l4.24-4.24M14.83 9.17l4.24-4.24" />
                  </svg>
                  <span>在设置中配置 YouTube 代理服务器</span>
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
                  <span>重启应用后重试，或尝试其他视频链接</span>
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

export default YoutubeVideoLoader;
