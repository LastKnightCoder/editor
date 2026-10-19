/**
 * 产品片 v2 演示数据：与官网（apps/website/index.html）同一条「Deep Work / 专注」故事线，文案取官网原句。
 */
import type { BoardBlockContent, BookRow } from "../app-kit/doc/Blocks";
import type { DocBlock } from "../app-kit/doc/script";
import type { DocInput } from "./compose";

export const ARTICLE = {
  title: "Deep Work：在喧嚣里保持专注",
  links: 5,
  blocks: [
    { kind: "heading", level: 2, text: "为什么专注变难了" },
    { kind: "paragraph", parts: [{ text: "我们总以为专注是一种意志力。读完 Deep Work 才发现，它更像一种环境：你把什么放在手边，把什么放到另一个房间。" }] },
    {
      kind: "paragraph",
      parts: [
        { text: "Cal Newport 把能创造真正价值的工作称为「深度工作」——在无干扰的状态下，把认知能力推到极限。它稀缺，所以珍贵；它也可以练习，只要你" },
        { text: "先改环境，而不是先逼自己", bold: true },
        { text: "。" },
      ],
    },
    { kind: "heading", level: 2, text: "环境 > 意志力" },
    { kind: "bullets", items: ["书桌只留当下要用的东西", "手机放到另一个房间", "给自己留一张安静的纸"] },
  ] satisfies DocBlock[] as DocBlock[],
  /** 写作段在文末就地敲出的新一节 */
  typed: [
    { kind: "heading", level: 2, text: "怎么开始" },
    { kind: "paragraph", parts: [{ text: "第一步不是打开文档，而是把" }, { text: "通知", bold: true }, { text: "关掉。" }] },
    { kind: "quote", text: "意志力会耗尽，环境不会。" },
    { kind: "bullets", items: ["清空桌面", "固定的开工仪式", "只开一个窗口"] },
  ] satisfies DocBlock[] as DocBlock[],
};

/** 写作段块卡片里的内容 */
export const BLOCK_CONTENT = {
  table: [
    ["做法", "省下的是什么", "难度"],
    ["手机放到另一个房间", "被打断后的二十分钟", "低"],
    ["固定的开工仪式", "进入状态的时间", "中"],
    ["只开一个窗口", "切换留下的注意力残留", "中"],
  ],
  tasks: [
    { text: "列出第二章提纲", done: true },
    { text: "重读 Deep Work 第 3 章", done: true },
    { text: "补完第二章「数字环境」", done: false },
  ],
  books: [
    ["深度工作", { t: "在读", tone: "bg-accent-soft text-accent-text" }, "24", "—"],
    ["思考，快与慢", { t: "读完", tone: "bg-ok-soft text-ok" }, "41", "10月8日"],
    ["注意力曲线", { t: "想读", tone: "bg-info-soft text-info" }, "0", "—"],
  ] as BookRow[],
  board: {
    frame: "为什么分心",
    inside: [
      ["注意力残留", 3, "专注"],
      ["通知的代价", 4, "专注"],
    ],
    outside: [
      ["先改环境，再谈专注", 3],
      ["单任务比多任务更快", 2],
    ],
  } as BoardBlockContent,
};

export type BookStatus = "在读" | "读完" | "想读";

export type Book = { title: string; author: string; status: BookStatus; progress: number; rating: number; finished?: number };

/** 书单数据库（官网数据库区块的 6 条）；finished 为 10 月的日期 */
export const BOOKS: Book[] = [
  { title: "深度工作", author: "卡尔·纽波特", status: "在读", progress: 62, rating: 5 },
  { title: "心流", author: "米哈里·契克森米哈赖", status: "在读", progress: 38, rating: 4 },
  { title: "思考，快与慢", author: "丹尼尔·卡尼曼", status: "读完", progress: 100, rating: 5, finished: 8 },
  { title: "认知天性", author: "彼得·布朗", status: "读完", progress: 100, rating: 4, finished: 21 },
  { title: "注意力曲线", author: "格洛丽亚·马克", status: "想读", progress: 0, rating: 0 },
  { title: "原则", author: "瑞·达利欧", status: "想读", progress: 0, rating: 0 },
];

