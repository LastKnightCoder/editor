/** 开场：破晓的天幕上两行字，随后今日窗口从下方升起（窗口在 DayWorld 里） */
import { AbsoluteFill } from "remotion";
import { fonts, palette } from "../../../brand/tokens";
import { RevealText } from "../../../kit/RevealText";
import { PROLOGUE } from "../copy";
import { f, T } from "../timeline";

export function Prologue() {
  return (
    <AbsoluteFill style={{ display: "grid", placeItems: "center" }}>
      <div style={{ fontFamily: fonts.display, color: palette.day.ink, textAlign: "center", fontWeight: 600, lineHeight: 1.5, marginTop: -60 }}>
        <div style={{ fontSize: 76 }}>
          <RevealText text={PROLOGUE[0]} startAt={f(T.prologue.headline)} stagger={4} exitAt={f(T.prologue.exit)} />
        </div>
        <div style={{ fontSize: 50, marginTop: 10, fontWeight: 500, color: palette.day.ink2 }}>
          <RevealText
            text={PROLOGUE[1]}
            startAt={f(T.prologue.headline + 0.9)}
            stagger={3}
            exitAt={f(T.prologue.exit) + 6}
            charStyle={i => (i >= 5 && i <= 8 ? { color: palette.day.accent } : undefined)}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
}
