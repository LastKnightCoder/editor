/**
 * 番茄小窗（360×84 无边框置顶窗，路由 /pomodoro/mini）：方案 C 控制条的缩影
 * （原型 A 款 288×68 等比放大 1.25 倍，字号 / 控件一律用字面像素，不随全局字号缩放）。
 * 平时只显示预设名 · 状态、剩余时间、结束时刻与底边进度线；悬停（或暂停时常显）右侧换成
 * 暂停继续 / 结束 / 回到番茄页。不足 5 分钟结束在窗内原位确认；结束后原位显示结果，可再来一个。
 * 整个窗体可拖动（app-region-drag），交互件一律 no-drag。
 * 窗口尺寸固定，主窗口的页面缩放会连带放大这里（同 origin），内容层用 CSS zoom 反向抵消。
 */

import { useState, type ReactNode } from "react";
import { AlertTriangle, Check, Expand, Pause, Play, Square, X } from "lucide-react";
import { cn } from "@tau/ui";
import { platform } from "@/platform";
import { hidePomodoroMiniWindow } from "@/commands/window";
import { requestOpenPageInMainWindow } from "@/services/main-window-requests";
import { formatClock, formatDurationCN, formatHM, isEarlyStop } from "../model";
import { usePomodoroPresets } from "../queries";
import { pomodoroActions, useLiveTiming } from "../timerStore";
import { PresetDot } from "../components/PomodoroBits";
import { useAuxWindowBoot, useCancelPageZoom, useEndResult } from "./useAuxWindow";

const NO_DRAG = "app-region-no-drag";

function MiniButton({
  label,
  onClick,
  primary,
  paused,
  children,
}: {
  label: string;
  onClick(): void;
  primary?: boolean;
  paused?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        NO_DRAG,
        "grid flex-none place-items-center rounded-full transition-colors duration-150",
        primary
          ? cn("text-ink-inverse size-10", paused ? "bg-warn" : "bg-accent hover:bg-accent-hover")
          : "text-ink-2 hover:bg-hover hover:text-ink-1 size-[35px] rounded-[10px]"
      )}
    >
      {children}
    </button>
  );
}

function TextButton({
  onClick,
  tone = "neutral",
  children,
}: {
  onClick(): void;
  tone?: "neutral" | "accent" | "danger";
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        NO_DRAG,
        "h-8 flex-none rounded-[10px] px-3 text-[15px] font-medium transition-colors duration-150",
        tone === "accent" && "bg-accent-soft text-accent-text",
        tone === "danger" && "bg-danger-soft text-danger",
        tone === "neutral" && "bg-hover text-ink-1 hover:bg-press"
      )}
    >
      {children}
    </button>
  );
}

