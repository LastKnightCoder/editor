import { type NotionCacheProgress } from "@/commands/notion-cache";

interface NotionVideoLoaderProps {
  loading: boolean;
  error: string | null;
  streamProgress: NotionCacheProgress | null;
}

const formatBytes = (bytes?: number): string => {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
};

const NotionVideoLoader = ({
  loading,
  error,
  streamProgress,
}: NotionVideoLoaderProps) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[280px] p-8">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="relative">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gray-800/20 to-gray-600/20 dark:from-gray-200/30 dark:to-gray-400/30 flex items-center justify-center border border-gray-800/30 dark:border-gray-200/40">
                <svg
                  className="w-6 h-6 text-gray-900 dark:text-gray-100 animate-pulse"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M4 4h16v16H4V4zm2 2v12h12V6H6z" />
                  <path d="M8 8h8v2H8V8zm0 4h8v2H8v-2z" />
                </svg>
              </div>
              <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-zinc-800 dark:bg-gray-200 rounded-full animate-ping" />
              <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-zinc-800 dark:bg-gray-200 rounded-full" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                正在加载 Notion 视频
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
                        className="w-3.5 h-3.5 text-gray-700 dark:text-gray-300"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      下载进度
                    </span>
                    <span className="text-gray-600 dark:text-gray-400 tabular-nums">
                      {streamProgress.downloaded && streamProgress.total ? (
                        <>
                          {formatBytes(streamProgress.downloaded)} /{" "}
                          {formatBytes(streamProgress.total)}
                        </>
                      ) : (
                        `${streamProgress.progress.toFixed(1)}%`
                      )}
                    </span>
                  </div>
                  <div className="relative h-2 bg-gray-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-gray-700 to-gray-800 dark:from-gray-300 dark:to-gray-400 rounded-full transition-all duration-300 ease-out"
                      style={{
                        width: `${Math.min(streamProgress.progress, 100)}%`,
                      }}
                    >
                      <div className="absolute inset-0 bg-white/30 dark:bg-black/20 animate-pulse" />
                    </div>
                  </div>
                  {streamProgress.downloaded && streamProgress.total && (
                    <div className="flex items-center justify-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                      <svg
                        className="w-3 h-3"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                      </svg>
                      <span>
                        {(
                          ((streamProgress.downloaded || 0) /
                            (streamProgress.total || 1)) *
                          100
                        ).toFixed(1)}
                        % 完成
                      </span>
                    </div>
                  )}
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
                  className="w-5 h-5 text-gray-700 dark:text-gray-300 animate-spin"
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
              Notion 视频加载失败
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
                    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                  </svg>
                  <span>在设置中配置 Notion 集成令牌</span>
                </li>
                <li className="flex items-start gap-2">
                  <svg
                    className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 mt-0.5 shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="8.5" cy="7" r="4" />
                    <path d="M20 8v6M23 11h-6" />
                  </svg>
                  <span>确认已授予视频访问权限</span>
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

export default NotionVideoLoader;