/** 白板：左边画框收着「为什么分心」的资料，右边从箭头长出思维导图「专注」 */
export const BOARD = {
  title: "专注力手册",
  frames: ["为什么分心", "怎么开始"],
  mindmap: {
    root: "专注",
    branches: [
      { text: "改环境", children: ["书桌与光", "手机放远", "开工仪式"] },
      { text: "养习惯", children: ["番茄钟"] },
      { text: "少工具", children: ["只开一个窗口"] },
    ],
  },
};

/** 输入：少数派文章（官网知识闭环 01 的网页），划下「切换」那句 */
export const WEB_PAGE = {
  url: "sspai.com/post/attention-scarcity",
  host: "sspai.com",
  meta: "少数派 · 深度阅读 · 12 分钟",
  title: "注意力为什么越来越稀缺",
  highlight: "真正消耗我们的，不是工作本身，而是在任务之间来回切换。",
  /** 正文分段：target 是现场划的那句，earlier 是之前已划过的 */
  paragraphs: [
    [
      { text: "每一次通知都在争夺你的注意力。研究发现，" },
      { text: "被打断之后，人平均需要二十多分钟才能回到原来的任务。", mark: "earlier" },
      { text: "真正消耗我们的，不是工作本身，而是在任务之间来回切换。", mark: "target" },
    ],
    [{ text: "所以，与其训练自己「更自律」，不如把会打断你的东西挪出视线。环境替你做了决定，意志力就不必一次次出场。" }],
    [{ text: "当你开始为专注设计环境，深度工作就从一种天赋，变成了一种可以练习的习惯。" }],
  ] as { text: string; mark?: "earlier" | "target" }[][],
  summary: {
    lead: "这篇文章讨论注意力被打断的真实代价。",
    points: ["打断的代价远大于打断本身", "任务切换是注意力的主要损耗", "改环境比练意志力更可靠"],
  },
  /** 侧栏里这一页之前的划线 */
  earlier: ["被打断之后，人平均需要二十多分钟才能回到原来的任务。"],
};

/** 输出：划下的那句成了卡片里的引用（出处是网页标题） */
export const LOOP_CARD = {
  created: "10月18日",
  tags: ["专注", "环境"],
  links: 3,
  blocks: [
    { kind: "heading", level: 2, text: "先改环境，再谈专注" },
    { kind: "quote", text: "真正消耗我们的，不是工作本身，而是在任务之间来回切换。", source: "注意力为什么越来越稀缺" },
    { kind: "paragraph", parts: [{ text: "意志力会耗尽，环境不会。把干扰移出视线，专注就成了" }, { text: "默认选项", bold: true }, { text: "。" }] },
  ] satisfies DocBlock[] as DocBlock[],
};

/** 复习：由这张卡片出的问答闪卡（官网知识闭环 04） */
export const LOOP_REVIEW = {
  deck: "专注与深度工作",
  index: 8,
  total: 20,
  question: "为什么「先改环境」，比「靠意志力」更可靠？",
  answer: "意志力会耗尽，环境不会。把干扰移出视线，专注就成了默认选项。",
  explain: "环境替你做了决定，意志力就不必一次次出场。",
  source: "先改环境，再谈专注",
};

/** 消化：Notebook「专注与深度工作」，网页划线作为「来自摘录」的资料收进来（官网知识闭环 02） */
export const NOTEBOOK = {
  title: "专注与深度工作",
  sources: [
    { kind: "note", title: "Deep Work 读书笔记" },
    { kind: "file", title: "The Extended Mind" },
  ],
  outputs: ["学习大纲", "思维导图"],
  excerpt: {
    title: "注意力为什么越来越稀缺",
    quotes: ["被打断之后，人平均需要二十多分钟才能回到原来的任务。", "真正消耗我们的，不是工作本身，而是在任务之间来回切换。"],
    source: "sspai.com · 2 条划线",
  },
  ask: "切换的代价为什么这么大？",
  answer: "因为每次切换都会留下「注意力残留」：一部分心思还停在上一件事上。切得越频繁，残留越多，真正投入眼前任务的注意力就越少。所以与其靠意志力抵抗打断，不如先把打断移出环境。",
};

