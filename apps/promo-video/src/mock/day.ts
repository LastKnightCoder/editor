/**
 * 「一天」的演示数据：读《延展心智》→ 划线 → 写卡片 → AI 整理 → 复习 → 夜里在知识地图上连起来。
 * 各场景引用同一套标题，保证前后对得上。
 */
export const TOPIC = {
  book: "延展心智",
  highlight: "环境不是思考的背景，它本身就参与了思考。",
  card: "笔记是思考的现场",
  article: "工具如何参与思考",
  oldCards: ["卡片笔记法：一张卡只写一个观点", "间隔重复为什么有效", "写作即思考"],
};

export const demoToday = {
  dateText: "10月17日星期六",
  focus: "0分钟",
  words: 0,
  created: 0,
  streak: 42,
  decks: [
    { name: "认知科学", due: 8, learning: 6, fresh: 4, total: 46 },
    { name: "写作方法", due: 4, learning: 3, fresh: 2, total: 28 },
  ],
  todos: [
    { title: "读完《延展心智》第三章", due: "今天" },
    { title: "整理本周的划线", due: "今天" },
    { title: "给读书会准备三个问题", due: "周日" },
  ],
  events: [
    { time: "09:30", title: "阅读 · 延展心智" },
    { time: "14:00", title: "写作时间" },
    { time: "20:30", title: "读书会" },
  ],
  insight: {
    before: "「延展心智」和你两年前写的",
    em: "「卡片笔记法」",
    after: "说的是同一件事",
    desc: "两边都认为：工具不只是存放想法的地方，它会改变想法本身。",
  },
  recent: [
    { kind: "card", title: "写作即思考", meta: "昨天 · 320 字" },
    { kind: "article", title: "我的第二大脑搭建记录", meta: "3 天前 · 4,210 字" },
    { kind: "diary", title: "10月16日", meta: "昨天 · 480 字" },
  ] as const,
};

export const PDF_PAGE = {
  title: "延展心智",
  chapter: "用环境思考",
  page: 112,
  toolbarTop: 206,
  highlight: TOPIC.highlight,
  paragraphs: [
    {
      before: "我们习惯把大脑想象成一台封闭的计算机：信息从感官进入，在颅骨里被处理，再以行动的形式输出。可这幅图景遗漏了很多东西。",
    },
    {
      before: "当一位建筑师在草图上反复涂改，当一位作家把卡片铺满整张桌子，思考并不只发生在他们的脑子里。",
      mark: TOPIC.highlight,
      after: "纸、笔、桌面与墙上的便签，共同构成了一个更大的认知系统。",
    },
    {
      before: "这意味着，改善思考的方式，未必是更努力地「用脑」，而是更用心地设计我们与之共处的环境——包括我们记录、整理和回看想法的那套工具。",
    },
  ],
  annotations: [
    { text: "外部表征让我们得以「看见」自己的想法，并对它进行操作。", page: 98, border: "border-tag-2" },
    { text: "手势不仅是表达，它会反过来塑造正在形成的理解。", page: 64, border: "border-tag-1" },
    { text: "专家与新手的差别，常常在于他们如何安排自己的工作空间。", page: 41, border: "border-tag-4" },
  ],
};

export const REVIEW_CARD = {
  deck: "认知科学",
  index: 7,
  total: 12,
  question: "「延展心智」认为，思考发生在哪里？",
  hint: "想想建筑师的草图和作家的卡片桌。",
  answer: "不只在大脑里——身体、工具与环境共同参与了思考。",
  explain: "外部表征让想法变得可见、可操作，所以记录与整理的方式会反过来影响思考本身。",
  source: "延展心智 · 第 112 页",
};

export const POMODORO = {
  minutes: 25,
  preset: "写作",
  bind: TOPIC.card,
  presets: [
    { name: "写作", len: "25′", dot: "bg-accent" },
    { name: "阅读", len: "45′", dot: "bg-tag-2" },
    { name: "复习", len: "15′", dot: "bg-tag-1" },
    { name: "自由专注", len: "正计时", dot: "bg-tag-3" },
  ],
  ledger: [
    {
      label: "今天",
      week: "周六",
      total: "1h 15m",
      blocks: [
        [9.5, 10.25, "bg-tag-2"],
        [14, 14.42, "bg-accent"],
      ],
    },
    {
      label: "昨天",
      week: "周五",
      total: "2h 10m",
      blocks: [
        [8.5, 9.25, "bg-tag-2"],
        [10, 10.42, "bg-accent"],
        [15, 15.42, "bg-accent"],
        [20, 20.25, "bg-tag-1"],
      ],
    },
    {
      label: "10/16",
      week: "周四",
      total: "1h 40m",
      blocks: [
        [9, 9.75, "bg-tag-2"],
        [14.5, 14.92, "bg-accent"],
        [21, 21.42, "bg-tag-3"],
      ],
    },
    {
      label: "10/15",
      week: "周三",
      total: "55m",
      blocks: [
        [10, 10.42, "bg-accent"],
        [19.5, 19.75, "bg-tag-1"],
      ],
    },
    {
      label: "10/14",
      week: "周二",
      total: "2h 05m",
      blocks: [
        [8, 8.75, "bg-tag-2"],
        [13.5, 14.33, "bg-accent"],
        [20.5, 20.92, "bg-tag-1"],
      ],
    },
  ] as { label: string; week: string; total: string; blocks: [number, number, string][] }[],
};

