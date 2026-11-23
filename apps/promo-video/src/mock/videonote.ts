/**
 * 功能片（视频笔记、Bilibili、YouTube）的演示数据。
 * 界面文案取自官网文档 video-notes.md / plugins.md 和两个插件的 README；插件卡片的名称、简介、版本取自 manifest.json。
 * 课的名字和摘录的那一句取自 video-notes.md 的例子，其余字幕是按这节课公开讲的「专注模式 / 发散模式」写的示意文字；
 * 播放器画面是代码画的幻灯片（app-kit/parts/LectureSlide），不用任何真实视频画面。
 */
import type { CatalogPlugin } from "../app-kit/pages/PluginsPage";
import type { NoteBlock, VideoNoteState } from "../app-kit/pages/VideoNotePage";
import type { TreeItem } from "../app-kit/pages/ProjectTreePage";
import { PLUGINS } from "./deepwork.ts";

/** 功能片用的宽窗口：对话要停靠成第三栏，1440 宽放不下 */
export const FEATURE_WINDOW = { width: 1760, height: 990 } as const;

export const VIDEO_PLUGINS = {
  bilibili: {
    id: "bilibili",
    name: "Bilibili",
    version: "0.2.7",
    desc: "粘贴 Bilibili 视频链接即可添加到笔记、白板和视频笔记，支持扫码登录选择更高清晰度。",
    keywords: ["Bilibili", "B站", "视频"],
    categories: ["视频"],
    total: 5216,
    week: 486,
  },
  youtube: {
    id: "youtube",
    name: "YouTube",
    version: "0.2.8",
    desc: "粘贴 YouTube 视频链接即可添加到笔记、白板和视频笔记，可选清晰度并支持代理。",
    keywords: ["YouTube", "视频"],
    categories: ["视频"],
    total: 4873,
    week: 402,
  },
} satisfies Record<string, CatalogPlugin>;

/** 插件中心「发现」页的目录，按「最近热门」（近 7 日）排好 */
export const CATALOG: CatalogPlugin[] = [...PLUGINS.list, VIDEO_PLUGINS.bilibili, VIDEO_PLUGINS.youtube].sort((a, b) => b.week - a.week);

/** 安装确认框的正文（features/plugins/components/PluginParts.tsx 的 INSTALL_NOTICE） */
export const INSTALL_NOTICE =
  "插件在完整应用环境中运行，可以读取和修改你的笔记数据。插件中心审核功能与来源，但不保证没有缺陷，请只安装你信任的插件。安装后即启用，可随时在「已安装」中停用。普通插件立即生效，编辑器和白板内容插件需重启应用后生效。";

const at = (minutes: number, seconds: number) => (minutes * 60 + seconds) * 1000;

/** 摘进笔记的那几个字（官网文档里的原句），是下面第 5 句的后半句 */
export const QUOTE_TEXT = "卡住的时候，先离开一会儿。";

/** 字幕里一句的时间与文字；start / end 为毫秒。quote 是会被摘录的那几个字（缺省整句） */
export type Segment = { start: number; end: number; text: string; quote?: string };

/** 片里的课：《Learning How to Learn》· 专注模式与发散模式（官网文档 video-notes.md 的例子），从 Bilibili 添加 */
export const LECTURE = {
  project: "学会学习",
  title: "Learning How to Learn | 专注模式与发散模式",
  /** 时长（秒）：五分多钟，片中的片段（02:21–03:50）落在进度条中段，刻度隔几秒也分得开、又都在特写机位里 */
  duration: 5 * 60 + 24,
  /** 视频页链接（地址栏里复制出来的 BV 号链接；插件也认 b23.tv 短链）。BV 号是示意，不对应真实视频 */
  link: { bilibili: "https://www.bilibili.com/video/BV1xK4y1C7Tq" },
  /** 全片字幕的段数与章数（标题行下面那行「转录 · N 段 · N 章」） */
  count: { segments: 96, chapters: 3 },
  chapters: [
    { start: at(0, 12), title: "专注模式：把注意力收紧" },
    { start: at(1, 58), title: "发散模式：让想法自由连结" },
    { start: at(3, 12), title: "示意图：两种模式怎么切换" },
  ],
  /** 片中看到的那一段字幕 */
  segments: [
    { start: at(2, 21), end: at(2, 28), text: "上一节我们说了，专注模式是把注意力收紧，一步一步往下推。" },
    { start: at(2, 29), end: at(2, 35), text: "但有些问题，越专注越解不开。" },
    { start: at(2, 36), end: at(2, 42), text: "这时候需要另一种状态：发散模式。" },
    { start: at(2, 43), end: at(2, 49), text: "它不盯着细节，让想法在脑子里自由地连来连去。" },
    { start: at(2, 50), end: at(2, 55), text: `所以${QUOTE_TEXT}`, quote: QUOTE_TEXT },
    { start: at(2, 56), end: at(3, 3), text: "去散个步，睡一觉，答案常常自己冒出来。" },
    { start: at(3, 5), end: at(3, 12), text: "两种模式轮流用：先专注把问题吃透，再放开让它发酵。" },
    { start: at(3, 14), end: at(3, 19), text: "下面看一张示意图。" },
    { start: at(3, 21), end: at(3, 31), text: "左边是专注模式，思路像一条窄路；右边是发散模式，到处都是岔口。" },
    { start: at(3, 33), end: at(3, 41), text: "学新东西时，先发散着看个大概，再专注进去抠细节。" },
    { start: at(3, 43), end: at(3, 50), text: "记住：卡住不是你不行，只是该换一种模式了。" },
  ] satisfies Segment[],
  /** 摘进笔记的那一句（官网文档里的原句）在 segments 里的下标 */
  quote: 4,
  /** 拿去问 AI 的那一句 */
  ask: 3,
};

