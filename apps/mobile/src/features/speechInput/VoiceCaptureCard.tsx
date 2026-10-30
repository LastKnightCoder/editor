import { useEffect, useState, type Ref } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@tau/ui";
import { Z_INDEX } from "../../router/zIndex";
import { splitPreviewText } from "./dictationPreview";

export type VoiceCaptureCardProps = {
  open: boolean;
  connecting: boolean;
  startedAt: number | null;
  preview: string;
  cancelArmed: boolean;
  /** ✕ 节点：手势层据此计算命中区 */
  cancelTargetRef?: Ref<HTMLDivElement>;
  /** 卡片底边离屏幕底的距离（Dock 之上） */
  bottom: string;
};

function useElapsed(startedAt: number | null, running: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running || startedAt === null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [running, startedAt]);
  return startedAt === null ? 0 : Math.max(0, now - startedAt);
}

/** 首页长按 ＋ 直接说：Dock 上方浮出的识别卡片，✕ 在卡片上方供上滑取消 */
export function VoiceCaptureCard(props: VoiceCaptureCardProps) {
  const { open, connecting, startedAt, preview, cancelArmed, cancelTargetRef, bottom } = props;
  const elapsed = useElapsed(startedAt, open);
  if (!open) return null;
  const seconds = Math.floor(elapsed / 1000);
  const { stable, tail } = splitPreviewText(preview);
  return createPortal(
    <div
      data-voice-capture=""
      aria-live="polite"
      className="pointer-events-none fixed inset-0"
      style={{ zIndex: Z_INDEX.POPOVER }}
    >
      <div className="dictation-scrim absolute inset-0" aria-hidden />
      <div className="absolute inset-x-4 flex flex-col items-center" style={{ bottom }}>
        <div
          ref={cancelTargetRef}
          aria-label="上滑到此处取消"
          className={cn(
            "shadow-float mb-4 flex items-center justify-center rounded-full transition-all duration-150 ease-tau-out",
            cancelArmed
              ? "bg-danger h-[64px] w-[64px] text-white"
              : "bg-surface text-ink-2 h-12 w-12"
          )}
        >
          <X size={cancelArmed ? 26 : 20} strokeWidth={2.2} aria-hidden />
        </div>
        <div
          className={cn(
            "shadow-float w-full rounded-[18px] px-4 py-3.5 transition-colors duration-150",
            cancelArmed ? "bg-danger-soft" : "bg-surface"
          )}
        >
          <div className="text-ink-2 flex items-center gap-1.5 text-[13px] font-semibold tabular-nums">
            <span
              aria-hidden
              className={cn(
                "h-2 w-2 rounded-full",
                cancelArmed || connecting ? "bg-ink-3" : "bg-accent animate-pulse"
              )}
            />
            {connecting
              ? "正在连接…"
              : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`}
          </div>
          <p
            className={cn(
              "mt-2 min-h-[1.6em] text-[15px] leading-relaxed",
              cancelArmed && "line-through opacity-40"
            )}
          >
            {preview ? (
              <>
                <span className="text-ink-2">{stable}</span>
                <span className="text-ink-3">{tail}</span>
              </>
            ) : (
              <span className="text-ink-3">说吧，我在听</span>
            )}
          </p>
          <div
            className={cn(
              "mt-2 text-[12px]",
              cancelArmed ? "text-danger font-semibold" : "text-ink-3"
            )}
          >
            {cancelArmed ? "松手取消" : "松手存进速记 · 上滑取消"}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
