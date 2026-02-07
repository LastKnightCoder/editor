import type { ConnectionStatus } from "../../../utils/types";

interface WelcomePageProps {
  status: ConnectionStatus;
  onRetry: () => void;
}

/**
 * 欢迎页 - Electron 未启动时展示
 */
export default function WelcomePage({ status, onRetry }: WelcomePageProps) {
  const openTau = () => {
    window.open("tau://", "_blank");
    setTimeout(onRetry, 2000);
  };

  return (
    <div className="flex h-full flex-col items-center justify-center px-8">
      {/* Logo */}
      <div className="mb-8">
        <svg
          viewBox="0 0 1024 1024"
          className="h-16 w-16 text-blue-500 dark:text-blue-400"
          fill="currentColor"
        >
          <path d="M463.68 59.52a96 96 0 0 1 96 0l320 184.64a96 96 0 0 1 48.32 83.2v369.28a96 96 0 0 1-48 83.2l-320 184.64a96 96 0 0 1-96 0l-320-184.64a96 96 0 0 1-48-83.2v-369.28a96 96 0 0 1 47.68-83.2z m64.32 55.68a32 32 0 0 0-32 0l-320 184.64a32 32 0 0 0-16 27.52v369.28a32 32 0 0 0 16 27.84l320 184.32a32 32 0 0 0 32 0l320-184.64a32 32 0 0 0 16-27.52v-369.28a32 32 0 0 0-16-27.84zM396.8 397.632a160 160 0 0 1 156.48-40.192A160.064 160.064 0 0 1 512 672a166.72 166.72 0 0 1-41.28-5.44A160 160 0 0 1 396.8 397.632zM595.2 464a96 96 0 1 0-166.272 96A96 96 0 0 0 595.2 464z" />
        </svg>
      </div>

      {/* 标题 */}
      <h1 className="mb-2 text-2xl font-bold text-gray-900 dark:text-[#e6edf3]">
        欢迎使用 Tau
      </h1>
      <p className="mb-12 text-center text-sm text-gray-500 dark:text-[#6e7681]">
        智能笔记，高效创作
      </p>

      {/* 功能图标 */}
      <div className="mb-12 flex items-center gap-8">
        <IconCircle>
          <svg
            className="h-8 w-8 text-blue-500 dark:text-blue-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"
            />
          </svg>
        </IconCircle>

        <IconCircle>
          <svg
            className="h-8 w-8 text-blue-500 dark:text-blue-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 0 1-.657.643 48.39 48.39 0 0 1-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 0 1-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 0 0-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 0 1-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 0 0 .657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 0 1-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.4.604-.4.959v0c0 .333.277.599.61.58a48.1 48.1 0 0 0 5.427-.63 48.05 48.05 0 0 0 .582-4.717.532.532 0 0 0-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.96.401v0a.656.656 0 0 0 .658-.663 48.422 48.422 0 0 0-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 0 1-.61-.58v0Z"
            />
          </svg>
        </IconCircle>
      </div>

      {/* 打开 Tau 按钮 */}
      <button
        onClick={openTau}
        className="w-full max-w-[280px] rounded-full bg-blue-500 px-8 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-600 dark:bg-blue-400 dark:text-gray-900 dark:hover:bg-blue-300"
      >
        {status === "connecting" ? "正在连接..." : "打开 Tau"}
      </button>

      {/* 提示文字 */}
      <p className="mt-4 text-center text-xs text-gray-400 dark:text-[#484f58]">
        {status === "connecting"
          ? "正在尝试连接到 Tau 客户端..."
          : "点击按钮启动 Tau 桌面客户端"}
      </p>
    </div>
  );
}

function IconCircle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/5 dark:bg-white/10">
      {children}
    </div>
  );
}
