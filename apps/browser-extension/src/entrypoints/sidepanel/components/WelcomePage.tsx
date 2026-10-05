import { AppWindow } from "lucide-react";
import { Button } from "@tau/ui";
import type { ConnectionStatus } from "../../../utils/types";

interface WelcomePageProps {
  status: ConnectionStatus;
  onRetry: () => void;
}

/** 没连上桌面端：笔记、高亮与对话都存在桌面，这里只给打开 Tau 的入口 */
export default function WelcomePage({ status, onRetry }: WelcomePageProps) {
  const openTau = () => {
    window.open("tau://", "_blank");
    setTimeout(onRetry, 2000);
  };
  const connecting = status === "connecting";

  return (
    <div className="bg-page flex h-full flex-col items-center justify-center gap-3 px-11 text-center">
      <span className="border-line-1 bg-surface text-accent-text grid size-[52px] place-items-center rounded-[16px] border text-[22px] font-bold">
        τ
      </span>
      <h1 className="text-tau-title-lg text-ink-1 font-semibold">没有连上 Tau</h1>
      <p className="text-tau-sm text-ink-2 leading-[1.7]">
        笔记、高亮和对话都存在桌面端。打开 Tau 后这里会自动连上。
      </p>
      <Button variant="primary" icon={AppWindow} onClick={openTau} disabled={connecting}>
        {connecting ? "正在连接…" : "打开 Tau"}
      </Button>
    </div>
  );
}
