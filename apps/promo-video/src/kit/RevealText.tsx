import type { CSSProperties } from "react";
import { useCurrentFrame } from "remotion";
import { ease, progress } from "../brand/motion";

/**
 * 逐字浮现：每个字自下方 0.35em、带模糊淡入，stagger 帧错开。
 * exitAt 后整行统一淡出上移，避免逐字退场显得拖沓。
 */
export function RevealText({
  text,
  startAt,
  stagger = 3,
  duration = 34,
  exitAt,
  exitDuration = 24,
  style,
  charStyle,
}: {
  text: string;
  startAt: number;
  stagger?: number;
  duration?: number;
  exitAt?: number;
  exitDuration?: number;
  style?: CSSProperties;
  charStyle?: (index: number) => CSSProperties | undefined;
}) {
  const frame = useCurrentFrame();
  const exit = exitAt === undefined ? 0 : progress(frame, exitAt, exitDuration, ease.in);
  return (
    <span
      style={{
        display: "inline-block",
        whiteSpace: "pre",
        opacity: 1 - exit,
        transform: `translateY(${-exit * 0.25}em)`,
        filter: exit > 0 ? `blur(${exit * 6}px)` : undefined,
        ...style,
      }}
    >
      {[...text].map((char, i) => {
        const t = progress(frame, startAt + i * stagger, duration);
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity: t,
              transform: `translateY(${(1 - t) * 0.35}em)`,
              filter: t < 1 ? `blur(${(1 - t) * 8}px)` : undefined,
              ...charStyle?.(i),
            }}
          >
            {char}
          </span>
        );
      })}
    </span>
  );
}