export function MiniWindow() {
  const { dbReady } = useAuxWindowBoot();
  const zoom = useCancelPageZoom();
  const presets = usePomodoroPresets(dbReady);
  const { session, timing } = useLiveTiming();
  const [result, dismissResult] = useEndResult();
  const [confirming, setConfirming] = useState(false);

  const nameOf = (presetId: number) => presets.byId.get(presetId)?.name ?? "专注";
  const close = () => {
    dismissResult();
    void hidePomodoroMiniWindow();
  };
  const backToMain = async () => {
    await platform.window.showAndFocus();
    requestOpenPageInMainWindow("pomodoro");
    void hidePomodoroMiniWindow();
  };
  const stop = () => {
    if (timing?.willDiscard && !confirming) return setConfirming(true);
    setConfirming(false);
    void pomodoroActions.stop();
  };

  let body: ReactNode;
  let progress = 0;
  let barTone = "bg-accent";

  if (session && timing && confirming && timing.willDiscard) {
    progress = timing.progress;
    barTone = "bg-warn";
    body = (
      <>
        <div className="min-w-0 flex-1">
          <div className="text-warn flex items-center gap-2 text-[15px] font-medium">
            <AlertTriangle className="size-4" strokeWidth={1.75} />
            不足 5 分钟
          </div>
          <div className="text-ink-2 mt-1 text-[15.5px]">结束后不会留下记录</div>
        </div>
        <TextButton onClick={() => setConfirming(false)}>继续</TextButton>
        <TextButton tone="danger" onClick={stop}>
          结束
        </TextButton>
      </>
    );
  } else if (session && timing) {
    const countdown = timing.remainMs !== undefined;
    progress = timing.progress;
    barTone = timing.paused ? "bg-warn" : "bg-accent";
    body = (
      <>
        <div className="min-w-0 flex-1">
          <div className="text-ink-2 flex items-center gap-2 whitespace-nowrap text-[15px]">
            <PresetDot presetId={session.presetId} className="size-2" />
            <span className="truncate">{session.boundTitle ?? nameOf(session.presetId)}</span>
            <span className={cn(timing.paused ? "text-warn font-medium" : "text-ink-3")}>
              {timing.paused ? "已暂停" : countdown ? "剩余" : "已专注"}
            </span>
          </div>
          <div
            className={cn(
              "mt-px text-[32px] font-medium tabular-nums leading-[1.12] tracking-[-0.02em] transition-colors duration-300",
              timing.paused && "text-ink-2"
            )}
          >
            {formatClock(timing.displayMs)}
          </div>
        </div>
        {/* min-w = 悬停控件组宽：控件浮出时不压住左侧预设名 */}
        <div className="relative flex h-10 min-w-[114px] flex-none items-center justify-end">
          <span
            className={cn(
              "text-ink-3 whitespace-nowrap text-[14.5px] tabular-nums transition-opacity duration-150",
              "group-hover:opacity-0",
              timing.paused && "opacity-0"
            )}
          >
            {timing.endsAt != null
              ? `${formatHM(timing.endsAt)} 结束`
              : countdown
                ? "结束时间顺延"
                : "正计时"}
          </span>
          <div
            className={cn(
              "absolute right-0 top-0 flex items-center gap-0.5 transition-opacity duration-150",
              "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100",
              timing.paused && "pointer-events-auto opacity-100"
            )}
          >
            <MiniButton
              primary
              paused={timing.paused}
              label={timing.paused ? "继续" : "暂停"}
              onClick={() => void pomodoroActions.toggle()}
            >
              {timing.paused ? (
                <Play className="ml-px size-[15px] fill-current" strokeWidth={0} />
              ) : (
                <Pause className="size-[15px] fill-current" strokeWidth={0} />
              )}
            </MiniButton>
            <MiniButton label="结束" onClick={stop}>
              <Square className="size-[17px]" strokeWidth={1.75} />
            </MiniButton>
            <MiniButton label="回到番茄专注页" onClick={() => void backToMain()}>
              <Expand className="size-[17px]" strokeWidth={1.75} />
            </MiniButton>
          </div>
        </div>
      </>
    );
  } else if (result) {
    progress = 1;
    barTone = result.saved ? "bg-ok" : "bg-track";
    body = (
      <>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 whitespace-nowrap text-[15px]">
            {result.saved ? (
              <Check className="text-ok size-4 flex-none" strokeWidth={2.4} />
            ) : (
              <AlertTriangle className="text-warn size-4 flex-none" strokeWidth={1.75} />
            )}
            <span className="truncate">
              {result.saved ? `完成「${nameOf(result.presetId)}」` : "不足 5 分钟，未记录"}
            </span>
          </div>
          <div className="text-ink-2 mt-1 text-[15.5px]">
            {result.saved
              ? `${isEarlyStop(result) ? "提前结束 · " : ""}${formatDurationCN(result.focusMs)}`
              : nameOf(result.presetId)}
          </div>
        </div>
        {presets.byId.get(result.presetId) && (
          <TextButton
            tone="accent"
            onClick={() => {
              const preset = presets.byId.get(result.presetId);
              if (preset) void pomodoroActions.start(preset);
            }}
          >
            再来一个
          </TextButton>
        )}
        <MiniButton label="关闭小窗" onClick={close}>
          <X className="size-[17px]" strokeWidth={1.75} />
        </MiniButton>
      </>
    );
  } else {
    body = (
      <>
        <div className="text-ink-2 flex-1 text-[15.5px]">没有进行中的专注</div>
        <MiniButton label="关闭小窗" onClick={close}>
          <X className="size-[17px]" strokeWidth={1.75} />
        </MiniButton>
      </>
    );
  }

  return (
    <div className="app-region-drag bg-surface text-ink-1 font-tau group fixed inset-0 select-none overflow-hidden text-base antialiased">
      <div
        className="relative flex h-full w-full items-center gap-3 pb-0.5 pl-5 pr-[15px]"
        style={{ zoom }}
      >
        {body}
        <div className="bg-track absolute inset-x-0 bottom-0 h-1">
          <div
            className={cn("h-full transition-[width] duration-1000 ease-linear", barTone)}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export default MiniWindow;
