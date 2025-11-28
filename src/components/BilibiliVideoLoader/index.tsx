import { type StreamProgress } from "@/hooks/useBilibiliVideo";

interface BilibiliVideoLoaderProps {
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

const BilibiliVideoLoader = ({
  loading,
  error,
  streamProgress,
}: BilibiliVideoLoaderProps) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[280px] p-8">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="relative">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-pink-500/20 to-blue-500/20 dark:from-pink-500/30 dark:to-blue-500/30 flex items-center justify-center border border-pink-500/30 dark:border-pink-400/40">
                <svg
                  className="w-7 h-7 text-pink-600 dark:text-pink-400 animate-pulse"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.858 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.262-1.52 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 0 1-.373-.906c0-.356.124-.658.373-.907l.027-.027c.267-.249.573-.373.92-.373.347 0 .653.124.92.373L9.653 4.44c.071.071.134.142.187.213h4.267a.836.836 0 0 1 .16-.213l2.853-2.747c.267-.249.573-.373.92-.373.347 0 .662.151.929.4.267.249.391.551.391.907 0 .355-.124.657-.373.906zM5.333 7.24c-.746.018-1.373.276-1.88.773-.506.498-.769 1.13-.786 1.894v7.52c.017.764.28 1.395.786 1.893.507.498 1.134.756 1.88.773h13.334c.746-.017 1.373-.275 1.88-.773.506-.498.769-1.129.786-1.893v-7.52c-.017-.765-.28-1.396-.786-1.894-.507-.497-1.134-.755-1.88-.773zM8 11.107c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c0-.373.129-.689.386-.947.258-.257.574-.386.947-.386zm8 0c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c.017-.391.15-.711.4-.96.249-.249.56-.373.933-.373Z" />
                </svg>
              </div>
              <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-pink-500 rounded-full animate-ping" />
              <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-pink-500 rounded-full" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                正在加载 Bilibili 视频
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
                          className="w-3.5 h-3.5 text-pink-500 dark:text-pink-400"
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
                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-pink-500 to-pink-600 dark:from-pink-400 dark:to-pink-500 rounded-full transition-all duration-300 ease-out"
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
                          className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400"
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
                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500 to-blue-600 dark:from-blue-400 dark:to-blue-500 rounded-full transition-all duration-300 ease-out"
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
                  className="w-5 h-5 text-pink-500 dark:text-pink-400 animate-spin"
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
              Bilibili 视频加载失败
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
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <span>在设置中配置 Bilibili 凭证（SESSDATA）</span>
                </li>
                <li className="flex items-start gap-2">
                  <svg
                    className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 mt-0.5 shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                  </svg>
                  <span>部分高清视频需要大会员权限</span>
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

export default BilibiliVideoLoader;
