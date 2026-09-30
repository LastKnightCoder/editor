import React, { useEffect, useRef, useState } from "react";
import { cn } from "@tau/ui";
import {
  Check,
  ChevronUp,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";

/**
 * 播放器的控件原子件（播放按钮/时间码/音量/倍速/画中画/全屏）。
 * 三套色板：surface 纸面底栏（视频常态）、float 深色浮层（视频全屏胶囊）、light 音频卡
 */

export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

export type MediaTone = "surface" | "float" | "light";

interface ToneStyle {
  /** 图标按钮的尺寸与圆角 */
  iconBox: string;
  /** 无底色按钮的前景与悬停态（图标按钮、倍速按钮共用） */
  ghost: string;
  iconActive: string;
  time: string;
  pop: string;
  popItem: string;
  popItemActive: string;
  track: string;
  fill: string;
  knob: string;
}

const TONES: Record<MediaTone, ToneStyle> = {
  surface: {
    iconBox: "size-[30px] rounded-tau-sm",
    ghost: "text-ink-2 hover:bg-hover hover:text-ink-1",
    iconActive: "bg-hover text-ink-1",
    time: "text-ink-2",
    pop: "bg-surface text-ink-2 shadow-float",
    popItem: "hover:bg-hover hover:text-ink-1",
    popItemActive: "font-semibold text-ink-1",
    track: "bg-track",
    fill: "bg-accent",
    knob: "bg-accent",
  },
  float: {
    iconBox: "size-[30px] rounded-tau-sm",
    ghost: "text-ink-inverse/80 hover:bg-ink-inverse/15 hover:text-ink-inverse",
    iconActive: "bg-ink-inverse/15 text-ink-inverse",
    time: "text-ink-inverse/80",
    pop: "bg-ink-1 text-ink-inverse/80 shadow-float",
    popItem: "hover:bg-ink-inverse/15 hover:text-ink-inverse",
    popItemActive: "font-semibold text-ink-inverse",
    track: "bg-ink-inverse/25",
    fill: "bg-ink-inverse",
    knob: "bg-ink-inverse",
  },
  light: {
    iconBox: "size-7 rounded-full",
    ghost: "text-gray-500 hover:bg-gray-200/70 dark:text-zinc-400 dark:hover:bg-zinc-700/70",
    iconActive: "bg-gray-200/70 dark:bg-zinc-700/70",
    time: "text-gray-500 dark:text-zinc-400",
    pop: "border border-gray-200 bg-white text-gray-700 shadow-lg dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
    popItem: "hover:bg-gray-100 dark:hover:bg-zinc-700/70",
    popItemActive: "font-medium text-gray-900 dark:text-white",
    track: "bg-gray-200 dark:bg-zinc-700",
    fill: "bg-gray-800 dark:bg-zinc-300",
    knob: "bg-white shadow-[0_0_0_2px_#1f2937] dark:shadow-[0_0_0_2px_#d4d4d8]",
  },
};

const iconButtonClass = (tone: MediaTone, active = false) =>
  cn(
    "grid shrink-0 place-items-center transition-colors",
    TONES[tone].iconBox,
    TONES[tone].ghost,
    active && TONES[tone].iconActive
  );

export function PlayButton({
  playing,
  onToggle,
  tone,
}: {
  playing: boolean;
  onToggle: () => void;
  tone: MediaTone;
}) {
  const Icon = playing ? Pause : Play;
  return (
    <button
      type="button"
      title={playing ? "暂停 (K)" : "播放 (K)"}
      aria-label={playing ? "暂停" : "播放"}
      onClick={onToggle}
      className={cn(
        "grid shrink-0 place-items-center rounded-full",
        tone === "surface" &&
          "bg-accent text-ink-inverse hover:bg-accent-hover size-[30px] transition-colors",
        tone === "float" && iconButtonClass("float"),
        tone === "light" &&
          "size-7 bg-gray-900 text-white transition-opacity hover:opacity-80 dark:bg-zinc-100 dark:text-gray-900"
      )}
    >
      <Icon size={14} className={playing ? undefined : "translate-x-px"} fill="currentColor" />
    </button>
  );
}

export function TimeCode({
  children,
  tone,
  className,
}: {
  children: React.ReactNode;
  tone: MediaTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "shrink-0 whitespace-nowrap tabular-nums leading-none",
        tone === "light" ? "font-mono text-[11px]" : "font-tau-mono text-tau-sm",
        TONES[tone].time,
        className
      )}
    >
      {children}
    </span>
  );
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** 竖向音量滑杆：自身不管显隐，拖动期间通过 onDraggingChange 让外层保持弹层打开 */
function VolumeSlider({
  value,
  onChange,
  onDraggingChange,
  tone,
}: {
  value: number;
  onChange: (value: number) => void;
  onDraggingChange: (dragging: boolean) => void;
  tone: MediaTone;
}) {
  const [dragging, setDragging] = useState(false);
  const styles = TONES[tone];

  const valueAt = (target: HTMLElement, clientY: number) => {
    const rect = target.getBoundingClientRect();
    return rect.height === 0 ? value : clamp01((rect.bottom - clientY) / rect.height);
  };

  const setDrag = (next: boolean) => {
    setDragging(next);
    onDraggingChange(next);
  };

  return (
    <div
      role="slider"
      aria-label="音量"
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      className="relative flex w-5 flex-1 cursor-pointer touch-none justify-center"
      onPointerDown={event => {
        if (event.button !== 0) {
          return;
        }
        event.currentTarget.setPointerCapture(event.pointerId);
        setDrag(true);
        onChange(valueAt(event.currentTarget, event.clientY));
      }}
      onPointerMove={event => {
        if (dragging) {
          onChange(valueAt(event.currentTarget, event.clientY));
        }
      }}
      onPointerUp={() => setDrag(false)}
      onPointerCancel={() => setDrag(false)}
    >
      <div className={cn("pointer-events-none relative h-full w-1 rounded-full", styles.track)}>
        <div
          className={cn("absolute inset-x-0 bottom-0 rounded-full", styles.fill)}
          style={{ height: `${value * 100}%` }}
        />
        <span
          aria-hidden
          className={cn(
            "absolute left-1/2 size-3 -translate-x-1/2 rounded-full shadow-[0_1px_3px_rgba(0,0,0,0.3)]",
            styles.knob
          )}
          style={{ bottom: `calc(${value * 100}% - 6px)` }}
        />
      </div>
    </div>
  );
}