/** 分享：发布成博客（官网知识闭环 06），这次新写的卡片排第一行 */
export const PUBLISH = {
  site: "Tau's Blog",
  url: "notes.example.com",
  repo: "tau/notes",
  branch: "gh-pages",
  lastPublished: "3 天前",
  selected: 164,
  upload: 11,
  files: 12,
  skipped: 174,
  currentFile: "cards/xian-gai-huan-jing.html",
  tags: [
    ["全部", 135],
    ["专注", 12],
    ["心理学", 9],
    ["写作", 21],
    ["读书", 18],
  ] as [string, number][],
  cards: [
    { title: "先改环境，再谈专注", excerpt: "意志力会耗尽，环境不会。把干扰移出视线…", on: false },
    { title: "注意力残留", excerpt: "从任务 A 切到任务 B，一部分注意力仍然…", on: true },
    { title: "单任务比多任务更快", excerpt: "切换本身就是成本。一次只做一件事…", on: true },
    { title: "通知的代价", excerpt: "每一次提醒，都是一次被打断…", on: true },
    { title: "周末书单", excerpt: "还没写完，先不发", on: false },
    { title: "写作是思考的外化", excerpt: "写下来，才知道自己哪里没想清楚…", on: true },
  ],
};

/** AI · 创作模式：新文章「专注不是意志力问题」，从笔记里召集资料（官网 AI 区块的创作模式，换成真实可放上白板的类型） */
export const AI_COMPOSE = {
  title: "专注不是意志力问题",
  paragraph: "上午十点，你刚进入状态，手机亮了一下。等你回过神来，已经是二十分钟以后。我们习惯把这归咎于不够自律。可是",
  glowId: "dw-env",
  groups: [
    {
      name: "为什么分心",
      items: [
        {
          id: "dw-residue",
          kind: "card",
          tags: ["专注", "心理学"],
          heading: "注意力残留",
          body: ["从任务 A 切到任务 B，一部分注意力仍然留在 A 上。切换越频繁，残留越多。"],
          why: "解释了被打断后的二十分钟",
          updated: "2024年3月12日",
        },
        { id: "dw-notify", kind: "card", tags: ["专注"], heading: "通知的代价", body: ["每一次提醒，都是一次被打断。打断的代价远大于打断本身。"], why: "开头场景可以直接用", updated: "10月9日" },
        {
          id: "dw-diary",
          kind: "diary",
          tags: ["日记"],
          moment: { day: "2026年10月16日 星期五", time: "21:40" },
          body: ["今天把书桌清空了，只留一盏灯和这本书。下午写了两个番茄，比上周顺很多。"],
          why: "你自己的亲身体会",
          updated: "10月16日",
        },
      ],
    },
    {
      name: "环境 > 意志力",
      items: [
        {
          id: "dw-env",
          kind: "card",
          tags: ["专注", "环境"],
          heading: "先改环境，再谈专注",
          body: ["意志力会耗尽，环境不会。把干扰移出视线，专注就成了默认选项。"],
          why: "这篇的核心论点",
          updated: "10月18日",
        },
        {
          id: "dw-article",
          kind: "article",
          tags: [],
          title: "Deep Work：在喧嚣里保持专注",
          body: ["我们总以为专注是一种意志力。读完 Deep Work 才发现，它更像一种环境……"],
          why: "Deep Work 的完整读书笔记",
          updated: "10月12日",
          cover: 6,
        },
        { id: "dw-single", kind: "card", tags: ["专注"], heading: "单任务比多任务更快", body: ["切换本身就是成本。一次只做一件事，反而更快。"], why: "可作反面论据的补充", updated: "8月21日" },
      ],
    },
  ] as { name: string; items: DocInput[] }[],
};