/** 文档树里原有的本地视频（「专注模式 / 发散模式」的课堂录像），演示「开始转录」用 */
export const LOCAL_VIDEO = { id: "local", title: "专注与发散 · 课堂录像.mp4" };

/** 播放器里代码画的幻灯片（三页，随播放切换）：until 之前（秒）显示这一张 */
export const SLIDES = [
  { until: 2 * 60 + 36, kind: "focused" },
  { until: 3 * 60 + 14, kind: "modes" },
  { until: Infinity, kind: "diagram" },
] as const;

export type SlideKind = (typeof SLIDES)[number]["kind"];

/** 幻灯片上的字；幻灯片用字幕字体，这些字要进字体预载 */
export const SLIDE_TEXT = {
  focused: { title: "专注模式", sub: "注意力收紧，沿着熟悉的路一步步往下推", foot: "学会学习 · 第 2 讲", page: "11 / 24" },
  modes: { title: "两种思考方式", focused: "专注", focusedSub: "收紧 · 一步一步", diffuse: "发散", diffuseSub: "放开 · 自由连结", foot: "学会学习 · 第 2 讲", page: "12 / 24" },
  diagram: { title: "两种模式怎么切换", focused: "专注", focusedSub: "先把问题吃透", diffuse: "发散", diffuseSub: "再放开让它发酵", foot: "卡住了？先离开，再回来", page: "13 / 24" },
} as const;
export const SLIDE_GLYPHS = Object.values(SLIDE_TEXT)
  .flatMap(slide => Object.values(slide))
  .join("");

export const slideAt = (time: number): SlideKind => SLIDES.find(slide => time < slide.until)!.kind;
/** 这一页从第几秒开始（幻灯片里的元素按这一页播了多久逐个出现） */
export const slideStart = (time: number) => {
  const index = SLIDES.findIndex(slide => time < slide.until);
  return index > 0 ? SLIDES[index - 1].until : 2 * 60;
};

/** 笔记里的内容 */
export const NOTE = {
  /** 记笔记时手打的那一行（讲到「两种思考方式」那一页） */
  typed: "两种模式要轮流用",
  /** 对话里带的快捷提问（VideoNoteChatPanel 的 QUICK_ASKS） */
  asks: ["解释", "展开讲讲", "举个例子"],
  /** 点「举个例子」后填进输入框的原话 */
  prompt: "举个例子说明这句话",
  /** AI 的回答，按段流出；时间是回答里的普通文字（视频笔记的对话里没有可点的时间芯片） */
  answer: [
    "这句话说的是**发散模式**的特点：不盯着细节，让大脑在后台自由地连结。",
    "举个例子：你盯着一道题半小时没有进展，起身去洗碗。洗着洗着，解法自己冒出来了——洗碗时你并没有在想这道题，是大脑把之前装进去的东西重新连了一遍。",
    "所以视频在 02:50 建议：卡住的时候先离开一会儿，散个步或者睡一觉，再回来专注。",
  ],
};

/** 对话里的一问一答：tools 是回答前调用的工具（名称取自 tools/videoNoteSearchTool.ts，耗时按 formatToolDuration 的写法） */
export type ChatExchange = { prompt: string; quote?: { time: number; text: string }; tools: { name: string; note: string }[]; answer: string[] };

/** 对话栏演示的三问：点建议提问总结整节课 → 自己问一句（先搜字幕再读那一段）→ 从字幕划一句带进来问 */
export const CHAT = {
  /** 新对话的建议提问（VideoNoteChatPanel 的 SUGGESTED_PROMPTS），点了直接发送 */
  prompts: ["总结这个视频的核心观点", "按章节列出要点和时间点", "出 5 道自测题"],
  summary: {
    prompt: "总结这个视频的核心观点",
    tools: [{ name: "get_video_note_transcript_range", note: "640 毫秒" }],
    answer: [
      "这一节讲大脑的两种工作方式，以及什么时候该换一种：",
      "**专注模式**（00:12）：把注意力收紧，沿着熟悉的路一步步往下推，适合抠细节。",
      "**发散模式**（01:58）：不盯着细节，让想法自由连结，答案常在你没在想的时候冒出来。",
      "**怎么切换**（03:12）：卡住了就先离开一会儿；学新东西先发散看个大概，再专注进去。",
    ],
  },
  search: {
    prompt: "学新东西时，该先用哪种模式？",
    tools: [
      { name: "search_video_note_knowledge", note: "1.2 秒" },
      { name: "get_video_note_transcript_range", note: "380 毫秒" },
    ],
    answer: ["**先发散，再专注。**", "视频 03:33 讲到：学新东西时，先发散着看个大概，再专注进去抠细节。", "03:05 也提过：两种模式要轮流用。卡住了不是你不行，只是该换一种模式了。"],
  },
  quote: {
    prompt: NOTE.prompt,
    quote: { time: LECTURE.segments[LECTURE.ask].start / 1000, text: LECTURE.segments[LECTURE.ask].text },
    tools: [{ name: "search_video_note_knowledge", note: "1.1 秒" }],
    answer: NOTE.answer,
  },
} satisfies { prompts: string[]; summary: ChatExchange; search: ChatExchange; quote: ChatExchange };
export const CHAT_GLYPHS = [CHAT.summary, CHAT.search, CHAT.quote].map(item => item.prompt + item.answer.join("")).join("") + CHAT.prompts.join("");

