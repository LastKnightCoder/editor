/**
 * 视频笔记宣传版：和功能片同一套画面（scenes.tsx），时间轴按配乐 Cat Walk 的小节排（promo-script.ts）。
 * 没有操作字幕；转录完成后字幕一拍长出一句，章节分段、摘录、截帧都落在重拍上。
 */
import { TRACKS } from "../../../brand/music";
import { Sequence } from "remotion";
import { Soundtrack } from "../../../kit/Soundtrack";
import { CHAT } from "../../../mock/videonote";
import { FeatureFrame } from "../shared/FeatureFrame";
import { layout, type Timeline } from "../shared/timeline.ts";
import { beatsSince, MUSIC_CLIPS } from "./beats.ts";
import { PROMO_CHAPTERS, PROMO_ENDING, PROMO_ENDING_AT, PROMO_INTRO, PROMO_INTRO_AT, PROMO_TAGS, PROMO_WINDOW_FROM } from "./promo-script.ts";
import { createScenes } from "./scenes";

const TIMELINE: Timeline = layout(PROMO_CHAPTERS, PROMO_ENDING_AT);

/** 字幕一拍长出一句：转录完成那一拍出第一句，之后每拍一句，8 拍铺满（TranscriptList 的 reveal 按句数加 3 换算） */
const REVEAL_BEATS = 8;

const SCENES = createScenes(TIMELINE, {
  // 宣言还没散开时就已播到划的那句（02:50），字幕列表先滚到位；划句时常速播，摘进笔记后 3.2 倍速
  noteT0: 2 * 60 + 51,
  quoteSpeed: 1,
  noteSpeed: 3.2,
  askTurns: [
    { exchange: CHAT.summary, answerFrames: 150 },
    { exchange: CHAT.quote, answerFrames: 120 },
    { exchange: CHAT.search, answerFrames: 130 },
  ],
  transcriptReveal: (frame, done) => Math.min(1, beatsSince(done, frame, 10) / REVEAL_BEATS),
});

/** 配乐分段接起来：剪口落在小节线上，接缝处两段各淡 2 帧免得爆音 */
function PromoMusic() {
  return (
    <>
      {MUSIC_CLIPS.map((clip, i) => {
        const to = MUSIC_CLIPS[i + 1]?.from ?? TIMELINE.end;
        const last = i === MUSIC_CLIPS.length - 1;
        return (
          <Sequence key={clip.from} from={clip.from} durationInFrames={to - clip.from} layout="none">
            <Soundtrack track={TRACKS.catWalk} startAt={clip.startAt} volume={1} fadeIn={i === 0 ? 0.2 : 2 / 60} fadeOut={last ? 1.5 : 2 / 60} />
          </Sequence>
        );
      })}
    </>
  );
}

export function VideoNotesPromoFilm() {
  return (
    <FeatureFrame
      film={{
        intro: PROMO_INTRO,
        introAt: PROMO_INTRO_AT,
        windowFrom: PROMO_WINDOW_FROM,
        ending: PROMO_ENDING,
        chapters: PROMO_CHAPTERS,
        scenes: SCENES,
        sfx: "sfx/video-notes-promo.mp3",
        tags: PROMO_TAGS,
      }}
      timeline={TIMELINE}
      music={<PromoMusic />}
    />
  );
}

export const VIDEO_NOTES_PROMO_DURATION = TIMELINE.end;
