/**
 * 视频笔记宣传版的脚本：时间轴按配乐 Cat Walk 的小节排，章节切换卡小节线，关键动作（按下、落进笔记、字幕长出来）卡拍。
 * 没有操作字幕：每段只用底部模块标签交代在演什么，两处停拍用宣言点题。分镜与小节表见 docs/视频笔记宣传版-分镜.md。
 * 纯 TS：回放时间轴、音效导出都读它，不要引用 React 或 remotion。
 */
import { CHAT, EBOOK, LECTURE, NOTE } from "../../../mock/videonote.ts";
import { mark } from "../shared/run.ts";
import { pasteAndResolve } from "../shared/steps.ts";
import type { Card, Chapter, EndingAt } from "../shared/timeline.ts";
import { ASK, cameraPath, DIALOG, EBOOK as EBOOK_VIEW, FINDER, FULL, NOTE_LEFT, NOTE_RIGHT, PROJECT, SEEK, SHOT, SHOT_NOTE } from "../shared/views.ts";
import { bar, beat, onBeat } from "./beats.ts";

/** 片头宣言：影片从前奏第 5 小节开始，宣言先在空舞台上出现；第 7 小节轻鼓进来时退场，项目窗口同时浮上来 */
export const PROMO_INTRO: Card = { text: "看网课，边看边记。", sub: "Tau · 视频笔记", accent: [4, 8] };
export const PROMO_INTRO_AT = { at: 6, out: bar(7) + 10 };
export const PROMO_WINDOW_FROM = bar(7) - 30;
export const PROMO_ENDING = { line: "免费下载，不用注册", url: "taunote.app" };
/** 片尾：第 55 小节停一拍时画面收起，字标落在第 56 小节第一拍（Ending 铺底 30 帧后字标才出来），配乐第 59 小节末开始自然衰减，片子停在第 60 小节 */
export const PROMO_ENDING_AT: EndingAt = { at: bar(56) - 30, length: bar(60) - bar(56) + 30 };

/** 两处停拍上的宣言：第 23 小节（转录 → 记笔记）、第 45–46 小节（回落末尾 → 电子书） */
const CARDS: Record<string, Card> = {
  note: { text: "看到哪，记到哪。", sub: "划句摘录 · 时间戳 · 截帧", accent: [5, 7] },
  ebook: { text: "不是总结，是一本书。", sub: "整门课，写成可以慢慢读的长文", accent: [7, 9] },
};

/** 宣言入场早于停拍 8 帧（虚化先起），在第 to 小节第一拍散开；回放从散开前 10 帧开始，第一个动作要留出光标走过去的时间 */
const cardSpan = (from: number, to: number) => ({ at: bar(from) - 8, cardLength: bar(to) - (bar(from) - 8) });

/** 底部模块标签：每段一个，进场晚于段首半小节，退场早于段尾半小节 */
export const PROMO_TAGS = [
  { module: "添加视频", feature: "粘贴 Bilibili / YouTube 链接", from: 8, to: 14.5 },
  { module: "本机转录", feature: "视频不上传，字幕和章节自动生成", from: 15.25, to: 22.75 },
  { module: "边看边记", feature: "摘录、时间戳、截帧都带着出处", from: 24.5, to: 30.5 },
  { module: "点回原处", feature: "点笔记里的时间，视频跳回那一刻", from: 31.25, to: 33.25 },
  { module: "问 AI", feature: "总结、划一句问、直接问，回答照着这节课讲", from: 34, to: 44.5 },
  { module: "AI 导出电子书", feature: "整门课写成一本书，导出 EPUB", from: 47.5, to: 54.5 },
].map(tag => ({ module: tag.module, feature: tag.feature, at: bar(tag.from), out: bar(tag.to) }));

