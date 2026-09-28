/**
 * 番茄沉浸窗（全屏置顶，路由 /pomodoro/immersive）：纯黑底 + 大号黑色翻牌时钟（白字），
 * 牌面不跟随主题色（窗口固定深色 token 只供控件与弹出层用）。
 * 除时间外只留上方一行暗色信息：预设名 · 状态。
 * 控件（背景音 / 暂停继续 / 结束 / 退出）随鼠标移动浮出，静止 2.2 秒淡出；暂停、确认、完成时常显。
 * Esc 退出，空格暂停继续。结束后牌面停住、原位显示结果，可再来一个。
 */

import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { AlertTriangle, Check, Music, Pause, Play, Square, X } from "lucide-react";
import { cn } from "@tau/ui";
import { hidePomodoroImmersiveWindow } from "@/commands/window";
import { formatClock, formatDurationCN, isEarlyStop } from "../model";
import { usePomodoroPresets } from "../queries";
import { pomodoroActions, useLiveTiming } from "../timerStore";
import { FlipClock } from "../components/FlipClock";
import { PresetDot } from "../components/PomodoroBits";
import { SoundPopover } from "../components/SoundPopover";
import { useAuxWindowBoot, useEndResult } from "./useAuxWindow";

const IDLE_MS = 2200;

/** 圆形控件；作为 Popover 触发器时须透传注入的 props 与 ref（React 19 ref 即 prop） */
function RoundButton({
  label,
  primary,
  paused,
  className,
  children,
  ...rest
}: ComponentProps<"button"> & { label: string; primary?: boolean; paused?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={cn(
        "grid flex-none place-items-center rounded-full transition-colors duration-150",
        primary
          ? cn(
              "text-ink-inverse size-[max(44px,8vh)]",
              paused ? "bg-warn" : "bg-accent hover:bg-accent-hover"
            )
          : "bg-page/70 text-ink-2 hover:bg-page hover:text-ink-1 size-[max(36px,6.4vh)]",
        className
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
  tone?: "neutral" | "primary" | "danger";
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-[max(30px,5.4vh)] rounded-[max(9px,1.6vh)] px-[max(14px,2.4vh)] text-[length:max(12px,2vh)] font-medium transition-colors duration-150",
        tone === "primary" && "bg-accent text-ink-inverse hover:bg-accent-hover",
        tone === "danger" && "bg-danger-soft text-danger",
        tone === "neutral" && "bg-page/70 text-ink-1 hover:bg-page"
      )}
    >
      {children}
    </button>
  );
}

