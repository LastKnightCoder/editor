/**
 * 功能片「视频笔记」：片头（边看边记的成品）→ 视频从哪来 → 本机转录出字幕 → 摘录 / 时间戳 / 截帧 → 点回那一刻 → 问 AI → 整门课写成一本书 → 片尾。
 * 时长由内容决定，配乐当背景。脚本与文案在同目录的 script.ts，画面在 scenes.tsx（宣传版共用）。
 */
import { FeatureFrame } from "../shared/FeatureFrame";
import { layout, type Timeline } from "../shared/timeline.ts";
import { createScenes } from "./scenes";
import { CHAPTERS, ENDING, INTRO } from "./script.ts";

const TIMELINE: Timeline = layout(CHAPTERS);
const SCENES = createScenes(TIMELINE);

export function VideoNotesFilm() {
  return <FeatureFrame film={{ intro: INTRO, ending: ENDING, chapters: CHAPTERS, scenes: SCENES, sfx: "sfx/video-notes.mp3" }} timeline={TIMELINE} />;
}

export const VIDEO_NOTES_DURATION = TIMELINE.end;
