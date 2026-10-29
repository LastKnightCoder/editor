import { useEffect, useState, type Ref } from "react";
import { createPortal } from "react-dom";
import { Sparkles, X } from "lucide-react";
import { cn } from "@tau/ui";
import { Z_INDEX } from "../../router/zIndex";

/** 录音上限，与服务层 120 秒自动停止一致 */
export const DICTATION_LIMIT_MS = 120_000;
/** 剩余该时长起计时变红 */
const WARN_REMAINING_MS = 15_000;
const WAVE_BARS = 30;

export type DictationOverlayProps = {
  open: boolean;
  /** 连接中显示转圈与「正在连接」，连上后换成波形与计时 */
  connecting: boolean;
  /** 进入 listening 的时间戳，null 时计时停在 0:00 */
  startedAt: number | null;
  /** 手指已进入 ✕ 命中区 */
  cancelArmed: boolean;
  /** 已配置 AI 润色：提示文案改为「松手后 AI 润色」 */
  polishEnabled?: boolean;
  /** 阅读态追加到文末：提示文案改为「松手追加到文末」 */
  appendToEnd?: boolean;
  /** 一段时间没识别出字时的提示 */
  quiet?: boolean;
  /** ✕ 按钮节点：手势层据此计算命中区 */
  cancelTargetRef?: Ref<HTMLDivElement>;
  portalContainer?: HTMLElement | null;
};

function formatElapsed(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

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

/** 按住说话时的底部沉浸区：盖在键盘位置之上，键盘本身不收起，正文位置不变 */
export function DictationOverlay(props: DictationOverlayProps) {
  const {
    open,
    connecting,
    startedAt,
    cancelArmed,
    polishEnabled = false,
    appendToEnd = false,
    quiet = false,
    cancelTargetRef,
    portalContainer,
  } = props;
  const elapsed = useElapsed(startedAt, open);
  if (!open) return null;
  const warn = DICTATION_LIMIT_MS - elapsed <= WARN_REMAINING_MS;
  const hint = cancelArmed
    ? "松手取消"
    : quiet
      ? "没听清，靠近一点"
      : `${polishEnabled ? "松手后 AI 润色" : appendToEnd ? "松手追加到文末" : "松手插入"} · 上滑取消`;

  const node = (
    <div
      data-dictation-overlay=""
      data-cancel-armed={cancelArmed || undefined}
      aria-live="polite"
      className="pointer-events-none fixed inset-0 flex flex-col items-center justify-end"
      style={{ zIndex: Z_INDEX.POPOVER + 1 }}
    >
      <div className="dictation-scrim absolute inset-0" aria-hidden />
      <div
        ref={cancelTargetRef}
        aria-label="上滑到此处取消"
        className={cn(
          "relative mb-[26px] flex items-center justify-center rounded-full shadow-float transition-all duration-150 ease-tau-out",
          cancelArmed
            ? "bg-danger h-[72px] w-[72px] -translate-y-[7px] text-white"
            : "bg-surface/90 text-ink-2 h-[58px] w-[58px]"
        )}
      >
        <X size={cancelArmed ? 28 : 24} strokeWidth={2.2} aria-hidden />
      </div>
      <div
        className={cn(
          "dictation-zone relative flex w-full flex-col items-center justify-center gap-3 pb-[calc(10px+var(--mobile-safe-bottom))] transition-colors duration-150",
          cancelArmed ? "bg-danger-soft" : "bg-surface"
        )}
        style={{ height: "max(250px, calc(var(--kb-height) + 46px))" }}
      >
        {connecting ? (
          <span
            aria-hidden
            className="border-line-1 border-t-accent h-5 w-5 animate-spin rounded-full border-2"
          />
        ) : (
          <div
            aria-hidden
            className={cn("dictation-wave flex h-11 items-center gap-1", cancelArmed && "is-still")}
          >
            {Array.from({ length: WAVE_BARS }, (_, index) => (
              <i
                key={index}
                style={{
                  height: `${22 + Math.round(70 * Math.abs(Math.sin(index * 1.7) * Math.cos(index * 0.6)))}%`,
                  animationDelay: `${(index % 7) * -0.13}s`,
                }}
              />
            ))}
          </div>
        )}
        <span
          className={cn(
            "flex items-center gap-1.5 text-[13px] font-semibold tabular-nums",
            warn && !cancelArmed ? "text-danger" : "text-ink-2"
          )}
        >
          <span
            aria-hidden
            className={cn(
              "h-2 w-2 rounded-full",
              cancelArmed || connecting ? "bg-ink-3" : "bg-accent animate-pulse"
            )}
          />
          {connecting ? "正在连接…" : formatElapsed(elapsed)}
        </span>
        <span
          className={cn(
            "flex items-center gap-1 text-[12.5px]",
            cancelArmed ? "text-danger font-semibold" : "text-ink-3"
          )}
        >
          {polishEnabled && !cancelArmed && !quiet ? (
            <Sparkles size={13} className="text-accent" aria-hidden />
          ) : null}
          {hint}
        </span>
      </div>
    </div>
  );
  return createPortal(node, portalContainer ?? document.body);
}