/** 音量：悬停图标在上方弹出竖向滑杆（不占横向宽度），悬停时滚轮也可调节 */
export function VolumeControl({
  volume,
  muted,
  onVolumeChange,
  onToggleMute,
  onActiveChange,
  tone,
}: {
  volume: number;
  muted: boolean;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
  /** 弹层打开（悬停或拖动中）状态变化，供全屏胶囊在调节期间保持显示 */
  onActiveChange?: (active: boolean) => void;
  tone: MediaTone;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [hovering, setHovering] = useState(false);
  const [dragging, setDragging] = useState(false);
  const open = hovering || dragging;
  const shown = muted ? 0 : volume;
  const Icon = shown === 0 ? VolumeX : shown < 0.5 ? Volume1 : Volume2;

  const onActiveChangeRef = useRef(onActiveChange);
  onActiveChangeRef.current = onActiveChange;
  useEffect(() => {
    onActiveChangeRef.current?.(open);
  }, [open]);

  // React 的 wheel 监听是 passive 的，拦截页面滚动需要原生非 passive 监听
  const volumeRef = useRef(shown);
  volumeRef.current = shown;
  const onVolumeChangeRef = useRef(onVolumeChange);
  onVolumeChangeRef.current = onVolumeChange;
  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      onVolumeChangeRef.current(clamp01(volumeRef.current - Math.sign(event.deltaY) * 0.05));
    };
    root.addEventListener("wheel", onWheel, { passive: false });
    return () => root.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div
      ref={rootRef}
      className="relative shrink-0"
      onPointerEnter={() => setHovering(true)}
      onPointerLeave={() => setHovering(false)}
    >
      <button
        type="button"
        title={muted ? "取消静音 (M)" : "静音 (M)"}
        aria-label={muted ? "取消静音" : "静音"}
        onClick={onToggleMute}
        className={iconButtonClass(tone, open)}
      >
        <Icon size={15} />
      </button>
      <div
        className={cn(
          "absolute bottom-full left-1/2 z-30 -translate-x-1/2 pb-2 transition-opacity duration-150",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      >
        <div
          className={cn(
            "rounded-tau-sm flex h-[118px] w-9 flex-col items-center gap-2 pb-2 pt-3",
            TONES[tone].pop
          )}
        >
          <VolumeSlider
            tone={tone}
            value={shown}
            onChange={onVolumeChange}
            onDraggingChange={setDragging}
          />
          <span className="font-tau-mono text-[10.5px] tabular-nums leading-none">
            {Math.round(shown * 100)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function RateMenu({
  rate,
  onRateChange,
  onOpenChange,
  tone,
  className,
}: {
  rate: number;
  onRateChange: (rate: number) => void;
  onOpenChange?: (open: boolean) => void;
  tone: MediaTone;
  className?: string;
}) {
  const [open, setOpenState] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const styles = TONES[tone];

  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  const setOpen = (next: boolean) => {
    setOpenState(next);
    onOpenChangeRef.current?.(next);
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    const onDocPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpenState(false);
        onOpenChangeRef.current?.(false);
      }
    };
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative shrink-0", className)}>
      <button
        type="button"
        title="播放速度"
        aria-label={`播放速度 ${rate} 倍`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-0.5 px-2 transition-colors",
          tone === "light"
            ? "h-7 rounded-full font-mono text-[11px]"
            : "rounded-tau-sm font-tau-mono text-tau-sm h-[26px]",
          styles.ghost,
          open && styles.iconActive
        )}
      >
        {rate}×
        {tone === "light" && (
          <ChevronUp size={12} className={cn("transition-transform", !open && "rotate-180")} />
        )}
      </button>
      {open && (
        <div
          role="listbox"
          aria-label="播放速度"
          className={cn(
            "absolute bottom-full right-0 z-30 mb-2 flex min-w-[88px] flex-col gap-0.5 p-1",
            tone === "light" ? "rounded-xl" : "rounded-tau-sm",
            styles.pop
          )}
        >
          {PLAYBACK_RATES.map(option => (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={rate === option}
              onClick={() => {
                onRateChange(option);
                setOpen(false);
              }}
              className={cn(
                "flex items-center justify-between gap-3 rounded-[6px] px-2 py-1 transition-colors",
                tone === "light" ? "font-mono text-[11px]" : "font-tau-mono text-tau-sm",
                styles.popItem,
                rate === option && styles.popItemActive
              )}
            >
              {option}×{rate === option && <Check size={12} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function PipButton({
  active,
  onToggle,
  tone,
  className,
}: {
  active: boolean;
  onToggle: () => void;
  tone: MediaTone;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={active ? "退出画中画 (P)" : "画中画 (P)"}
      aria-label={active ? "退出画中画" : "画中画"}
      onClick={onToggle}
      className={cn(iconButtonClass(tone, active), className)}
    >
      <PictureInPicture2 size={15} />
    </button>
  );
}

export function FullscreenToggle({
  fullscreen,
  onToggle,
  tone,
}: {
  fullscreen: boolean;
  onToggle: () => void;
  tone: MediaTone;
}) {
  return (
    <button
      type="button"
      title={fullscreen ? "退出全屏 (F)" : "全屏 (F)"}
      aria-label={fullscreen ? "退出全屏" : "全屏"}
      onClick={onToggle}
      className={iconButtonClass(tone)}
    >
      {fullscreen ? <Minimize size={15} /> : <Maximize size={15} />}
    </button>
  );
}

/** 供进度条复用的色板（轨道 / 填充 / 拖动点） */
export const mediaToneTrack = (tone: MediaTone) => ({
  track: TONES[tone].track,
  fill: TONES[tone].fill,
  knob: TONES[tone].knob,
});
