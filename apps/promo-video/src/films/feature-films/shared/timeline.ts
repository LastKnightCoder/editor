/**
 * 功能片时间轴（帧，60fps）：片头 → 各章（章节卡 + 回放）首尾相接 → 片尾，时长全由内容决定。
 * 章节卡期间窗口虚化，卡片到最浓时换成下一章的画面。纯 TS：音效导出脚本也读它。
 */
import { runSteps, type Replay, type Step } from "./run.ts";

export const FPS = 60;
/** 片头：宣言叠在第一章的画面上（样式 a，第一章从第 0 帧起就在播），at–out 是宣言的入场与退场 */
export const INTRO = { at: 14, out: 176 };
/** 章节卡：入场 → 停住 → 退场；swap 是换画面的时刻（虚化最浓处） */
const CARD = { length: 130, swap: 24 };
/** 每章结尾留一点时间看完成品 */
const TAIL = 16;
/** 片尾：字标 + 一句话 + 网址 */
export const ENDING = 320;

export type Card = { text: string; sub?: string; accent?: [number, number] };
/** 镜头停在哪：窗口坐标里的点对准画面中心（窗口左上角为原点），zoom 为放大倍数 */
export type View = { x: number; y: number; zoom: number };
/** 镜头关键帧：at 帧时对准这个 View（at 为全片帧号）；相邻两帧之间用 inOut 缓动 */
export type CameraKey = View & { at: number };
export type Chapter = {
  id: string;
  /** 这一章（有章节卡就是卡片入场）从第几帧开始：按配乐排时间轴时用，上一章必须在这之前演完 */
  at?: number;
  card?: Card;
  /** 章节卡的长度（帧），缺省 CARD.length */
  cardLength?: number;
  steps: Step[];
  /** 镜头停在哪（见 View）；缺省整窗 */
  view?: View;
  /** 自己给镜头关键帧（覆盖 view 的缺省走法）：章内就要换机位时用，时刻从 timing 的回放里取 */
  shots?: (timing: ChapterTiming) => CameraKey[];
};
export type ChapterTiming = { chapter: Chapter; card?: { at: number; out: number }; swap: number; replay: Replay };
export type Timeline = { chapters: ChapterTiming[]; ending: { at: number; out: number }; end: number };

/** 片尾的位置：at 缺省接在最后一章后面，length 缺省 ENDING */
export type EndingAt = { at?: number; length?: number };

export function layout(chapters: Chapter[], endingAt: EndingAt = {}): Timeline {
  const out: ChapterTiming[] = [];
  let t = 0;
  for (const chapter of chapters) {
    if (chapter.at !== undefined) {
      if (chapter.at < t) throw new Error(`「${chapter.id}」排不下：要在第 ${chapter.at} 帧开始，上一章演到了第 ${t} 帧`);
      t = chapter.at;
    } else if (out.length) t += TAIL;
    if (chapter.card) {
      const card = { at: t, out: t + (chapter.cardLength ?? CARD.length) };
      out.push({ chapter, card, swap: t + CARD.swap, replay: runSteps(chapter.steps, card.out - 10) });
    } else {
      out.push({ chapter, swap: t, replay: runSteps(chapter.steps, t) });
    }
    t = out[out.length - 1].replay.end;
  }
  if (endingAt.at === undefined && out.length) t += TAIL;
  if (endingAt.at !== undefined && endingAt.at < t) throw new Error(`片尾排不下：要在第 ${endingAt.at} 帧开始，最后一章演到了第 ${t} 帧`);
  const at = endingAt.at ?? t;
  const ending = { at, out: at + (endingAt.length ?? ENDING) };
  return { chapters: out, ending, end: ending.out };
}

/** 事件表：各章回放里的音效时刻，交给 scripts/sfx/sfx.py 合成 */
export function sfxEvents(timeline: Timeline) {
  return timeline.chapters.flatMap(chapter => chapter.replay.sfx);
}

/** frame 时刻窗口里显示的那一章（章节卡换画面之前仍是上一章） */
export function chapterAt(timeline: Timeline, frame: number) {
  const index = timeline.chapters.findLastIndex(c => c.swap <= frame);
  const at = index < 0 ? 0 : index;
  return { index: at, ...timeline.chapters[at] };
}
