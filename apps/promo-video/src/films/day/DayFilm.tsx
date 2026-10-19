import type { ReactNode } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { TRACKS } from "../../brand/music";
import { Captions } from "../../kit/Captions";
import { Soundtrack } from "../../kit/Soundtrack";
import { Sky } from "../../kit/Sky";
import { TimeChip } from "../../kit/TimeChip";
import { CUES, TIME_MARKS } from "./copy";
import { DayWorld } from "./scenes/DayWorld";
import { Finale } from "./scenes/Finale";
import { MapWindowScene } from "./scenes/MapWindowScene";
import { Prologue } from "./scenes/Prologue";
import { StarScene } from "./scenes/StarScene";
import { f, T } from "./timeline";

export const DAY_DURATION = f(T.end);

export function nightAt(frame: number) {
  return interpolate(
    frame,
    T.night.map(([s]) => f(s)),
    T.night.map(([, v]) => v),
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
}

/** 只在 [from, to) 秒内挂载；不像 Sequence 那样重置帧号——各场景直接按绝对时间轴 T 计时 */
function During({ from = 0, to = Infinity, children }: { from?: number; to?: number; children: ReactNode }) {
  const frame = useCurrentFrame();
  if (frame < f(from) || frame >= f(to)) return null;
  return <AbsoluteFill>{children}</AbsoluteFill>;
}

export function DayFilm() {
  const frame = useCurrentFrame();
  const night = nightAt(frame);
  return (
    <AbsoluteFill>
      <Sky night={night} />
      <During to={T.prologue.exit + 1}>
        <Prologue />
      </During>
      <During to={T.overview.collapse[1] + 0.6}>
        <DayWorld />
      </During>
      <During from={T.stars.start} to={T.stars.toWindow[1] + 0.6}>
        <StarScene />
      </During>
      <During from={T.stars.toWindow[0]} to={T.map.exit[1] + 0.2}>
        <MapWindowScene />
      </During>
      <During from={T.map.exit[0]}>
        <Finale />
      </During>
      <TimeChip marks={TIME_MARKS.map(m => ({ ...m, at: f(m.at) }))} night={night} until={f(T.stars.toWindow[0])} />
      <Captions cues={CUES} night={night} />
      <Soundtrack track={TRACKS.inspiringPianoStrings} />
    </AbsoluteFill>
  );
}
