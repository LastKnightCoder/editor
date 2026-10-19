import { Easing, interpolate, interpolateColors } from "remotion";
import { VIDEO } from "./tokens";

/** 缓动词表：out 与软件 --tau-ease-out 同源，inOut 用于镜头运动 */
export const ease = {
  out: Easing.bezier(0.22, 1, 0.36, 1),
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
  expoInOut: Easing.bezier(0.87, 0, 0.13, 1),
  in: Easing.bezier(0.55, 0, 1, 0.45),
  soft: Easing.bezier(0.45, 0.05, 0.25, 1),
} as const;

export type EaseFn = (t: number) => number;

export const sec = (s: number) => Math.round(s * VIDEO.fps);

/** frame 落在 [start, start+duration] 的 0→1 进度（两端钳制） */
export function progress(frame: number, start: number, duration: number, easing: EaseFn = ease.out) {
  return interpolate(frame, [start, start + duration], [0, 1], {
    easing,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

/** 入场 → 停留 → 退场的包络，返回 0→1→0 */
export function envelope(frame: number, from: number, to: number, fadeIn = 18, fadeOut = 18) {
  const enter = progress(frame, from, fadeIn);
  const exit = 1 - progress(frame, to - fadeOut, fadeOut, ease.in);
  return Math.min(enter, exit);
}

export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export const mixColor = (a: string, b: string, t: number) => interpolateColors(Math.min(1, Math.max(0, t)), [0, 1], [a, b]);
