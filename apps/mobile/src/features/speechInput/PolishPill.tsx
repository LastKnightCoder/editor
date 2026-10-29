import { createPortal } from "react-dom";
import { Sparkles } from "lucide-react";
import { cn } from "@tau/ui";
import { Z_INDEX } from "../../router/zIndex";

export type PolishPillState =
  | { kind: "polishing" }
  | { kind: "refined"; showingOriginal: boolean }
  | { kind: "failed" };

export type PolishPillProps = {
  state: PolishPillState | null;
  onSkip(): void;
  /** 在润色结果与识别原文之间切换 */
  onToggleOriginal(): void;
  onUndo(): void;
  onRetry(): void;
  /** 胶囊底边距屏幕底的距离，缺省贴在配件栏上方 */
  bottom?: string;
  portalContainer?: HTMLElement | null;
};

const PILL_BUTTON =
  "text-ink-2 active:bg-press flex h-[30px] items-center rounded-full px-2.5 font-semibold";

/** AI 润色的状态胶囊：润色中可跳过，完成后可切换原文或撤销，失败时可重试 */
export function PolishPill(props: PolishPillProps) {
  const { state, onSkip, onToggleOriginal, onUndo, onRetry, portalContainer } = props;
  if (!state) return null;
  const divider = <span aria-hidden className="bg-line-1 h-4 w-px" />;
  let content;
  if (state.kind === "polishing") {
    content = (
      <>
        <Sparkles size={16} className="text-accent animate-pulse" aria-hidden />
        AI 润色中
        {divider}
        <button type="button" className={PILL_BUTTON} onClick={onSkip}>
          跳过
        </button>
      </>
    );
  } else if (state.kind === "refined") {
    content = state.showingOriginal ? (
      <>
        已换回原文
        {divider}
        <button
          type="button"
          className={cn(PILL_BUTTON, "text-accent-text")}
          onClick={onToggleOriginal}
        >
          用润色
        </button>
      </>
    ) : (
      <>
        <Sparkles size={16} className="text-tag-1" aria-hidden />
        已润色
        {divider}
        <button type="button" className={PILL_BUTTON} onClick={onToggleOriginal}>
          用原文
        </button>
        <button type="button" className={cn(PILL_BUTTON, "text-accent-text")} onClick={onUndo}>
          撤销
        </button>
      </>
    );
  } else {
    content = (
      <>
        润色失败，已用原文
        {divider}
        <button type="button" className={cn(PILL_BUTTON, "text-accent-text")} onClick={onRetry}>
          重试
        </button>
      </>
    );
  }
  return createPortal(
    <div
      role="status"
      data-polish-pill={state.kind}
      className="bg-surface shadow-float text-ink-1 fixed left-1/2 flex h-[38px] -translate-x-1/2 items-center gap-2 rounded-full pr-1 pl-3.5 text-[13.5px] whitespace-nowrap"
      style={{
        zIndex: Z_INDEX.POPOVER + 1,
        bottom: props.bottom ?? "calc(var(--mobile-overlay-bottom) + 46px + 12px)",
      }}
    >
      {content}
    </div>,
    portalContainer ?? document.body
  );
}
