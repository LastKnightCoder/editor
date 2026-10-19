import type { Cue } from "../../kit/srt";

/** 主宣传片文案：画面字幕与 SRT 共用这一份 */
export const SLOGAN = "你的知识，在这里长成体系。";
export const TAGLINE = "离线可用 · 数据在本地 · 开放插件";
export const URL = "taunote.app";

export const PROLOGUE = ["这是普通的一天，", "也是你的知识，悄悄生长的一天。"] as const;

export const TIME_MARKS = [
  { at: 6.6, time: "07:30", label: "清晨" },
  { at: 12.8, time: "09:30", label: "上午" },
  { at: 21.2, time: "14:00", label: "午后" },
  { at: 33.0, time: "17:30", label: "傍晚" },
  { at: 42.0, time: "19:00", label: "黄昏" },
  { at: 53.5, time: "22:00", label: "夜" },
];

export const CUES: Cue[] = [
  { from: 6.8, to: 11.4, text: "早上，打开「今日」：复习、待办、日程，一页看清" },
  { from: 13.2, to: 16.8, text: "读书时，随手划线" },
  { from: 17.2, to: 20.8, text: "划线一键转为卡片，出处自动带上" },
  { from: 22.6, to: 27.2, text: "所见即所得的 Markdown，打字即成型" },
  { from: 27.4, to: 31.6, text: "输入 [[，就能链接到两年前的旧卡片" },
  { from: 34.0, to: 37.6, text: "让 AI 帮忙：它读得懂你的整个知识库" },
  { from: 37.8, to: 41.4, text: "也能直接动手——大纲写好了，引用都链上了" },
  { from: 43.0, to: 47.4, text: "该复习的卡片，会在对的时间回来找你" },
  { from: 48.4, to: 52.6, text: "读、写、复习、专注，一天都在 Tau 里" },
  { from: 55.0, to: 60.0, text: "入夜，今天写下的，落进了你的知识星图" },
  { from: 61.0, to: 67.6, text: "还接上了两年前的一个想法" },
  { from: 70.6, to: 76.0, text: "知识地图会自动聚类，并主动告诉你哪里有关联" },
];

/** 片中所有使用展示字体 / 字幕字体的文字，供字体子集预载 */
export const GLYPHS =
  [SLOGAN, TAGLINE, URL, ...PROLOGUE, ...TIME_MARKS.map(m => m.time + m.label), ...CUES.map(c => c.text)].join("") +
  "0123456789:·，。、？！「」[]——ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz认知科学写作方法学习心理编程产品设计阅读笔记生活随笔卡片法一张卡只写个观点是思考的现场";
