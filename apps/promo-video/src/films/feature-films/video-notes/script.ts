/**
 * 功能片「视频笔记」的脚本与文案。纯 TS：回放时间轴、音效导出都读它，不要引用 React 或 remotion。
 * 叙事：先给成品（边看边记的样子）→ 视频从哪来（一遍带过）→ 没有字幕就本机转录 → 摘录 / 时间戳 / 截帧 → 点回那一刻 → 问 AI（总结、提问、划一句问）→ 整门课写成一本书。
 * 每一步做完都用 spot 圈出结果停一停：观众先看清点了哪、再看清变成了什么，字幕说的是这对他有什么用。
 * 文案取自官网文档 video-notes.md / plugins.md；界面上的字以 apps/desktop 的源码为准（见交接-功能片.md §3）。
 */
import { CHAT, CHAT_GLYPHS, EBOOK, EBOOK_GLYPHS, LECTURE, NOTE, QUOTE_TEXT, SLIDE_GLYPHS } from "../../../mock/videonote.ts";
import { mark } from "../shared/run.ts";
import { install, pasteAndResolve, pickSource } from "../shared/steps.ts";
import type { Card, Chapter } from "../shared/timeline.ts";
import { ASK, cameraPath, DIALOG, EBOOK as EBOOK_VIEW, FINDER, FULL, HOOK, NOTE_LEFT, NOTE_RIGHT, PLUGINS, PROJECT, SEEK, SHOT, SHOT_NOTE } from "../shared/views.ts";

/** 片头宣言：叠在已经在用的视频笔记上（样式 a） */
export const INTRO: Card = { text: "看网课，边看边记。", sub: "Tau · 视频笔记", accent: [4, 8] };
export const ENDING = { line: "免费下载，不用注册", url: "taunote.app" };

/** 章节卡：每一段停下来点一句题，观众知道接下来看什么 */
export const CARDS: Record<string, Card> = {
  add: { text: "网上的课，粘个链接就能记。", sub: "插件中心 · Bilibili / YouTube", accent: [8, 11] },
  transcribe: { text: "讲的每一句，都变成字幕。", sub: "有字幕直接用 · 没有就在本机转录", accent: [9, 11] },
  note: { text: "看到哪，记到哪。", sub: "划句摘录 · 时间戳 · 截帧", accent: [5, 7] },
  seek: { text: "每一行笔记，都记得出处。", accent: [9, 11] },
  ask: { text: "关于这节课，尽管问。", sub: "总结 · 提问 · 划一句问", accent: [6, 9] },
  ebook: { text: "不是总结，是一本书。", sub: "整门课，写成可以慢慢读的长文", accent: [7, 9] },
};

