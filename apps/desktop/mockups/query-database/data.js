// 图标（lucide 路径子集）与示例数据
const P = {
  db: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/>',
  board: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/>',
  gallery:
    '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  filter: '<path d="M4 5h16l-6 7.5V19l-4 1.5v-8z"/>',
  sort: '<path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4"/>',
  group: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  refresh:
    '<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
  code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
  spark:
    '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z"/>',
  chev: '<path d="m6 9 6 6 6-6"/>',
  chevr: '<path d="m9 6 6 6-6 6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4.5M12 16h.01"/>',
  warn: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  card: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  article:
    '<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>',
  todo: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m8 12 3 3 5-6"/>',
  event: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  diary:
    '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>',
  project: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  doc: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
  wb: '<path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18z"/><circle cx="11" cy="11" r="2"/>',
  text: '<path d="M4 7V5h16v2M9 19h6M12 5v14"/>',
  num: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
  date: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18"/>',
  tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  bool: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m8 12 3 3 5-6"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  out: '<path d="M7 17 17 7M8 7h9v9"/>',
  grip: '<circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/>',
  braces:
    '<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1M16 21h1a2 2 0 0 0 2-2v-5a2 2 0 0 1 2-2 2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/>',
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  live: '<path d="M4.9 19.1a10 10 0 0 1 0-14.2M19.1 4.9a10 10 0 0 1 0 14.2M7.8 16.2a6 6 0 0 1 0-8.4M16.2 7.8a6 6 0 0 1 0 8.4"/><circle cx="12" cy="12" r="2"/>',
};
const ic = (name, cls = "") => `<svg class="i ${cls}" viewBox="0 0 24 24">${P[name] || ""}</svg>`;

const SOURCES = [
  { id: "cards", name: "卡片", icon: "card", fields: "标题、标签、字数、更新时间" },
  { id: "articles", name: "文章", icon: "article", fields: "标题、标签、字数、置顶" },
  { id: "documents", name: "项目文档", icon: "doc", fields: "标题、所属项目、类型" },
  { id: "projects", name: "项目", icon: "project", fields: "标题、归档、根文档数" },
  { id: "todos", name: "待办", icon: "todo", fields: "待办、完成、截止日期、清单" },
  { id: "calendar", name: "日程", icon: "event", fields: "日程、开始、结束、全天" },
  { id: "diary", name: "日记", icon: "diary", fields: "日期、标签、字数" },
  { id: "whiteboards", name: "白板", icon: "wb", fields: "标题、更新时间" },
  { id: "tables", name: "数据库", icon: "db", fields: "读取一个数据库的全部行" },
];

const FIELDS = [
  { key: "title", name: "标题", type: "text" },
  { key: "tags", name: "标签", type: "tag" },
  { key: "wordCount", name: "字数", type: "num" },
  { key: "createdAt", name: "创建时间", type: "date" },
  { key: "updatedAt", name: "更新时间", type: "date" },
  { key: "pinned", name: "置顶", type: "bool" },
  { key: "source", name: "来源", type: "link" },
];
const FN = [
  "hasTag",
  "contains",
  "lower",
  "length",
  "round",
  "toDate",
  "today",
  "count",
  "sum",
  "avg",
];

const CODE_DSL = [
  'TABLE source AS "卡片", tags AS "标签", wordCount AS "字数",',
  '      updatedAt AS "更新时间"',
  "FROM cards",
  "WHERE hasTag(params.tag) AND wordCount > 200",
  "SORT updatedAt DESC",
];
const CODE_BAD = [
  'TABLE source AS "卡片", tagz AS "标签", wordCount AS "字数",',
  '      updatedAt AS "更新时间"',
  "FROM cards",
  "WHERE hasTag(params.tag) AND wordCount > 200",
  "SORT updatedAt DESC",
];
const CODE_AI = [
  'TABLE source AS "卡片", tags AS "标签", wordCount AS "字数",',
  '      round(wordCount / 400) AS "阅读分钟" TYPE number,',
  '      updatedAt AS "更新时间"',
  "FROM cards",
  "WHERE hasTag(params.tag) AND updatedAt >= today() - 30",
  "SORT updatedAt DESC",
];

const TAG_C = {
  读书: "#c0794f",
  心理学: "#7a8fb0",
  经济: "#8a9a5b",
  写作: "#b0789a",
  历史: "#a8865a",
  方法: "#6f9a95",
};
const ROWS = [
  ["思考快与慢：系统 1 的偷懒", ["读书", "心理学"], 1840, "今天 09:12"],
  ["《穷查理宝典》里的逆向思维", ["读书", "方法"], 1265, "昨天 22:40"],
  ["人类简史：认知革命那一章", ["读书", "历史"], 2310, "11月24日"],
  ["卡片写作的三个误区", ["读书", "写作"], 980, "11月23日"],
  ["《原则》：痛苦 + 反思 = 进步", ["读书", "方法"], 1502, "11月21日"],
  ["宏观经济学第 4 章笔记", ["读书", "经济"], 3120, "11月19日"],
  ["峰终定律与产品体验", ["读书", "心理学"], 740, "11月18日"],
  ["费曼学习法到底怎么用", ["读书", "方法"], 612, "11月15日"],
  ["《枪炮、病菌与钢铁》读后", ["读书", "历史"], 2688, "11月12日"],
  ["写给自己的读书清单", ["读书"], 430, "11月10日"],
  ["助推：选择架构的力量", ["读书", "经济"], 1176, "11月08日"],
  ["刻意练习：心理表征", ["读书", "心理学"], 1930, "11月05日"],
];