export const PROMO_CHAPTERS: Chapter[] = [
  /** 轻鼓（第 7–14 小节）：宣言退场时项目页浮上来：「+」→ 添加视频 → Bilibili → 粘链接解析 → 确认 → 缓存好开播。每一步按下都落在小节的第一拍 */
  {
    id: "add",
    shots: timing => {
      const at = (name: string) => mark(timing.replay, name);
      return cameraPath(PROJECT, [
        [at("pick:bilibili") + 6, DIALOG],
        [at("confirm") + 14, NOTE_LEFT],
      ]);
    },
    steps: [
      ...onBeat(bar(8), { click: "add", as: "open:bilibili" }),
      { hover: "add:2", as: "hover:bilibili", hold: 30 },
      ...onBeat(bar(9), { click: "video:2", as: "pick:bilibili" }),
      { at: bar(9) + 50 },
      ...pasteAndResolve("url:bilibili", LECTURE.link.bilibili, "resolved:bilibili", 40),
      ...onBeat(bar(12), { click: "confirm", as: "confirm" }),
      { at: bar(14) - 18 },
      { mark: "cached" },
      { at: bar(15) - 40 },
    ],
  },
  /** 爆发（第 15–16、21–22 小节，中间四小节在配乐里剪掉）：爆发第一拍点「开始转录」→ 进度 → 第 16 小节字幕一拍长出一句 → 第 22 小节章节段头长出来 */
  {
    id: "transcribe",
    at: bar(15) - 40,
    view: NOTE_LEFT,
    steps: [
      ...onBeat(bar(15), { click: "transcribe", as: "transcribe" }),
      { mark: "prepare", hold: 20 },
      { mark: "extract", hold: 24 },
      { mark: "recognize" },
      { at: bar(16) },
      { mark: "done" },
      { sfx: "pop" },
      { at: bar(21.5) },
      { mark: "chaptering" },
      { at: bar(22) },
      { mark: "chaptered" },
      { sfx: "pop" },
      { at: bar(23) - 8 },
    ],
  },
  /** 停一拍（第 23 小节）宣言 → 高潮后半（第 24–30 小节）：划句摘录、⌘⇧T、⌘⇧S 截帧，落进笔记各卡一个重拍 */
  {
    id: "note",
    ...cardSpan(23, 24),
    card: CARDS.note,
    shots: timing => {
      const at = (name: string) => mark(timing.replay, name);
      return cameraPath(
        NOTE_LEFT,
        [
          [at("toNote") - 10, NOTE_RIGHT],
          [at("fast") + 10, SHOT],
          [at("landed") + 10, SHOT_NOTE],
          [at("toMarkers"), SHOT],
        ],
        60
      );
    },
    steps: [
      ...onBeat(beat(24 * 4 + 2), { drag: String(LECTURE.quote), as: "select" }),
      ...onBeat(beat(25 * 4 + 2), { click: "toolbar:quote", as: "toNote" }),
      { sfx: "pop" },
      ...onBeat(bar(26), { click: "note-body", as: "focusNote" }),
      { type: NOTE.typed, input: "note" },
      ...onBeat(beat(27 * 4 + 1), { keys: "⌘⇧T", as: "stamp", sound: false }),
      { sfx: "pop" },
      // 时间戳一落就快进到示意图那页，第 29 小节第一拍截帧，第三拍落进笔记
      { at: bar(28) },
      { mark: "fast" },
      ...onBeat(bar(29), { keys: "⌘⇧S", as: "shot", sound: false }),
      { at: bar(29.5) },
      { mark: "landed" },
      { sfx: "pop" },
      { at: bar(30.5) },
      { mark: "toMarkers" },
      { at: bar(31) },
    ],
  },
  /** 回落（第 31–33 小节）：点笔记里的时间，播放头跳回；停到刻度上浮出当时写的话 */
  {
    id: "seek",
    at: bar(31),
    view: SEEK,
    steps: [...onBeat(bar(32), { click: "note-time:1", as: "seek" }), ...onBeat(bar(32.75), { hover: "marker:1", as: "hover", hold: 20 }), { at: bar(33.5) }],
  },
  /**
   * 回落（第 33–44 小节）：暂停 → 打开对话，点建议提问总结整节课 → 划一句点「问 AI」，原句带进对话，选「举个例子」发送 →
   * 自己打一问，先在字幕里检索、再读那一段，照着讲的回答
   */
  {
    id: "ask",
    at: bar(33.5),
    shots: timing => {
      const at = (name: string) => mark(timing.replay, name);
      return cameraPath(SEEK, [[at("open"), ASK]], 48);
    },
    steps: [
      ...onBeat(bar(34), { click: "play", as: "pause" }),
      ...onBeat(bar(34.5), { click: "chat", as: "open" }),
      ...onBeat(bar(35.5), { click: "chat-prompt:0", as: "send:0" }),
      { at: bar(35.5) + 20 },
      { mark: "tool:0:0" },
      { at: bar(36) },
      { mark: "answer:0" },
      ...onBeat(bar(38), { drag: String(LECTURE.ask), as: "select" }),
      ...onBeat(bar(39), { click: "toolbar:ask", as: "ask" }),
      ...onBeat(beat(39 * 4 + 2), { click: "ask:2", as: "fill" }),
      ...onBeat(bar(40), { click: "send", as: "send:1" }),
      { at: bar(40) + 20 },
      { mark: "tool:1:0" },
      { at: bar(40.5) },
      { mark: "answer:1" },
      ...onBeat(bar(41), { click: "chat-input", as: "focus:chat" }),
      { type: CHAT.search.prompt, input: "chat" },
      ...onBeat(bar(42.5), { click: "send", as: "send:2" }),
      { at: bar(42.5) + 16 },
      { mark: "tool:2:0" },
      { at: bar(43.5) },
      { mark: "answer:2" },
      { at: bar(45) - 8 },
    ],
  },
  /** 回落末尾（第 45–46 小节）宣言 → 再爆发（第 47–54 小节）：⋯ → AI 导出电子书 → 长文跟着拍流出 → 书名 → 导出 EPUB → 访达 */
  {
    id: "ebook",
    ...cardSpan(45, 47),
    card: CARDS.ebook,
    shots: timing => {
      const at = (name: string) => mark(timing.replay, name);
      return cameraPath(
        FULL,
        [
          [at("open:ebook") + 10, EBOOK_VIEW],
          [at("export") + 10, FINDER],
        ],
        48
      );
    },
    steps: [
      ...onBeat(beat(47 * 4 + 1.5), { click: "more", as: "menu" }),
      ...onBeat(bar(48), { click: "menu:ebook", as: "open:ebook" }),
      ...onBeat(bar(48.5), { click: "ebook:generate", as: "generate" }),
      { mark: "streaming" },
      { at: bar(51) },
      { mark: "drafted" },
      ...onBeat(beat(51 * 4 + 2), { click: "ebook:next", as: "next" }),
      ...onBeat(bar(52), { click: "ebook:title", as: "focus:title" }),
      { keys: "⌘A", as: "clear", clear: "title" },
      { type: EBOOK.book, input: "title" },
      ...onBeat(beat(53 * 4 + 2), { click: "ebook:export", as: "export" }),
      { at: bar(54) - 10 },
      { mark: "finder" },
      { at: bar(55) },
    ],
  },
];

export const PROMO_GLYPHS = Object.values(CARDS)
  .map(card => card.text + (card.sub ?? ""))
  .concat(PROMO_TAGS.map(tag => tag.module + tag.feature))
  .join("");
