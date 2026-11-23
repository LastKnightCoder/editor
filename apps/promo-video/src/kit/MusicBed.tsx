import { Sequence, useVideoConfig } from "remotion";
import type { Track } from "../brand/music";
import { Soundtrack } from "./Soundtrack";

/** 配乐接第二遍：第一遍在曲尾淡出前接上，两遍之间交叉淡化，第二遍的曲尾对齐片尾 */
const MUSIC_JOIN = { before: 12, crossfade: 4 };

/**
 * 铺满全片的配乐：曲子够长就一遍到底；不够长时接第二遍（见上），改了片长不用改这里。
 * gain 按帧再乘一层音量（如打字时让配乐退后），传入的是全片的绝对帧号。
 */
export function MusicBed({ track, frames, gain, fadeIn = 1.5, fadeOut = 3 }: { track: Track; frames: number; gain?: (frame: number) => number; fadeIn?: number; fadeOut?: number }) {
  const { fps } = useVideoConfig();
  const first = (track.duration ?? Infinity) - track.offset - MUSIC_JOIN.before;
  if (frames / fps <= first) return <Soundtrack track={track} volume={1} fadeIn={fadeIn} fadeOut={fadeOut} gain={gain} />;
  const joinAt = Math.round(first * fps);
  const secondFrom = joinAt - MUSIC_JOIN.crossfade * fps;
  const secondStart = (track.duration ?? 0) - (frames - secondFrom) / fps;
  return (
    <>
      <Sequence durationInFrames={joinAt} layout="none">
        <Soundtrack track={track} volume={1} fadeIn={fadeIn} fadeOut={MUSIC_JOIN.crossfade} gain={gain} />
      </Sequence>
      <Sequence from={secondFrom} layout="none">
        <Soundtrack track={track} startAt={secondStart} volume={1} fadeIn={MUSIC_JOIN.crossfade} fadeOut={fadeOut} gain={frame => gain?.(frame + secondFrom) ?? 1} />
      </Sequence>
    </>
  );
}