/** 「学会学习」项目的文档树：添加视频之前，和添加之后（新视频排在最前） */
export const TREE_BEFORE: TreeItem[] = [
  { id: "local", title: "专注与发散 · 课堂录像.mp4", kind: "video" },
  { id: "n1", title: "课程笔记", kind: "doc" },
  { id: "n2", title: "学习计划", kind: "doc" },
  { id: "n3", title: "费曼技巧", kind: "doc" },
];
export const TREE: TreeItem[] = [{ id: "v2", title: LECTURE.title, kind: "video" }, ...TREE_BEFORE];

/**
 * AI 导出电子书：默认风格「杂志长文」改写出的草稿（示意；口径同 video-ebook-rewrite 的提示词：首行是新标题、按小节组织、可完整替代观看的长文）。
 * 书名在导出设置里默认是视频标题，片里改成 book。
 */
export const EBOOK = {
  book: "先离开一会儿",
  author: "Tau 用户",
  draft: [
    { kind: "h1", text: "先离开一会儿：在专注与发散之间学习" },
    { kind: "p", text: "你一定有过这样的时刻：一道题盯了半小时，思路像撞在一堵墙上。越用力，越想不出来。" },
    { kind: "h2", text: "大脑的两种工作方式" },
    { kind: "p", text: "专注模式把注意力收紧，沿着熟悉的路一步一步往下推。它擅长解决已经理解了一半的问题，却很难跳出原来的路线。" },
    { kind: "p", text: "发散模式正好相反。它不盯着细节，让想法在脑子里自由地连来连去，常常在你没在想的时候，把两个看似无关的念头接到一起。" },
    { kind: "h2", text: "卡住的时候，先离开一会儿" },
    { kind: "p", text: "所以当你卡住，最好的办法往往是起身散个步、洗个碗，或者干脆睡一觉。离开并不是放弃：发散模式会接手，把之前装进去的东西重新连一遍。" },
    { kind: "p", text: "学新东西时，两种模式要轮流用。先发散着看个大概，再专注进去抠细节；卡住了，就换一种模式。" },
  ] as { kind: "h1" | "h2" | "p"; text: string }[],
};
export const EBOOK_GLYPHS = EBOOK.book + EBOOK.author + EBOOK.draft.map(block => block.text).join("");

/** 视频已经打开、字幕已就绪时右栏的笔记：一片引用（摘录）+ 一行带时间戳的字 + 一张截帧 */
export const NOTE_BLOCKS: NoteBlock[] = [
  {
    kind: "quote",
    parts: [
      { kind: "timestamp", time: 2 * 60 + 50, appear: 1 },
      { kind: "text", text: ` ${QUOTE_TEXT}` },
    ],
    typed: 99,
    appear: 1,
  },
  {
    kind: "paragraph",
    parts: [
      { kind: "timestamp", time: 3 * 60 + 14, appear: 1 },
      { kind: "text", text: ` ${NOTE.typed}` },
    ],
    typed: 99,
  },
  { kind: "screenshot", time: 3 * 60 + 37, slide: "diagram", appear: 1 },
];

/** 视频笔记打开着的状态。缺省是核对界面用的成品：播到 current 这一句，笔记里有摘录、时间戳和截帧 */
export function demoNote(current = 8, time = LECTURE.segments[current].start / 1000, scroll = 150): VideoNoteState {
  return {
    title: LECTURE.title,
    source: VIDEO_PLUGINS.bilibili.name,
    transcript: "已转录",
    duration: LECTURE.duration,
    time,
    playing: true,
    slide: slideAt(time),
    chapters: LECTURE.chapters,
    segments: LECTURE.segments,
    count: LECTURE.count,
    current,
    scroll,
    quoted: [LECTURE.quote],
    markers: [
      { time: 2 * 60 + 50, kind: "quote", appear: 1, text: QUOTE_TEXT, note: "笔记 1" },
      { time: 3 * 60 + 14, kind: "timestamp", appear: 1, text: NOTE.typed, note: "笔记 1" },
      { time: 3 * 60 + 37, kind: "screenshot", appear: 1, note: "笔记 1" },
    ],
    notes: { kind: "blocks", blocks: NOTE_BLOCKS, tab: "笔记 1" },
  };
}