/** AI · 洞见：对 Deep Work 那篇做查漏补缺（官网 AI 区块的洞见，按真实界面的分类与文案） */
export const INSIGHTS = {
  summary: "这篇讲清楚了「为什么改环境」，但还没回答「怎么坚持」。你写过的三张卡片可以直接接上。",
  chips: [
    { label: "可连接", dot: "bg-info", count: 3 },
    { label: "重复", dot: "bg-ink-3", count: 1 },
    { label: "可以展开", dot: "bg-ink-3", count: 1 },
  ],
  ask: "深度工作和休息，比例多少合适？",
  foot: "10 月 18 日 14:20 · 读了 30 份候选，留下 5 处",
  known: 5,
  pending: 4,
  reading: "对照你的 706 份笔记，找到 30 处可能相关…",
  /** 正文：每段由若干片段组成，mark 为洞见标记 */
  blocks: [
    { kind: "h2", text: "为什么专注变难了" },
    { kind: "p", segments: [{ text: "我们总以为专注是一种意志力。读完 Deep Work 才发现，" }, { text: "它更像一种环境", mark: "link" }, { text: "：你把什么放在手边，把什么放到另一个房间。" }] },
    {
      kind: "p",
      segments: [
        { text: "Cal Newport 把能创造真正价值的工作称为「深度工作」——在无干扰的状态下，把认知能力推到极限。它稀缺，所以珍贵；它也可以练习，只要你" },
        { text: "先改环境，而不是先逼自己", bold: true },
        { text: "。" },
      ],
    },
    { kind: "h2", text: "环境 > 意志力" },
    { kind: "ul", items: [[{ text: "书桌只留当下要用的东西", mark: "dup" }], [{ text: "手机放到另一个房间" }], [{ text: "给自己留一张安静的纸" }]] },
  ] as InsightBlock[],
  /** 「它更像一种环境」那处的气泡 */
  popover: {
    why: "两处都在说「环境替你做决定」，可以连起来。",
    title: "先改环境，再谈专注",
    excerpt: "意志力会耗尽，环境不会。把干扰移出视线，专注就成了默认选项。",
  },
};

export type InsightSegment = { text: string; mark?: "link" | "dup" | "conflict"; bold?: boolean };
export type InsightBlock = { kind: "h2"; text: string } | { kind: "p"; segments: InsightSegment[] } | { kind: "ul"; items: InsightSegment[][] };

/** AI · 小管家：把项目里没做完的待办排进下周上午（待办没有优先级字段，日程没有提醒，按真实工具来） */
export const AI_ASSIST = {
  title: "安排专注力手册",
  model: "Claude Opus 5.5",
  ask: "把「专注力手册」里没做完的待办，排进下周上午的写作时间。",
  todos: [
    { title: "补完第二章「数字环境」", meta: "独立待办 · 2026/10/21 18:00" },
    { title: "把读书笔记整理成卡片", meta: "独立待办 · 2026/10/22 18:00" },
    { title: "给第三章列练习清单", meta: "独立待办 · 2026/10/23 18:00" },
  ],
  answer: "「专注力手册」还有 3 项没做完。我按截止时间，排进了下周一到周三上午 9:30–11:00，每项都在截止前一天完成。",
  week: { label: "10 月 19 – 25 日", code: "2026 · W43", firstDate: 19, today: -1 },
  /** 下周已有的日程（避开上午 9:30–11:00） */
  events: [
    { day: 0, start: 14, end: 15.5, title: "闪卡复习", cal: 2 },
    { day: 1, start: 19, end: 20.5, title: "跑步", cal: 3 },
    { day: 2, start: 15, end: 17, title: "读书会", cal: 0 },
    { day: 3, start: 8.5, end: 10, title: "晨读", cal: 0 },
    { day: 3, start: 14, end: 16, title: "写作时间", cal: 1 },
    { day: 4, start: 10, end: 11, title: "闪卡复习", cal: 2 },
    { day: 5, start: 10, end: 12, title: "番茄 · 扩写初稿", cal: 1 },
  ],
  /** create_calendar_event 安排进来的三段 */
  added: [
    { day: 0, start: 9.5, end: 11, title: "补完第二章「数字环境」", cal: 1 },
    { day: 1, start: 9.5, end: 11, title: "把读书笔记整理成卡片", cal: 1 },
    { day: 2, start: 9.5, end: 11, title: "给第三章列练习清单", cal: 1 },
  ],
};

