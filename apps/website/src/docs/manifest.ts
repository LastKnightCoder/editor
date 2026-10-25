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
}

export interface DocGroup {
  title: string;
  items: DocEntry[];
}

export const DOC_GROUPS: DocGroup[] = [
  {
    title: "开始",
    items: [
      { slug: "", title: "Tau 是什么", summary: "认识 Tau：本地优先的个人知识工作台。" },
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
    ],
  },
  {
    title: "写作",
    items: [
      {
        slug: "editor",
        title: "编辑器基础",
        summary: "所见即所得的 Markdown 编辑：语法、快捷键与常用块。",
      },
      { slug: "outputs", title: "卡片、文章与项目文档", summary: "三种输出形式各适合写什么。" },
    ],
  },
  {
    title: "整理与回顾",
    items: [
      {
        slug: "whiteboard",
        title: "白板",
        summary: "在无限画布上摊开想法：思维导图、画框与演示。",
      },
      { slug: "database", title: "数据库", summary: "一份数据，表格、看板、画廊、日历四种视图。" },
      {
        slug: "review",
        title: "复习与知识地图",
        summary: "闪卡、漫步与知识地图，让旧想法重新被看见。",
      },
    ],
  },
  {
    title: "扩展",
    items: [
      { slug: "ai", title: "AI 助手", summary: "连接模型后，让 AI 读你的内容、替你动手。" },
      { slug: "plugins", title: "插件", summary: "在插件中心挑选、安装与管理插件。" },
    ],
  },
  {
    title: "更多",
    items: [
      { slug: "data", title: "数据与备份", summary: "你的数据存在哪里，如何导出与备份。" },
      { slug: "faq", title: "常见问题", summary: "使用 Tau 时常被问到的问题。" },
      {
        slug: "browser-companion-privacy",
        title: "Tau 伴读隐私政策",
        summary: "「Tau 伴读」浏览器扩展会处理哪些数据、存在哪里、交给谁。",
      },
    ],
  },
];

export const DOC_ENTRIES: DocEntry[] = DOC_GROUPS.flatMap(group => group.items);

export const docHref = (slug: string) => (slug ? `/docs/${slug}/` : "/docs/");

/** /docs/、/docs/install、/docs/install/ 都能找到对应文档；找不到返回 undefined */
export function findDoc(pathname: string): DocEntry | undefined {
  const match = /^\/docs(?:\/([^/]*))?\/?$/.exec(pathname);
  if (!match) return undefined;
  const slug = decodeURIComponent(match[1] ?? "");
  return DOC_ENTRIES.find(entry => entry.slug === slug);
}

export const docPageTitle = (entry: DocEntry) =>
  entry.slug ? `${entry.title} · Tau 使用文档` : "Tau 使用文档";
