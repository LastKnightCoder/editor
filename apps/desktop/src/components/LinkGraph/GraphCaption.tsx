/**
 * 画布左下角的一行说明：「1298 条笔记 · 始于 2021 年 3 月」（量词由宿主给）。
 *
 * 它同时是入场动画的入口与进度，但长得不像工具：平时是一行很淡的图例式文字，
 * 悬停才变深并在前面露出播放符号，点了就播。播放时这行字本身就是进度——
 * 日期与张数跟着动画走，播完变回静态描述。没有进度条、暂停、倍速：
 * 这是「看自己的积累长出来」，不是查数据；时长已按节点数封顶，不会播很久。
 * 播放中再点一下（或按 Esc）直接跳到结尾。
 *
 * 宿主可以传 hint 临时换掉静态描述（数量跨过里程碑时的邀请，见知识地图页）。
 */

import { useEffect } from "react";
import { Play } from "lucide-react";
import { cn } from "@tau/ui";
import type { PlaybackControls } from "./useGraphEngine";

const monthFormat = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long" });

export function formatMonth(time: number) {
  return time > 0 ? monthFormat.format(new Date(time)) : "";
}

interface GraphCaptionProps {
  playback: PlaybackControls;
  /** 节点总数 */
  total: number;
  /** 量词与名词，如 { measure: "条", noun: "笔记" } */
  unit: { measure: string; noun: string };
  /** 最早一张卡的创建时间；0 表示没有 */
  since: number;
  /** 替换静态描述的邀请语（里程碑），不传就显示描述 */
  hint?: string | null;
}

export function GraphCaption({ playback, total, unit, since, hint }: GraphCaptionProps) {
  const { state, play, stop } = playback;
  const playing = state.active;

  // 播放中按 Esc 跳到结尾
  useEffect(() => {
    if (!playing) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      stop();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playing, stop]);

  if (total === 0) return null;

  const month = formatMonth(playing ? state.time : since);
  const text = playing
    ? [month, `${state.shown} ${unit.measure}`].filter(Boolean).join(" · ")
    : (hint ??
      [`${total} ${unit.measure}${unit.noun}`, month && `始于 ${month}`]
        .filter(Boolean)
        .join(" · "));

  return (
    <button
      type="button"
      onClick={playing ? stop : play}
      aria-label={
        playing ? `正在播放：${text}。点击跳到结尾` : `${text}。播放${unit.noun}的生长过程`
      }
      title={playing ? "跳到结尾" : `播放${unit.noun}的生长过程`}
      className={cn(
        "group absolute bottom-3.5 left-6 flex cursor-pointer items-center gap-1.5 rounded-full py-1 pl-2.5 pr-3",
        "text-tau-meta tabular-nums outline-none",
        "ease-tau-out transition-[color,background] duration-[200ms]",
        "focus-visible:shadow-[var(--tau-focus-ring)]",
        playing || hint ? "text-ink-2" : "text-ink-3 hover:text-ink-1",
        "hover:bg-hover/60"
      )}
    >
      <Play
        className={cn(
          "size-[11px] shrink-0 transition-opacity duration-[200ms]",
          // 播放符号只在悬停 / 邀请时露出；播放中不显示（再点是跳到结尾）
          playing ? "opacity-0" : hint ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          "group-focus-visible:opacity-100"
        )}
        strokeWidth={2}
        fill="currentColor"
        aria-hidden
      />
      <span className="whitespace-nowrap">{text}</span>
    </button>
  );
}