/** 拉远 → 知识地图：卡片「先改环境，再谈专注」里续写一句，敲 [[ 连上「注意力残留」；随后在地图上做一次洞见 */
export const MAP_CHAPTER = {
  /** 续写的一句：before + [[链接]] + after */
  sentence: { before: "这和", link: "注意力残留", after: "是一回事：每切换一次，就有一部分心思留在上一件事上。" },
  query: "注意",
  mentions: [
    { kind: "card", title: "注意力残留", excerpt: "从任务 A 切到任务 B，一部分注意力仍然留在 A 上。" },
    { kind: "card", title: "注意力是有限的预算", excerpt: "系统 2 每出场一次，都在花同一份预算。" },
    { kind: "card", title: "注意力是会被借走的", excerpt: "每一条通知，都在向你借一点注意力。" },
  ] as const,
  report: {
    reading: "按主题读 706 份笔记的要点（10 个主题，其中 3 个有变化要重新读）…",
    lead: "这周新写的「先改环境，再谈专注」，和你 2020 年记下的「默认选项的力量」接上了：两边都在说，与其和自己较劲，不如改掉默认。",
    pills: [
      { dot: "bg-info", label: "呼应 3" },
      { dot: "bg-warn", label: "问了没写 1" },
    ],
    topics: 3,
    questions: ["环境改好以后，怎么坚持下去？", "深度工作和休息，比例多少合适？"],
    bars: [14, 18, 22, 20, 26, 24, 30, 28, 34, 32, 38, 36, 52, 58, 64, 74],
    recent: 248,
    foot: "10 月 18 日 22:05 · 读了 24 组候选",
  },
  /** 选中的那处呼应（DEEP_INSIGHTS.arcs[1]） */
  popover: {
    summary: "《先改环境，再谈专注》和《默认选项的力量》说的是同一个道理：与其靠意志力，不如改掉默认。",
    why: "一张讲专注，一张讲行为经济学，结论都落在「默认选项」上。",
    ends: [
      { place: "卡片 · 专注与效率", title: "先改环境，再谈专注", claim: "意志力会耗尽，环境不会。把干扰移出视线，专注就成了默认选项。" },
      { place: "卡片 · 经济", title: "默认选项的力量", claim: "人们很少主动改默认设置：默认是什么，结果往往就是什么。" },
    ] as [{ place: string; title: string; claim: string }, { place: string; title: string; claim: string }],
  },
  toast: "已连接《先改环境，再谈专注》与《默认选项的力量》",
};

/**
 * All in one：番茄专注（专注于一条待办）→ 勾掉这条待办 → 番茄自动写进日程 → 日记写一句 → 汇进今日。
 * 今天是 2026 年 10 月 18 日（周日）下午；待办没有优先级，番茄写进系统日历「番茄钟」，日程里显示计时图标。
 */
