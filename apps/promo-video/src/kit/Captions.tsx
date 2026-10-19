import { useCurrentFrame, useVideoConfig } from "remotion";
import { ease, mixColor, progress } from "../brand/motion";
import { fonts, palette } from "../brand/tokens";

import type { Cue } from "./srt";

export type { Cue };

/** 画面字幕轨：night 决定字色（白昼藏青墨 → 夜空象牙白），底部留出 B 站进度条区域 */
export function Captions({ cues, night = 0 }: { cues: Cue[]; night?: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cue = cues.find(c => frame >= c.from * fps && frame < c.to * fps);
  if (!cue) return null;
  const start = cue.from * fps;
  const end = cue.to * fps;
  const enter = progress(frame, start, 22);
  const exit = progress(frame, end - 16, 16, ease.in);
  const t = enter * (1 - exit);
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 96,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          fontFamily: fonts.caption,
          fontSize: 34,
          fontWeight: 500,
          letterSpacing: "0.08em",
          color: mixColor(palette.day.ink, palette.night.ink, night),
          opacity: t,
          transform: `translateY(${(1 - enter) * 10}px)`,
          filter: t < 1 ? `blur(${(1 - t) * 4}px)` : undefined,
          textShadow: night > 0.5 ? "0 2px 18px rgba(5, 9, 24, 0.85)" : "0 1px 14px rgba(247, 243, 234, 0.9)",
        }}
      >
        {cue.text}
      </div>
    </div>
  );
}