export const AI_CHAT = {
  title: "整理这周的阅读",
  model: "Claude Opus 5.5",
  ask: "把这周关于「延展心智」的划线和卡片，整理成一篇文章大纲",
  tools: [
    { kind: "search", name: "search_knowledge", note: "1.2 秒" },
    { kind: "row", name: "search_pdf_knowledge", note: "860 毫秒" },
    { kind: "row", name: "rewrite_content_full", note: "2.4 秒" },
  ],
  results: [
    { title: TOPIC.card, kind: "卡片", when: "今天" },
    { title: "卡片笔记法：一张卡只写一个观点", kind: "卡片", when: "2 年前" },
    { title: "我的第二大脑搭建记录", kind: "文章", when: "3 天前" },
  ],
  answerLead: "找到 4 条划线、3 张相关卡片。按你的思路，大纲可以这样搭：",
  outlineTitle: "工具如何参与思考",
  outline: [
    { head: "从一个误解说起", body: "大脑不是封闭的计算机" },
    { head: "环境就是思考的一部分", body: "草图、卡片与桌面" },
    { head: "回到我的笔记系统", body: "卡片笔记法的另一种解释" },
    { head: "设计你的思考环境", body: "记录、链接、回看" },
  ],
  answerTail: "已在「文章」里新建草稿，引用都链好了。",
};

/** 卡片打字脚本：at 为 CardEditorPage 局部帧 */
export const CARD_SCRIPT = {
  heading: { at: 10, text: "笔记是思考的现场" },
  lead: { at: 80, text: "读《延展心智》时划下了这一句：" },
  quote: { at: 140, text: TOPIC.highlight },
  claim: {
    at: 240,
    before: "所以，",
    bold: "记录的方式",
    middle: "会反过来塑造想法——这和",
    link: "卡片笔记法",
    linkedAt: 470,
    after: "说的是同一件事。",
  },
  list: { at: 560, items: ["一张卡只写一个观点", "让卡片之间互相链接"] },
  tags: ["认知科学", "笔记方法"],
};

export const TODO_GROUPS = [
  {
    title: "今天",
    sub: "10月17日 · 周六",
    items: [
      { time: "09:30", slot: "计划", title: "读完《延展心智》第三章", project: "阅读", dot: "bg-tag-2", kind: "plain", today: true, done: false },
      { time: "今天", slot: "截止", title: "整理本周的划线", project: "知识管理", dot: "bg-tag-3", kind: "deadline", today: true, done: false },
      { time: "打卡", slot: "每天", title: "复习闪卡", project: "学习", dot: "bg-tag-1", kind: "repeat", today: true, done: false },
      { time: "20:30", slot: "计划", title: "读书会", project: "阅读", dot: "bg-tag-2", kind: "plain", today: true, done: false },
    ],
  },
  {
    title: "明天",
    sub: "10月18日 · 周日",
    items: [
      { time: "周日", slot: "截止", title: "给读书会准备三个问题", project: "阅读", dot: "bg-tag-2", kind: "deadline", today: false, done: false },
      { time: "10:00", slot: "计划", title: "把大纲扩写成初稿", project: "写作", dot: "bg-accent", kind: "plain", today: false, done: false },
    ],
  },
];

export const CALENDARS = [
  { name: "阅读", light: "#5c7d99", dark: "#8fb0cc" },
  { name: "写作", light: "#b0613f", dark: "#e09a7a" },
  { name: "学习", light: "#61795f", dark: "#97b394" },
  { name: "生活", light: "#8a7aa6", dark: "#b6a8d0" },
];

/** day 0=周一；start/end 为小时 */
export const WEEK_EVENTS = [
  { day: 0, start: 9, end: 10.5, title: "晨读", cal: 0 },
  { day: 0, start: 14, end: 16, title: "写作时间", cal: 1 },
  { day: 1, start: 10, end: 11, title: "闪卡复习", cal: 2 },
  { day: 1, start: 19, end: 20.5, title: "跑步", cal: 3 },
  { day: 2, start: 9, end: 10.5, title: "晨读", cal: 0 },
  { day: 2, start: 15, end: 17, title: "写作时间", cal: 1 },
  { day: 3, start: 10, end: 11, title: "闪卡复习", cal: 2 },
  { day: 3, start: 20, end: 21.5, title: "播客录制", cal: 3 },
  { day: 4, start: 9, end: 10.5, title: "晨读", cal: 0 },
  { day: 4, start: 14, end: 15.5, title: "整理卡片", cal: 1 },
  { day: 5, start: 9.5, end: 11, title: "阅读 · 延展心智", cal: 0 },
  { day: 5, start: 14, end: 16, title: "写作时间", cal: 1 },
  { day: 5, start: 19, end: 19.5, title: "闪卡复习", cal: 2 },
  { day: 5, start: 20.5, end: 22, title: "读书会", cal: 0 },
  { day: 6, start: 10, end: 12, title: "扩写初稿", cal: 1 },
];
