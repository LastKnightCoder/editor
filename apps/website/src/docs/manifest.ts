/**
 * 使用文档的目录：分组、顺序与标题都在这里，正文在 content/docs/<slug>.md（首篇为 index.md）。
 * 纯数据，vite.config.ts 构建时也按它为每篇文档生成入口页。
 */
export interface DocEntry {
  /** 地址段：/docs/<slug>/；首篇为空串，对应 /docs/ */
  slug: string;
  title: string;
  /** 页面描述，用于 <meta name="description"> */
  summary: string;
  /** 不进目录与上下篇（如隐私政策），只能经链接打开 */
  hidden?: boolean;
}

export interface DocGroup {
  title: string;
  items: DocEntry[];
}

/** 分组与软件侧栏一致（app/navigation.ts），用户在软件里看到什么，目录里就找得到什么 */
export const DOC_GROUPS: DocGroup[] = [
  {
    title: "开始",
    items: [
      {
        slug: "",
        title: "Tau 是什么",
        summary: "认识 Tau：本地优先的个人知识工作台。",
      },
      {
        slug: "install",
        title: "下载与安装",
        summary: "在 macOS、Windows 与 Android 上安装 Tau。",
      },
      {
        slug: "quick-start",
        title: "五分钟上手",
        summary: "写下第一张卡片，再把它连进你的知识网。",
      },
      {
        slug: "paths",
        title: "选一条路线",
        summary: "按你想做的事，挑三四篇先读。",
      },
    ],
  },
  {
    title: "日常",
    items: [
      {
        slug: "today",
        title: "今日",
        summary: "打开 Tau 的第一屏：今天要做的、要复习的、刚写过的。",
      },
      {
        slug: "todos",
        title: "待办与日程",
        summary: "记下要做的事，排进日历，到点提醒。",
      },
      {
        slug: "diary",
        title: "日记",
        summary: "每天一页，回头翻看某一天写了什么。",
      },
      {
        slug: "pomodoro",
        title: "番茄专注",
        summary: "一次专注一件事，计时、休息与专注记录。",
      },
    ],
  },
  {
    title: "知识",
    items: [
      {
        slug: "editor",
        title: "编辑器基础",
        summary: "所见即所得的 Markdown 编辑：语法、快捷键与常用块。",
      },
      {
        slug: "cards",
        title: "卡片",
        summary: "随笔、短思考和一闪念，用标签和引用连起来。",
      },
      {
        slug: "articles",
        title: "文章",
        summary: "展开论述的长文，配合创作模式对照资料来写。",
      },
      {
        slug: "projects",
        title: "项目",
        summary: "用目录层级把一个主题系统地整理成一套文档。",
      },
      {
        slug: "whiteboard",
        title: "白板",
        summary: "在无限画布上摊开想法：思维导图、画框与演示。",
      },
      {
        slug: "database",
        title: "数据库",
        summary: "一份数据，表格、看板、画廊、日历多种视图。",
      },
    ],
  },
  {
    title: "学习",
    items: [
      {
        slug: "reading",
        title: "收集与阅读",
        summary: "网页、PDF 与书里的划线，带着出处收进 Tau。",
      },
      {
        slug: "notebook",
        title: "Notebook",
        summary: "围绕一组资料提问，把读懂的整理成大纲。",
      },
      {
        slug: "flashcards",
        title: "闪卡复习",
        summary: "把要记住的做成闪卡，按遗忘规律安排复习。",
      },
      {
        slug: "walk",
        title: "漫步与知识地图",
        summary: "和旧想法重逢，看见内容之间的关联。",
      },
    ],
  },
  {
    title: "AI",
    items: [
      {
        slug: "ai",
        title: "AI 对话与洞见",
        summary: "连接模型后，让 AI 读你的内容、替你动手、帮你查漏补缺。",
      },
      {
        slug: "skills-mcp",
        title: "Skill 与 MCP",
        summary: "教 AI 新的做事方法，接入更多外部工具。",
      },
    ],
  },
  {
    title: "分享",
    items: [
      {
        slug: "publish",
        title: "发布",
        summary: "把内容发布成自己的静态网站。",
      },
      {
        slug: "collaboration",
        title: "协作",
        summary: "邀请别人和你一起实时编辑同一份内容。",
      },
    ],
  },
  {
    title: "更多",
    items: [
      {
        slug: "mobile",
        title: "手机端",
        summary: "在 Android 上随手记、随时复习。",
      },
      {
        slug: "plugins",
        title: "插件",
        summary: "在插件中心挑选、安装与管理插件。",
      },
      {
        slug: "data",
        title: "数据与备份",
        summary: "你的数据存在哪里，如何导出与备份。",
      },
      { slug: "shortcuts", title: "快捷键", summary: "常用操作的快捷键速查。" },
      {
        slug: "faq",
        title: "常见问题",
        summary: "使用 Tau 时常被问到的问题。",
      },
      {
        slug: "browser-companion-privacy",
        title: "Tau 伴读隐私政策",
        summary: "「Tau 伴读」浏览器扩展会处理哪些数据、存在哪里、交给谁。",
        hidden: true,
      },
    ],
  },
];

/** 全部文档，含不进目录的 */
export const ALL_DOC_ENTRIES: DocEntry[] = DOC_GROUPS.flatMap(group => group.items);

/** 目录里显示、参与上下篇的文档 */
export const DOC_ENTRIES: DocEntry[] = ALL_DOC_ENTRIES.filter(entry => !entry.hidden);

export const docHref = (slug: string) => (slug ? `/docs/${slug}/` : "/docs/");

/** /docs/、/docs/install、/docs/install/ 都能找到对应文档；找不到返回 undefined */
export function findDoc(pathname: string): DocEntry | undefined {
  const match = /^\/docs(?:\/([^/]*))?\/?$/.exec(pathname);
  if (!match) return undefined;
  const slug = decodeURIComponent(match[1] ?? "");
  return ALL_DOC_ENTRIES.find(entry => entry.slug === slug);
}

export const docPageTitle = (entry: DocEntry) =>
  entry.slug ? `${entry.title} · Tau 使用文档` : "Tau 使用文档";