export const CHAPTERS: Chapter[] = [
  /** 片头：已经记了一阵的视频笔记，从播放器特写拉开到整窗。没有字幕，宣言替它说 */
  {
    id: "teaser",
    shots: timing => cameraPath(HOOK, [[timing.replay.start + 200, FULL]], 90),
    steps: [{ wait: 330 }],
  },
  /** 视频从哪来：插件中心装 Bilibili → 项目里「+」添加视频 → 粘链接、解析、确认 → 自动打开并缓存 */
  {
    id: "add",
    card: CARDS.add,
    shots: timing => {
      const at = (name: string) => mark(timing.replay, name);
      return cameraPath(FULL, [
        [at("toPlugins") + 10, PLUGINS],
        // 侧栏在插件特写的画外：点「项目」之前先拉回来
        [at("toProjects") - 60, PROJECT],
        [at("pick:bilibili") + 6, DIALOG],
        [at("confirm") + 14, NOTE_LEFT],
      ]);
    },
    steps: [
      { cue: "先在插件中心装上 Bilibili 插件" },
      { click: "nav:plugins", as: "toPlugins" },
      { wait: 20 },
      { click: "search", as: "focus:search" },
      { type: "Bilibili", input: "search" },
      { wait: 20 },
      ...install("bilibili"),
      { spot: "card:bilibili", hold: 60 },
      { cue: "回到项目，点「+」→ 添加视频 → Bilibili" },
      { click: "nav:projects", as: "toProjects" },
      { wait: 30 },
      ...pickSource("bilibili", "video:2"),
      { cue: "粘贴视频链接，解析后选清晰度" },
      ...pasteAndResolve("url:bilibili", LECTURE.link.bilibili, "resolved:bilibili", 60),
      { spot: "resolved", hold: 70 },
      { click: "confirm", as: "confirm" },
      { cue: "视频先缓存到本机，离线也能看" },
      { wait: 70 },
      { mark: "cached", hold: 60 },
    ],
  },
  /** 转录：这个视频没带字幕 → 点「开始转录」→ 准备、提取音频、识别（本机）→ 字幕逐句出现 → AI 分好章节，进度条分段 */
  {
    id: "transcribe",
    card: CARDS.transcribe,
    view: NOTE_LEFT,
    steps: [
      { cue: "这个视频没带字幕？点「开始转录」" },
      { click: "transcribe", as: "transcribe" },
      { cue: "转录在本机完成，视频不用上传" },
      { mark: "prepare", hold: 30 },
      { mark: "extract", hold: 50 },
      { mark: "recognize" },
      { spot: "transcribe-progress", hold: 190 },
      { mark: "done" },
      { sfx: "pop" },
      { cue: "讲的每一句都成了字幕，跟着播放滚动" },
      { spot: "transcript-viewport", hold: 110 },
      { cue: "AI 顺手分好章节，进度条也跟着分了段" },
      { mark: "chaptering", hold: 80 },
      { mark: "chaptered" },
      { spot: "controls", hold: 100 },
      { cue: "有了字幕，才能划句摘录、让 AI 读懂这节课", read: 90 },
    ],
  },
  /** 记：划一句摘进笔记 → 写一行字、⌘⇧T 时间戳 → 快进到示意图、⌘⇧S 截一帧。镜头跟着在左右栏之间平移 */
  {
    id: "note",
    card: CARDS.note,
    shots: timing => {
      const at = (name: string) => mark(timing.replay, name);
      // 划选在左边（字幕）→ 摘录、打字、时间戳在右边（笔记）→ 讲到示意图拉开，播放器和笔记同框，看这一帧飞进笔记 → 推近这张图 → 拉开看进度条上的刻度
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
      { cue: "听到要记的，划一下字幕" },
      { drag: String(LECTURE.quote), as: "select" },
      { wait: 20 },
      { click: "toolbar:quote", as: "toNote" },
      { sfx: "pop" },
      { wait: 30 },
      { cue: "这句话带着时间进了笔记" },
      { spot: "note-block:0", hold: 90 },
      { cue: "自己写一句，按 ⌘⇧T 记下此刻的时间" },
      { click: "note-body", as: "focusNote" },
      { type: NOTE.typed, input: "note" },
      { wait: 16 },
      { keys: "⌘⇧T", as: "stamp", sound: "form" },
      { sfx: "pop" },
      { spot: "note-block:1", hold: 80 },
      { cue: "讲到示意图，⌘⇧S 把这一帧截进笔记" },
      { mark: "fast", hold: 150 },
      { keys: "⌘⇧S", as: "shot", sound: "shutter" },
      // 截下的一帧从播放器飞进笔记（见 VideoNotesFilm 的 SHOT_FLIGHT）
      { wait: 36 },
      { mark: "landed" },
      { sfx: "pop" },
      { cue: "画面带着时间，落在笔记里" },
      { wait: 30 },
      { spot: "note-shot:2", hold: 100 },
      { cue: "记过的地方，都标在进度条下面" },
      { mark: "toMarkers", hold: 50 },
      { spot: "controls", hold: 100 },
    ],
  },
  /** 点回那一刻：点笔记里的时间戳，播放头跳回、字幕滚回去；鼠标停到进度条的刻度上，浮出当时记下的话 */
  {
    id: "seek",
    card: CARDS.seek,
    view: SEEK,
    steps: [
      { cue: "点笔记里的时间，视频跳回那一刻" },
      { click: "note-time:1", as: "seek" },
      { wait: 30 },
      { spot: "player", hold: 90 },
      { cue: "停在进度条的标记上，看得到当时记了什么" },
      { hover: "marker:1", as: "hover", hold: 120 },
    ],
  },
  /** 问 AI：暂停 → 打开对话 → 点建议提问总结整节课 → 自己问一句（先搜字幕、再读那一段）→ 划一句「问 AI」→「举个例子」→ 发送 */
  {
    id: "ask",
    card: CARDS.ask,
    shots: timing => {
      const at = (name: string) => mark(timing.replay, name);
      return cameraPath(SEEK, [[at("open") + 4, ASK]], 60);
    },
    steps: [
      { cue: "停下来，打开对话问问这个视频" },
      { click: "play", as: "pause" },
      { click: "chat", as: "open" },
      { wait: 50 },
      { cue: "一键总结整节课，要点都带着时间" },
      { click: "chat-prompt:0", as: "send:0" },
      { mark: "tool:0:0", hold: 40 },
      { mark: "answer:0", hold: 200 },
      { spot: "chat-answer:0", hold: 90 },
      { cue: "自己问一句：它先在字幕里找到出处，再照着讲的回答" },
      { click: "chat-input", as: "focus:chat" },
      { type: CHAT.search.prompt, input: "chat" },
      { wait: 16 },
      { click: "send", as: "send:1" },
      { mark: "tool:1:0" },
      { spot: "chat-tools:1", hold: 90 },
      { mark: "answer:1", hold: 170 },
      { spot: "chat-answer:1", hold: 80 },
      { cue: "听不懂的那句，划一下点「问 AI」" },
      { drag: String(LECTURE.ask), as: "select" },
      { wait: 20 },
      { click: "toolbar:ask", as: "ask" },
      { wait: 40 },
      { cue: "原句带进对话，选个问法再发" },
      { click: "ask:2", as: "fill" },
      { wait: 20 },
      { click: "send", as: "send:2" },
      { mark: "tool:2:0", hold: 40 },
      { mark: "answer:2", hold: 200 },
      { cue: "回答就落在这一句上" },
      { spot: "chat-answer:2", hold: 100 },
    ],
  },
  /** 整门课写成一本书：⋯ → AI 导出电子书 → 生成草稿（长文逐段流出）→ 下一步 → 改书名 → 导出 EPUB → 访达里选中这本书 */
  {
    id: "ebook",
    card: CARDS.ebook,
    shots: timing => {
      const at = (name: string) => mark(timing.replay, name);
      return cameraPath(
        FULL,
        [
          [at("open:ebook") + 10, EBOOK_VIEW],
          [at("export") + 10, FINDER],
        ],
        60
      );
    },
    steps: [
      { cue: "看完一门课，点 ⋯ →「AI 导出电子书」" },
      { click: "more", as: "menu" },
      { hover: "menu:ebook", hold: 20 },
      { click: "menu:ebook", as: "open:ebook" },
      { wait: 50 },
      { cue: "选一种写法，AI 把字幕改写成长文，不丢细节" },
      { click: "ebook:generate", as: "generate" },
      { mark: "streaming", hold: 380 },
      { mark: "drafted", hold: 40 },
      { click: "ebook:next", as: "next" },
      { cue: "起个书名，导出 EPUB 或 PDF" },
      { wait: 30 },
      { click: "ebook:title", as: "focus:title" },
      { keys: "⌘A", as: "clear", clear: "title" },
      { type: EBOOK.book, input: "title" },
      { wait: 30 },
      { click: "ebook:export", as: "export" },
      { wait: 50 },
      { mark: "finder" },
      { cue: "没耐心看完的课，留着慢慢读", read: 60 },
      { spot: "finder:first", hold: 110 },
    ],
  },
];

/** 转录进度条上依次出现的文案（useVideoNoteTranscription / asr-process 的原话） */
export const TRANSCRIBE_STEPS = ["正在准备视频...", "正在提取音频...", "正在转录 ...", "转录完成"];

/** 片里出现的展示字体 / 字幕字体的字：要进 Root.tsx 的字体预载，否则掉字 */
export const VIDEO_NOTES_GLYPHS =
  Object.values(CARDS)
    .map(card => card.text + (card.sub ?? ""))
    .join("") +
  INTRO.text +
  INTRO.sub +
  ENDING.line +
  ENDING.url +
  CHAPTERS.flatMap(chapter => chapter.steps)
    .flatMap(step => ("cue" in step ? [step.cue] : []))
    .join("") +
  NOTE.typed +
  NOTE.prompt +
  NOTE.asks.join("") +
  CHAT_GLYPHS +
  TRANSCRIBE_STEPS.join("") +
  QUOTE_TEXT +
  SLIDE_GLYPHS +
  EBOOK_GLYPHS;