export function ImmersiveWindow() {
  const { dbReady } = useAuxWindowBoot({ forceMode: "dark" });
  const presets = usePomodoroPresets(dbReady);
  const { session, timing } = useLiveTiming();
  const [result, dismissResult] = useEndResult();
  const [confirming, setConfirming] = useState(false);
  const [awake, setAwake] = useState(true);
  const idleTimer = useRef(0);

  const exit = () => {
    dismissResult();
    setConfirming(false);
    void hidePomodoroImmersiveWindow();
  };
  const stop = () => {
    if (timing?.willDiscard && !confirming) return setConfirming(true);
    setConfirming(false);
    void pomodoroActions.stop();
  };

  const wake = () => {
    setAwake(true);
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setAwake(false), IDLE_MS);
  };
  useEffect(() => {
    wake();
    return () => window.clearTimeout(idleTimer.current);
  }, []);

  // 窗口常驻隐藏复用：Esc 退出、空格暂停继续（弹出的背景音面板自己消费 Esc）
  const exitRef = useRef(exit);
  exitRef.current = exit;
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || document.querySelector("[data-float-card]")) return;
      if (e.key === "Escape") exitRef.current();
      else if (e.key === " " && !(e.target instanceof Element && e.target.closest("button"))) {
        e.preventDefault();
        void pomodoroActions.toggle();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const nameOf = (presetId: number) => presets.byId.get(presetId)?.name ?? "专注";
  const showConfirm = !!(confirming && timing?.willDiscard);
  const paused = !!timing?.paused;
  const pinned = paused || showConfirm || !!result || !session;

  let meta: ReactNode = null;
  let clock = "00:00";
  let controls: ReactNode = null;

  if (session && timing) {
    const countdown = timing.remainMs !== undefined;
    clock = formatClock(timing.displayMs);
    meta = (
      <>
        <PresetDot presetId={session.presetId} className="size-[max(7px,1.1vh)]" />
        <span>{nameOf(session.presetId)}</span>
        <span className={paused ? "text-warn font-medium" : "text-ink-3"}>
          · {paused ? "已暂停" : countdown ? "剩余" : "已专注"}
        </span>
      </>
    );
    controls = showConfirm ? (
      <>
        <span className="text-warn mr-1 flex items-center gap-2 text-[length:max(12px,2vh)]">
          <AlertTriangle className="size-[max(14px,2.2vh)]" strokeWidth={1.75} />
          不足 5 分钟，结束后不会留下记录
        </span>
        <TextButton onClick={() => setConfirming(false)}>继续专注</TextButton>
        <TextButton tone="danger" onClick={stop}>
          仍然结束
        </TextButton>
      </>
    ) : (
      <>
        <SoundPopover
          placement="top"
          trigger={
            <RoundButton label="背景音">
              <Music className="size-[max(14px,2.4vh)]" strokeWidth={1.75} />
            </RoundButton>
          }
        />
        <RoundButton
          primary
          paused={paused}
          label={paused ? "继续（空格）" : "暂停（空格）"}
          onClick={() => void pomodoroActions.toggle()}
        >
          {paused ? (
            <Play className="ml-0.5 size-[max(14px,2.4vh)] fill-current" strokeWidth={0} />
          ) : (
            <Pause className="size-[max(14px,2.4vh)] fill-current" strokeWidth={0} />
          )}
        </RoundButton>
        <RoundButton label="结束" onClick={stop}>
          <Square className="size-[max(14px,2.4vh)]" strokeWidth={1.75} />
        </RoundButton>
        <RoundButton label="退出沉浸（Esc）" onClick={exit}>
          <X className="size-[max(14px,2.4vh)]" strokeWidth={1.75} />
        </RoundButton>
      </>
    );
  } else if (result) {
    const early = isEarlyStop(result);
    clock = result.saved && result.expectedMs && !early ? "00:00" : formatClock(result.focusMs);
    meta = result.saved ? (
      <span className="text-ok flex items-center gap-2">
        <Check className="size-[max(13px,2.2vh)]" strokeWidth={2.4} />
        完成「{nameOf(result.presetId)}」
        <span className="text-ink-3">
          · {early ? "提前结束 · " : ""}
          {formatDurationCN(result.focusMs)}
        </span>
      </span>
    ) : (
      <span className="text-warn flex items-center gap-2">
        <AlertTriangle className="size-[max(13px,2.2vh)]" strokeWidth={1.75} />
        不足 5 分钟，本次未记录
      </span>
    );
    const preset = presets.byId.get(result.presetId);
    controls = (
      <>
        {preset && (
          <TextButton tone="primary" onClick={() => void pomodoroActions.start(preset)}>
            再来一个
          </TextButton>
        )}
        <TextButton onClick={exit}>退出沉浸</TextButton>
      </>
    );
  } else {
    meta = <span className="text-ink-3">没有进行中的专注</span>;
    controls = <TextButton onClick={exit}>退出沉浸</TextButton>;
  }

  return (
    <div
      onMouseMove={wake}
      className={cn(
        "font-tau text-ink-1 relative h-screen w-screen select-none overflow-hidden bg-black antialiased",
        !awake && !pinned && "cursor-none"
      )}
    >
      <span
        className={cn(
          "text-ink-3 absolute right-[4vw] top-[4vh] text-[length:max(11px,1.7vh)] transition-opacity duration-500",
          awake ? "opacity-100" : "opacity-0"
        )}
      >
        <kbd className="bg-page text-ink-2 rounded-[5px] px-1.5 py-0.5 font-mono text-[0.9em]">
          Esc
        </kbd>{" "}
        退出
      </span>

      <div className="absolute inset-0 flex items-center justify-center">
        {/* 信息行与牌组左对齐 */}
        <div className="flex flex-col items-stretch [--ch:min(50vh,21vw)]">
          <div className="text-ink-2 mb-[max(16px,4.4vh)] flex items-center gap-[max(8px,1.2vh)] whitespace-nowrap pl-[calc(var(--ch)*0.02)] text-[length:max(12px,2.1vh)]">
            {meta}
          </div>
          <FlipClock time={clock} dimmed={paused} />
        </div>
      </div>

      <div
        className={cn(
          "absolute inset-x-0 bottom-[6vh] flex items-center justify-center gap-[max(10px,1.6vh)] transition-[opacity,transform] duration-500",
          awake || pinned
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-1.5 opacity-0"
        )}
      >
        {controls}
      </div>
    </div>
  );
}

export default ImmersiveWindow;