export const DAILY = {
  todo: "列出第二章提纲",
  pomodoro: {
    minutes: 25,
    preset: "深度写作",
    bind: "列出第二章提纲",
    span: "15:30 开始 → 15:55 结束",
    presets: [
      { name: "深度写作", len: "25′", dot: "bg-accent" },
      { name: "阅读", len: "45′", dot: "bg-tag-2" },
      { name: "复盘", len: "15′", dot: "bg-tag-1" },
      { name: "自由专注", len: "正计时", dot: "bg-tag-3" },
    ],
    summary: { before: ["3", "1h 15m"], after: ["4", "1h 40m"], streak: 42 },
    ledgerSummary: "14 天 · 31 个 · 12h 50m · 日均 55m",
    ledger: [
      {
        label: "今天",
        week: "周日",
        total: "1h 15m",
        blocks: [
          [9.5, 9.92, "bg-accent"],
          [10.1, 10.52, "bg-accent"],
          [14, 14.42, "bg-tag-2"],
        ],
      },
      {
        label: "昨天",
        week: "周六",
        total: "1h 40m",
        blocks: [
          [9, 9.75, "bg-tag-2"],
          [14.5, 14.92, "bg-accent"],
          [21, 21.42, "bg-tag-3"],
        ],
      },
      {
        label: "10/16",
        week: "周五",
        total: "50m",
        blocks: [
          [14, 14.42, "bg-accent"],
          [15, 15.42, "bg-accent"],
        ],
      },
      {
        label: "10/15",
        week: "周四",
        total: "2h 05m",
        blocks: [
          [8, 8.75, "bg-tag-2"],
          [13.5, 14.33, "bg-accent"],
          [20.5, 20.92, "bg-tag-1"],
        ],
      },
      {
        label: "10/14",
        week: "周三",
        total: "55m",
        blocks: [
          [10, 10.42, "bg-accent"],
          [19.5, 19.75, "bg-tag-1"],
        ],
      },
    ] as { label: string; week: string; total: string; blocks: [number, number, string][] }[],
    /** 这次做完的番茄，落在今天那一行 */
    session: [15.5, 15.92, "bg-accent"] as [number, number, string],
  },
  todos: {
    summary: { today: 4, checkin: "1/1" },
    groups: [
      {
        title: "今天",
        sub: "10月18日 · 周日",
        items: [
          { time: "17:00", slot: "截止", title: "列出第二章提纲", project: "专注力手册", dot: "bg-accent", kind: "deadline", today: true, done: false },
          { time: "全天", slot: "打卡", title: "晨读", project: "阅读", dot: "bg-tag-2", kind: "repeat", today: true, done: true },
          { time: "", slot: "", title: "回复读书会的邀请", project: "阅读", dot: "bg-tag-2", kind: "plain", today: true, done: false },
          { time: "", slot: "", title: "重读 Deep Work 第 3 章", project: "专注力手册", dot: "bg-accent", kind: "plain", today: true, done: true },
        ],
      },
      {
        title: "本周稍后",
        sub: "10月19日 – 10月25日",
        items: [
          { time: "周三", slot: "18:00 截止", title: "补完第二章「数字环境」", project: "专注力手册", dot: "bg-accent", kind: "deadline", today: false, done: false },
          { time: "周四", slot: "18:00 截止", title: "把读书笔记整理成卡片", project: "专注力手册", dot: "bg-accent", kind: "deadline", today: false, done: false },
          { time: "周五", slot: "18:00 截止", title: "给第三章列练习清单", project: "专注力手册", dot: "bg-accent", kind: "deadline", today: false, done: false },
        ],
      },
    ],
  },
  schedule: {
    week: { label: "10 月 12 – 18 日", code: "2026 · W42", firstDate: 12, today: 6 },
    calendars: [
      { name: "阅读", light: "#5c7d99", dark: "#8fb0cc" },
      { name: "写作", light: "#b0613f", dark: "#e09a7a" },
      { name: "学习", light: "#61795f", dark: "#97b394" },
      { name: "生活", light: "#8a7aa6", dark: "#b6a8d0" },
      { name: "番茄钟", light: "#b4534a", dark: "#e08a80" },
    ],
    nowHour: 16.05,
    events: [
      { day: 0, start: 9, end: 10.5, title: "晨读", cal: 0 },
      { day: 0, start: 14, end: 15.5, title: "闪卡复习", cal: 2 },
      { day: 1, start: 19, end: 20.5, title: "跑步", cal: 3 },
      { day: 2, start: 15, end: 17, title: "读书会", cal: 0 },
      { day: 3, start: 9, end: 10.5, title: "写作时间", cal: 1 },
      { day: 4, start: 14, end: 15.5, title: "写作时间", cal: 1 },
      { day: 5, start: 9, end: 10.5, title: "晨读", cal: 0 },
      { day: 5, start: 20, end: 21.5, title: "播客录制", cal: 3 },
      { day: 6, start: 9.5, end: 9.92, title: "深度写作", cal: 4, pomodoro: true },
      { day: 6, start: 10.1, end: 10.52, title: "深度写作", cal: 4, pomodoro: true },
      { day: 6, start: 14, end: 14.42, title: "阅读", cal: 4, pomodoro: true },
    ],
    /** 刚做完的番茄：系统日历「番茄钟」里的一条，标题是绑定的待办 */
    added: [{ day: 6, start: 15.5, end: 15.92, title: "列出第二章提纲", cal: 4, pomodoro: true }],
  },
  diary: {
    summary: { month: 18, streak: 12 },
    typed: "第二章的提纲列完了，两个番茄。手机放在另一个房间，果然安静很多。",
    now: "16:02",
    days: [
      { rel: "今天", day: 18, sub: "10月 · 周日", moments: [{ time: "09:12", text: "早上读了半小时 Deep Work。书里说，深度工作是一种可以练的能力。" }] },
      { rel: "2 天前", day: 16, sub: "10月 · 周五", moments: [{ time: "21:40", text: "今天把书桌清空了，只留一盏灯和这本书。下午写了两个番茄，比上周顺很多。", tags: ["专注"] }] },
      { rel: "3 天前", day: 15, sub: "10月 · 周四", moments: [{ time: "22:15", text: "读书会上有人问：深度工作和心流是一回事吗？我答不上来，记下来再想。" }] },
    ] as { rel: string; day: number; sub: string; moments: { time: string; text: string; tags?: string[] }[] }[],
    months: ["10", "9", "8", "7", "6"],
  },
  today: {
    greeting: "下午好",
    dateText: "10月18日星期日",
    /** 汇进来以前 → 以后 */
    focus: ["1h 15m", "1h 40m"],
    pomos: [3, 4],
    words: [1250, 1286],
    created: 3,
    streak: 42,
    decks: [
      { name: "专注与深度工作", due: 6, learning: 5, fresh: 3, total: 20 },
      { name: "写作", due: 3, learning: 4, fresh: 2, total: 26 },
    ],
    todos: [
      { title: "列出第二章提纲", due: "今天 17:00" },
      { title: "回复读书会的邀请", due: "今天" },
      { title: "补完第二章「数字环境」", due: "周三 18:00" },
      { title: "把读书笔记整理成卡片", due: "周四 18:00" },
    ],
    events: [
      { time: "09:30-09:55", title: "深度写作" },
      { time: "10:06-10:31", title: "深度写作" },
      { time: "14:00-14:25", title: "阅读" },
    ],
    /** 刚做完的番茄，汇进日程卡 */
    addedEvent: { time: "15:30-15:55", title: "列出第二章提纲" },
    insight: {
      before: "「注意力残留」和你读《思考，快与慢》时写的",
      em: "「注意力是有限的预算」",
      after: "说的是同一件事",
      desc: "两边都认为：注意力是一份有限的预算，每一次切换都在花它。",
    },
    recent: [
      { kind: "card", title: "先改环境，再谈专注", meta: "今天 · 92 字" },
      { kind: "article", title: "专注不是意志力问题", meta: "今天 · 1,164 字" },
      { kind: "project", title: "专注力手册", meta: "昨天 · 3 篇" },
    ] as { kind: "card" | "article" | "diary" | "project"; title: string; meta: string }[],
    /** 汇进来的日记，排进最近编辑第一个 */
    addedRecent: { kind: "diary", title: "日记 · 2026-10-18", meta: "今天 · 66 字" } as { kind: "diary"; title: string; meta: string },
  },
};

