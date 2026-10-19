import type { ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { sec } from "../brand/motion";

/** 只在 [from, to) 秒内挂载子树；不像 Sequence 那样重置帧号，场景直接读绝对时间轴 */
export function During({ from = 0, to = 1e9, children }: { from?: number; to?: number; children: ReactNode }) {
  const frame = useCurrentFrame();
  if (frame < sec(from) || frame >= sec(to)) return null;
  return <AbsoluteFill>{children}</AbsoluteFill>;
}
