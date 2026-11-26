import { pomoText, pomoValue, usePomodoroI18n } from "./i18n";
// 沉浸专注页（P2·全屏 overlay）。
// 竖屏：环内大时间纵向居中；横屏（landscape·独白式）：裸箭头 + 预设名（左上）、
// 居中超大细字重时间、底部发丝进度线、常驻对称双圆钮（暂停/结束）——全部常驻、无隐藏态。
// 返回手势/收起 = 退场回主页，计时继续（会话在后端）。

import { useEffect, useState, type ReactNode } from "react";
import { Check, ChevronDown, Pause, Play, Square } from "lucide-react";
import { MobileConfirmDialog } from "../../components/MobileConfirmDialog";
import { Z_INDEX } from "../../router/zIndex";
import { toast } from "../../components/toast";
import { usePomodoroPresets } from "./queries";
import { usePomodoroController, needsStopConfirm } from "./usePomodoroController";
import { useKeepScreenAwake } from "../../hooks/useKeepScreenAwake";
import { formatClock, formatFocusDuration } from "./timer";

const SIXTY_MIN_MS = 60 * 60 * 1000;

/** 进度环：倒计时按剩余比例；正计时按 60 分钟封顶（对齐桌面端 progress 口径） */
function ringProgress(elapsedMs: number, expectedMs: number | null | undefined): number {
  if (expectedMs && expectedMs > 0) {
    return Math.min(Math.max(elapsedMs / expectedMs, 0), 1);
  }
  return Math.min(elapsedMs / SIXTY_MIN_MS, 1);
}

