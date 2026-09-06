import React, { useEffect, useRef, useState } from "react";
import classNames from "classnames";
import {
  Check,
  ChevronUp,
  Maximize,
  Minimize,
  Pause,
  Play,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import ProgressBar from "./ProgressBar";

/**
 * 播放器的控件原子件（播放按钮/时间码/音量/倍速/全屏），
 * 深色皮肤（浮在视频画面上）与浅色皮肤（音频卡上）共用
 */

export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

type Tone = "dark" | "light";

const iconButtonClass = (tone: Tone) =>
  classNames(
    "grid size-7 shrink-0 place-items-center rounded-full transition-colors",
    tone === "dark"
      ? "text-white hover:bg-white/15"
      : "text-gray-500 hover:bg-gray-200/70 dark:text-zinc-400 dark:hover:bg-zinc-700/70"
  );

export function PlayButton({
  playing,
  onToggle,
  tone,
}: {
  playing: boolean;
  onToggle: () => void;
  tone: Tone;
}) {
  const Icon = playing ? Pause : Play;
  return (
    <button
      type="button"
      title={playing ? "暂停" : "播放"}
      aria-label={playing ? "暂停" : "播放"}
      onClick={onToggle}
      className={classNames(
        "grid size-7 shrink-0 place-items-center rounded-full",
        tone === "dark"
          ? "text-white transition-colors hover:bg-white/15"
          : "bg-gray-900 text-white transition-opacity hover:opacity-80 dark:bg-zinc-100 dark:text-gray-900"
      )}
    >
      <Icon size={14} className={playing ? undefined : "translate-x-[1px]"} fill="currentColor" />
    </button>
  );
}

export function TimeCode({ children, tone }: { children: React.ReactNode; tone: Tone }) {
  return (
    <span
      className={classNames(
        "shrink-0 font-mono text-[11px] tabular-nums leading-none",
        tone === "dark" ? "text-white/90" : "text-gray-500 dark:text-zinc-400"
      )}
    >
      {children}
    </span>
  );
}

export function VolumeControl({
  volume,
  muted,
  onVolumeChange,
  onToggleMute,
  tone,
}: {
  volume: number;
  muted: boolean;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
  tone: Tone;
}) {
  const Icon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  return (
    <div className="group/vol flex shrink-0 items-center">
      <button
        type="button"
        title={muted ? "取消静音" : "静音"}
        aria-label={muted ? "取消静音" : "静音"}
        onClick={onToggleMute}
        className={iconButtonClass(tone)}
      >
        <Icon size={15} />
      </button>
      <div className="w-0 overflow-hidden transition-[width] duration-200 group-focus-within/vol:w-20 group-hover/vol:w-20">
        <ProgressBar
          tone={tone}
          value={muted ? 0 : volume}
          onScrub={onVolumeChange}
          onCommit={onVolumeChange}
          className="mx-2"
        />
      </div>
    </div>
  );
}

export function RateMenu({
  rate,
  onRateChange,
  tone,
}: {
  rate: number;
  onRateChange: (rate: number) => void;
  tone: Tone;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onDocPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown);
    };
  }, [open]);

  const dark = tone === "dark";
  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        title="播放速度"
        aria-label={`播放速度 ${rate} 倍`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
        className={classNames(
          "flex h-7 items-center gap-0.5 rounded-full px-2 font-mono text-[11px] transition-colors",
          dark
            ? "text-white hover:bg-white/15"
            : "text-gray-500 hover:bg-gray-200/70 dark:text-zinc-400 dark:hover:bg-zinc-700/70",
          open && (dark ? "bg-white/15" : "bg-gray-200/70 dark:bg-zinc-700/70")
        )}
      >
        {rate}x
        <ChevronUp
          size={12}
          className={classNames("transition-transform", !open && "rotate-180")}
        />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label="播放速度"
          className={classNames(
            "absolute bottom-full right-0 z-30 mb-2 flex flex-col gap-0.5 rounded-xl border p-1 shadow-lg",
            dark
              ? "border-white/15 bg-black/80 text-white backdrop-blur"
              : "border-gray-200 bg-white text-gray-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
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
              className={classNames(
                "flex items-center justify-between gap-3 rounded-lg px-2.5 py-1 font-mono text-[11px] transition-colors",
                dark ? "hover:bg-white/15" : "hover:bg-gray-100 dark:hover:bg-zinc-700/70",
                rate === option &&
                  (dark ? "text-white" : "font-medium text-gray-900 dark:text-white")
              )}
            >
              {option}x{rate === option && <Check size={12} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function FullscreenToggle({
  containerRef,
}: {
  containerRef: React.RefObject<HTMLElement | null>;
}) {
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
    };
  }, [containerRef]);
  return (
    <button
      type="button"
      title={fullscreen ? "退出全屏" : "全屏"}
      aria-label={fullscreen ? "退出全屏" : "全屏"}
      onClick={() => {
        const container = containerRef.current;
        if (!container) {
          return;
        }
        if (document.fullscreenElement) {
          void document.exitFullscreen();
        } else {
          void container.requestFullscreen?.().catch(() => undefined);
        }
      }}
      className={iconButtonClass("dark")}
    >
      {fullscreen ? <Minimize size={15} /> : <Maximize size={15} />}
    </button>
  );
}
