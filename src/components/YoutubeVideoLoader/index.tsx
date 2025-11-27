import { type StreamProgress } from "@/hooks/useYoutubeVideo";

interface YoutubeVideoLoaderProps {
  loading: boolean;
  error: string | null;
  streamProgress: StreamProgress | null;
}

const formatBytes = (bytes?: number): string => {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
};

const YoutubeVideoLoader = ({
  loading,
  error,
  streamProgress,
}: YoutubeVideoLoaderProps) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[280px] p-8">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="relative">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 dark:from-indigo-500/30 dark:to-purple-500/30 flex items-center justify-center border border-indigo-500/30 dark:border-indigo-400/40">
                <svg
                  className="w-6 h-6 text-indigo-600 dark:text-indigo-400 animate-pulse"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" />
                  <path d="m9.75 15.02 5.75-3.27-5.75-3.27v6.54z" />
                </svg>
              </div>
              <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-indigo-500 rounded-full animate-ping" />
              <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-indigo-500 rounded-full" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                正在加载 YouTube 视频
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {streamProgress?.message || "正在准备下载..."}
              </p>
            </div>
          </div>

          {/* Progress */}
          {streamProgress ? (
            <div className="space-y-4">
              {/* Video Progress */}
              {streamProgress.stage === "downloading" &&
                streamProgress.videoTotal && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                        <svg
                          className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400"
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
                      <span className="text-gray-600 dark:text-gray-400 tabular-nums">
                        {formatBytes(streamProgress.videoDownloaded)} /{" "}
                        {formatBytes(streamProgress.videoTotal)}
                      </span>
                    </div>
                    <div className="relative h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-indigo-500 to-indigo-600 dark:from-indigo-400 dark:to-indigo-500 rounded-full transition-all duration-300 ease-out"
                        style={{
                          width: `${Math.min(
                            ((streamProgress.videoDownloaded || 0) /
                              (streamProgress.videoTotal || 1)) *
                              100,
                            100,
                          )}%`,
                        }}
                      >
                        <div className="absolute inset-0 bg-white/30 animate-pulse" />
                      </div>
                    </div>
                  </div>
                )}

              {/* Audio Progress */}
              {streamProgress.stage === "downloading" &&
                streamProgress.audioTotal && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                        <svg
                          className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400"
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
                      <span className="text-gray-600 dark:text-gray-400 tabular-nums">
                        {formatBytes(streamProgress.audioDownloaded)} /{" "}
                        {formatBytes(streamProgress.audioTotal)}
                      </span>
                    </div>
                    <div className="relative h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-purple-500 to-purple-600 dark:from-purple-400 dark:to-purple-500 rounded-full transition-all duration-300 ease-out"
                        style={{
                          width: `${Math.min(
                            ((streamProgress.audioDownloaded || 0) /
                              (streamProgress.audioTotal || 1)) *
                              100,
                            100,
                          )}%`,
                        }}
                      >
                        <div className="absolute inset-0 bg-white/30 animate-pulse" />
                      </div>
                    </div>
                  </div>
                )}

              {/* Merging Progress */}
              {streamProgress.stage === "merging" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                      <svg
                        className="w-3.5 h-3.5 text-green-500 dark:text-green-400 animate-spin"
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
                  <div className="relative h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-green-500 to-emerald-600 dark:from-green-400 dark:to-emerald-500 rounded-full transition-all duration-300"
                      style={{ width: `${streamProgress.processed}%` }}
                    >
                      <div className="absolute inset-0 bg-white/30 animate-pulse" />
                    </div>
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
            <div className="flex items-center justify-center p-6 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl">
              <div className="flex items-center gap-3">
                <svg
                  className="w-5 h-5 text-indigo-500 dark:text-indigo-400 animate-spin"
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
          <div className="bg-white dark:bg-gray-800 border border-red-200 dark:border-red-900/50 rounded-2xl p-6 shadow-lg">
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
              YouTube 视频加载失败
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
                    className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 mt-0.5 flex-shrink-0"
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
                    className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 mt-0.5 flex-shrink-0"
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
                    className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 mt-0.5 flex-shrink-0"
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

export default YoutubeVideoLoader;
