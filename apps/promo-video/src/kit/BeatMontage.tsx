import type { ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { ease, progress } from "../brand/motion";

/**
 * 按节拍硬切：cuts[i] 占 [bounds[i], bounds[i+1]) 帧。每个镜头入场 5 帧轻微放大回落 + 运动模糊，镜头内缓推。
 */
export function BeatMontage({ bounds, cuts, push = 0.05 }: { bounds: number[]; cuts: ((local: number, len: number) => ReactNode)[]; push?: number }) {
  const frame = useCurrentFrame();
  const i = bounds.findIndex((start, k) => frame >= start && frame < (bounds[k + 1] ?? Infinity));
  if (i < 0 || i >= cuts.length) return null;
  const start = bounds[i];
  const len = (bounds[i + 1] ?? start + 30) - start;
  const local = frame - start;
  const enter = progress(local, 0, 5, ease.out);
  const scale = (1.035 - 0.035 * enter) * (1 + push * progress(local, 0, len, ease.soft));
  return <AbsoluteFill style={{ transform: `scale(${scale})`, filter: enter < 1 ? `blur(${(1 - enter) * 5}px)` : undefined }}>{cuts[i](local, len)}</AbsoluteFill>;
}
