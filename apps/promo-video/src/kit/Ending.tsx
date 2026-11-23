import { AbsoluteFill } from "remotion";
import { ease, progress } from "../brand/motion";
import { fonts } from "../brand/tokens";
import { StageFill, useStage } from "./Stage";
import { Wordmark } from "./Wordmark";

/** 片尾：字标 + 一句话 + 网址，依次浮现；out 前整体淡出 */
export function Ending({ frame, at, out, line, url }: { frame: number; at: number; out: number; line: string; url: string }) {
  const stage = useStage();
  if (frame < at) return null;
  const fill = progress(frame, at, 30, ease.inOut);
  const item = (delay: number) => {
    const t = progress(frame, at + 30 + delay, 26, ease.out) * (1 - progress(frame, out - 30, 30, ease.in));
    return { opacity: t, transform: `translateY(${(1 - t) * 14}px)` };
  };
  return (
    <AbsoluteFill style={{ opacity: fill, zIndex: 70 }}>
      <StageFill />
      <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 30 }}>
        <div style={item(0)}>
          <Wordmark size={96} />
        </div>
        <div style={{ ...item(14), fontFamily: fonts.caption, fontSize: 34, letterSpacing: "0.2em", color: stage.ink2 }}>{line}</div>
        <div style={{ ...item(28), fontFamily: fonts.label, fontSize: 30, letterSpacing: "0.06em", color: stage.brand[0] }}>{url}</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