/**
 * 插件 + 本地：插件中心装上微信读书（装完要重启才生效）→ 粘贴 API Key 同步书架 → 导出全部为 Markdown 压缩包。
 * 插件列表是插件中心的真实插件（tests/fixtures/plugins/catalog.json），下载次数没有真实数据，按量级给。
 */
export const PLUGINS = {
  publisher: "lastknightcoder",
  list: [
    { id: "weread", name: "微信读书", version: "1.0.4", desc: "同步微信读书书架、划线与想法，并在 Tau 中查看和引用摘录。", total: 3842, week: 416 },
    { id: "taunote.stickman", name: "火柴人", version: "0.1.1", desc: "在白板中放置人物姿态，支持形体、配色、翻转和手绘画风。", total: 1265, week: 188 },
    { id: "tau.custom-block", name: "自定义组件块", version: "1.0.2", desc: "在文档中编写并预览可交互的 React 组件。", total: 2107, week: 152 },
    { id: "tau.tikz", name: "TikZ 绘图", version: "0.1.0", desc: "在文档和博客中离线编译 TikZ，支持源码编辑与 SVG 预览。", total: 934, week: 97 },
    { id: "tau.sync-webdav", name: "WebDAV 同步存储", version: "0.1.0", desc: "使用 WebDAV 同步数据，在客户端同步设置中配置。", total: 2876, week: 241, installed: true },
    { id: "tau.sync-github", name: "GitHub 同步存储", version: "0.1.0", desc: "使用 GitHub 仓库同步数据，在客户端同步设置中配置。", total: 1983, week: 133 },
    { id: "tau.sync-oss", name: "阿里云 OSS 同步存储", version: "0.1.1", desc: "使用阿里云 OSS 同步数据，在客户端同步设置中配置。", total: 1120, week: 86 },
    { id: "tau.sync-s3", name: "S3 同步存储", version: "0.2.0", desc: "通过 S3 兼容存储同步数据，配置位于客户端的同步设置。", total: 768, week: 54 },
  ] as { id: string; name: string; version: string; desc: string; total: number; week: number; installed?: boolean }[],
  installedCount: 2,
  weread: {
    minutes: 56 * 60 + 12,
    archives: [
      { name: "文学", count: 42 },
      { name: "心理", count: 18 },
      { name: "社科", count: 27 },
      { name: "计算机", count: 15 },
      { name: "经管", count: 14 },
      { name: "历史", count: 12 },
    ],
    total: 128,
    reading: [
      { id: "wr-deepwork", title: "深度工作", author: "卡尔·纽波特", last: "昨天", minutes: 192, progress: 62 },
      { id: "wr-flow", title: "心流", author: "米哈里·契克森米哈赖", last: "3 天前", minutes: 300, progress: 38 },
    ],
    books: [
      { id: "wr-deepwork", title: "深度工作", author: "卡尔·纽波特", status: "reading", progress: 62, notes: 24 },
      { id: "wr-flow", title: "心流", author: "米哈里·契克森米哈赖", status: "reading", progress: 38, notes: 12 },
      { id: "wr-thinking", title: "思考，快与慢", author: "丹尼尔·卡尼曼", status: "finished", progress: 100, notes: 41 },
      { id: "wr-attention", title: "注意力曲线", author: "格洛丽亚·马克", status: "reading", progress: 15, notes: 6 },
      { id: "wr-make-it-stick", title: "认知天性", author: "彼得·布朗", status: "finished", progress: 100, notes: 19 },
      { id: "wr-principles", title: "原则", author: "瑞·达利欧", status: "reading", progress: 8, notes: 3 },
      { id: "wr-peak", title: "刻意练习", author: "安德斯·艾利克森", status: "finished", progress: 100, notes: 27 },
      { id: "wr-atomic", title: "掌控习惯", author: "詹姆斯·克利尔", status: "finished", progress: 100, notes: 33 },
      { id: "wr-zettel", title: "卡片笔记写作法", author: "申克·阿伦斯", status: "finished", progress: 100, notes: 52 },
      { id: "wr-howtoread", title: "如何阅读一本书", author: "莫提默·艾德勒", status: "finished", progress: 100, notes: 18 },
      { id: "wr-nudge", title: "助推", author: "理查德·塞勒", status: "finished", progress: 100, notes: 22 },
      { id: "wr-hackers", title: "黑客与画家", author: "保罗·格雷厄姆", status: "finished", progress: 100, notes: 15 },
      { id: "wr-sapiens", title: "人类简史", author: "尤瓦尔·赫拉利", status: "reading", progress: 46, notes: 9 },
      { id: "wr-essential", title: "精要主义", author: "格雷戈·麦吉沃恩", status: "finished", progress: 100, notes: 11 },
      { id: "wr-mindset", title: "终身成长", author: "卡罗尔·德韦克", status: "unread", progress: 0, notes: 0 },
      { id: "wr-slow", title: "慢生产力", author: "卡尔·纽波特", status: "unread", progress: 0, notes: 0 },
    ] as { id: string; title: string; author: string; status: "reading" | "finished" | "unread"; progress: number; notes: number }[],
  },
  export: {
    total: 706,
    assets: 1268,
    file: "全部-20261018",
    /** 导出弹窗左栏的勾选树（全部范围：项目按文档树，文章与卡片按首个标签分文件夹） */
    tree: [
      { label: "项目", count: 236, children: ["专注力手册", "前端工程笔记", "CSS 布局手册"] },
      { label: "文章", count: 58, children: ["专注", "写作", "读书"] },
      { label: "卡片", count: 412, children: ["专注", "JavaScript", "心理学", "写作"] },
    ],
  },
};

/** 导出完成后访达里的「下载」文件夹（第一行是刚导出的压缩包） */
export const FINDER_ROWS = [
  { name: "全部-20261018.zip", date: "今天 16:12", size: "86.4 MB", kind: "ZIP 归档", zip: true },
  { name: "读书会资料", date: "昨天 21:03", size: "--", kind: "文件夹" },
  { name: "专注力手册-20260930.zip", date: "2026年9月30日 22:40", size: "12.1 MB", kind: "ZIP 归档", zip: true },
  { name: "截图", date: "2026年9月28日 10:15", size: "--", kind: "文件夹" },
];