/** 纯环容器：尺寸由 className 决定，环内内容由 children 填充 */
function FocusRing({
  progress,
  done = false,
  className,
  children,
}: {
  progress: number;
  done?: boolean;
  className: string;
  children: ReactNode;
}) {
  const radius = 86;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className={`relative aspect-square ${className}`}>
      <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90">
        <circle
          cx="100"
          cy="100"
          r={radius}
          fill="none"
          stroke="var(--ring-track)"
          strokeWidth="9"
        />
        <circle
          cx="100"
          cy="100"
          r={radius}
          fill="none"
          stroke={done ? "var(--tau-ok)" : "var(--tau-accent)"}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          style={{ transition: "stroke-dashoffset 0.9s linear" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {children}
      </div>
    </div>
  );
}

function PauseFab({
  paused,
  busy,
  size = 64,
  onToggle,
}: {
  paused: boolean;
  busy: boolean;
  size?: number;
  onToggle: () => void;
}) {
  usePomodoroI18n();

  return (
    <button
      type="button"
      aria-label={paused ? pomoText("ui.resume") : pomoText("ui.pause")}
      disabled={busy}
      onClick={onToggle}
      className="bg-surface text-ink-1 shadow-float grid place-items-center rounded-full transition-transform active:scale-90"
      style={{ width: size, height: size }}
    >
      {paused ? (
        <Play size={size * 0.38} fill="currentColor" className="ml-1" />
      ) : (
        <Pause size={size * 0.38} fill="currentColor" />
      )}
    </button>
  );
}

function StopButton({ onClick }: { onClick: () => void }) {
  usePomodoroI18n();

  return (
    <button
      type="button"
      onClick={onClick}
      className="text-ink-3 decoration-line-1 flex items-center gap-1.5 px-4 py-2 text-[12.5px] font-extrabold underline underline-offset-4"
    >
      <Square size={11} fill="currentColor" />
      {pomoText("ui.endFocusSession")}
    </button>
  );
}

type FocusImmersivePageProps = {
  onRequestClose: () => void;
  onError: (error: unknown, fallback: string) => void;
};

export function FocusImmersivePage({ onRequestClose, onError }: FocusImmersivePageProps) {
  usePomodoroI18n();

  const presetsQuery = usePomodoroPresets();
  const presets = presetsQuery.data ?? [];
  const controller = usePomodoroController(presets, onError);
  const [confirmStop, setConfirmStop] = useState(false);

  // 计时运行中屏幕常亮（暂停/结束/退场卸载时自动释放）
  useKeepScreenAwake(controller.isRunning);

  // 无会话且非完成庆祝态：自动退场（start 失败/会话被他端结束）。
  // 加载中不算——首次挂载缓存未预热时 data 尚未返回，不能断定无会话。
  useEffect(() => {
    if (
      !controller.session &&
      !controller.isActiveLoading &&
      !controller.justCompleted &&
      !controller.busy
    ) {
      onRequestClose();
    }
  }, [
    controller.session,
    controller.isActiveLoading,
    controller.justCompleted,
    controller.busy,
    onRequestClose,
  ]);

  const tick = controller.tick;
  const preset = controller.preset;
  const displayMs =
    tick?.remainMs ??
    tick?.elapsedMs ??
    (preset?.mode === "countdown" ? preset.durationMin * 60_000 : 0);
  const elapsed = tick ? tick.elapsedMs : 0;
  const progress = ringProgress(elapsed, tick?.session.expectedMs);

  const requestStop = () => {
    if (needsStopConfirm(tick)) {
      setConfirmStop(true);
      return;
    }
    void controller.stop(true);
  };

  const subText = () => {
    if (controller.isPaused) {
      return pomoText("status.paused", { count: pomoValue(tick?.session.pauseCount ?? 0) });
    }
    if (tick?.session.expectedMs) {
      const percent = Math.round(progress * 100);
      return pomoText("status.focusProgress", {
        duration: pomoValue(formatClock(elapsed)),
        percent: pomoValue(percent),
      });
    }
    return pomoText("mode.freeUnlimited");
  };

  const backdropStyle = {
    zIndex: Z_INDEX.OVERLAY_SHEET,
    backgroundImage:
      "radial-gradient(130% 90% at 50% -10%, var(--topbar-fade-start) 0%, rgba(0, 0, 0, 0) 58%)",
  } as const;

  // 完成庆祝态（仅倒计时归零自动收尾时出现）：用落库会话快照展示，
  // 不依赖 preset——presets 重拉/预设被删期间也能正常渲染。
  if (!controller.session && controller.justCompleted) {
    return (
      <div
        className="bg-page fixed inset-0 flex flex-col items-center justify-center gap-8 landscape:flex-row landscape:gap-[8vw]"
        style={backdropStyle}
      >
        <FocusRing progress={1} done className="w-[min(62vw,248px)] landscape:w-[min(46vh,240px)]">
          <span className="bg-tag-1-soft text-tag-1 mb-1.5 grid h-11 w-11 place-items-center rounded-full">
            <Check size={22} strokeWidth={3} />
          </span>
          <span className="text-ink-2 text-[11.5px] font-bold">
            {pomoText("state.elapsed")}{" "}
            {formatFocusDuration(controller.lastCompleted?.focusMs ?? 0)}
          </span>
        </FocusRing>
        <div className="flex flex-col items-center gap-3">
          <p className="text-ink-1 text-[17px] font-extrabold">{pomoText("ui.focusComplete")}</p>
          <p className="text-ink-3 text-[12px] font-semibold">
            {pomoText("ui.takeA5MinuteBreakBeforeContinuing")}
          </p>
          <div className="mt-2 flex items-center gap-3">
            {preset ? (
              <button
                type="button"
                onClick={() => {
                  controller.clearJustCompleted();
                  void controller.start(preset);
                }}
                className="shadow-lift text-ink-inverse rounded-[16px] px-6 py-3 text-[14px] font-extrabold"
                style={{ background: "var(--tau-ok)" }}
              >
                {pomoText("ui.startAnother")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onRequestClose}
              className="bg-page text-ink-2 rounded-[16px] px-6 py-3 text-[14px] font-extrabold"
            >
              {pomoText("ui.takeABreak")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!controller.session) {
    return null;
  }

  const togglePause = () =>
    controller.isPaused ? void controller.resume() : void controller.pause();

  return (
    <div className="bg-page fixed inset-0 flex flex-col" style={backdropStyle}>
      {/* 呼吸氛围光晕（仅运行中；横屏无光晕） */}
      {controller.isRunning ? (
        <div aria-hidden className="pomodoro-breath-glow landscape:hidden" />
      ) : null}

      <div className="flex items-center justify-between px-4 pt-[calc(var(--mobile-safe-top)+10px)] landscape:absolute landscape:inset-x-0 landscape:top-0 landscape:justify-start landscape:gap-1 landscape:px-5">
        <button
          type="button"
          aria-label={pomoText("ui.collapseTimerKeepsRunning")}
          onClick={onRequestClose}
          className="text-ink-2 active:bg-press grid h-10 w-10 place-items-center rounded-full"
        >
          <ChevronDown size={24} strokeWidth={2.2} />
        </button>
        <span className="text-ink-2 landscape:text-ink-3 max-w-[60%] truncate text-[12.5px] font-extrabold landscape:text-[11.5px] landscape:font-bold landscape:tracking-[0.14em]">
          {preset?.name ?? pomoText("state.focusing")}
          {preset?.mode === "countdown"
            ? pomoText("duration.minuteSuffix", { minutes: pomoValue(preset.durationMin) })
            : pomoText("mode.countupSuffix")}
        </span>
        <span className="w-10 landscape:hidden" />
      </div>

      {/* ── 竖屏：环内大时间，纵向居中 ── */}
      <div className="flex flex-1 flex-col items-center justify-center gap-7 px-8 pb-10 landscape:hidden">
        <FocusRing progress={progress} className="w-[min(62vw,248px)]">
          <span className="text-ink-1 text-[clamp(38px,12vw,52px)] leading-none font-extrabold tabular-nums">
            {formatClock(displayMs)}
          </span>
          <span className="text-ink-3 mt-2 text-[11.5px] font-bold tabular-nums">{subText()}</span>
        </FocusRing>
      </div>

      <div className="flex flex-col items-center gap-4 pb-[calc(var(--mobile-safe-bottom)+28px)] landscape:hidden">
        <PauseFab paused={controller.isPaused} busy={controller.busy} onToggle={togglePause} />
        <StopButton onClick={requestStop} />
        <p className="text-ink-3 text-[11.5px] font-bold tracking-widest">
          {pomoText("ui.putYourPhoneDownFocusOnNow")}
        </p>
      </div>

      {/* ── 横屏（独白式）：居中超大时间 + 底部发丝进度线 + 常驻对称双圆钮 ── */}
      <div className="pointer-events-none absolute inset-0 hidden place-items-center landscape:grid">
        <span
          className="text-accent text-[clamp(56px,40vh,160px)] leading-none font-light tabular-nums"
          style={{ fontFamily: "var(--tau-font-mono)" }}
        >
          {formatClock(displayMs)}
        </span>
      </div>

      <div className="bg-line-1 absolute inset-x-0 bottom-0 hidden h-[3px] landscape:block">
        <div
          className="bg-accent h-full transition-[width] duration-1000 ease-linear"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      <div className="absolute inset-x-0 bottom-[7vh] hidden items-center justify-center gap-5 landscape:flex">
        <button
          type="button"
          aria-label={controller.isPaused ? pomoText("ui.resume") : pomoText("ui.pause")}
          disabled={controller.busy}
          onClick={togglePause}
          className="shadow-lift ease-bounce text-ink-inverse grid h-12 w-12 place-items-center rounded-full transition-transform active:scale-[0.88]"
          style={{ background: "var(--tau-accent)" }}
        >
          {controller.isPaused ? (
            <Play size={19} fill="currentColor" className="ml-0.5" />
          ) : (
            <Pause size={19} fill="currentColor" />
          )}
        </button>
        <button
          type="button"
          aria-label={pomoText("ui.endFocusSession")}
          onClick={requestStop}
          className="bg-surface text-ink-1 border-line-1 shadow-float ease-bounce grid h-12 w-12 place-items-center rounded-full border transition-transform active:scale-[0.88]"
        >
          <Square size={16} fill="currentColor" />
        </button>
      </div>

      <MobileConfirmDialog
        open={confirmStop}
        title={pomoText("ui.discardThisFocusSession")}
        description={pomoText("confirm.discardShort", {
          duration: pomoValue(formatClock(elapsed)),
        })}
        confirmText={pomoText("ui.discard")}
        danger
        onCancel={() => setConfirmStop(false)}
        onConfirm={() => {
          setConfirmStop(false);
          void controller.stop(true).then(saved => {
            if (saved == null) {
              toast.info(pomoText("ui.focusSessionDiscarded"));
            }
          });
        }}
      />
    </div>
  );
}
