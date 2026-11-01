/**
 * 教程片时间轴（帧，60fps）：片头 → 各章（章节卡 + 按键重放）首尾相接 → 速查表 → 片尾，时长全由内容决定。
 * 章节卡期间窗口虚化，卡片到最浓时换成下一章的空文章。
 */
import { runChapter, type ChapterRun } from "./run.ts";
import { CHAPTERS, type Chapter } from "./script.ts";

export const FPS = 60;
/** 片头：整屏标题停住，再淡出露出空白文章窗口 */
export const INTRO = { title: 0, fade: 170, windowIn: 150, end: 200 };
/** 章节卡：入场 → 停住 → 退场；swap 是换文章的时刻（虚化最浓处） */
const CARD = { length: 130, swap: 24 };
/** 每章结尾留一点时间看完成品 */
const TAIL = 20;
/** 最后一章之后：速查表停住（可截图），再接片尾字标 */
const CHEAT = 560;
const ENDING = 400;

export type Span = { at: number; out: number };
export type ChapterTiming = { chapter: Chapter; card?: { at: number; out: number }; swap: number; run: ChapterRun };

function layout() {
  const out: ChapterTiming[] = [];
  let t = INTRO.end;
  for (const chapter of CHAPTERS) {
    if (chapter.card) {
      const card = { at: t, out: t + CARD.length };
      const run = runChapter(chapter.steps, card.out - 10);
      out.push({ chapter, card, swap: t + CARD.swap, run });
    } else {
      out.push({ chapter, swap: t, run: runChapter(chapter.steps, t) });
    }
    t = out[out.length - 1].run.end + TAIL;
  }
  const cheat: Span = { at: t, out: t + CHEAT };
  const ending: Span = { at: cheat.out - 30, out: cheat.out - 30 + ENDING };
  return { chapters: out, cheat, ending, end: ending.out };
}

export const TIMELINE = layout();
export const TUTORIAL_DURATION = TIMELINE.end;

/** frame 时刻窗口里显示的那一章（章节卡换文章之前仍是上一章的成品） */
export function chapterAt(frame: number) {
  return TIMELINE.chapters.findLast(c => c.swap <= frame) ?? TIMELINE.chapters[0];
}

/** 打字演示中（字幕在讲、键盘声在响）为 1，章节卡 / 片头片尾为 0：配乐在打字时退后 */
export function typingWeight(frame: number) {
  return Math.max(0, ...TIMELINE.chapters.map(({ run }) => Math.min(Math.max(0, (frame - run.start) / 40), 1, Math.max(0, (run.end - frame) / 40))));
}
