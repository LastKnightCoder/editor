/**
 * 斜杠菜单（BlockPanel）条目：桌面端正文场景的真实顺序（apps/desktop/src/services/editorKit.ts 的扩展装配顺序，
 * 图片扩展经 override 移到网页之后），标题 / 关键词 / 描述逐条摘自各扩展的 block-panel-items。
 * 过滤同 core/stores/useBlockPanelStore.ts 的 filterList：对 keywords / title / description 做子串匹配，
 * 搜索时只列出命中的叶子。纯 TS（教程片的迷你编辑器也读它）。
 */
export type SlashIcon =
  | "heading"
  | "list"
  | "checks"
  | "ordered"
  | "tabs"
  | "detail"
  | "highlight"
  | "quote"
  | "callout"
  | "bookmark"
  | "divider"
  | "table"
  | "audio"
  | "video"
  | "annotation"
  | "mermaid"
  | "plantuml"
  | "code"
  | "math"
  | "emoji"
  | "web"
  | "image"
  | "file"
  | "board"
  | "upload"
  | "link"
  | "speech";

export type SlashItem = { title: string; icon: SlashIcon; keywords: string[]; description: string; children?: SlashItem[] };

const heading = (level: number): SlashItem => ({ title: `标题${level}`, icon: "heading", keywords: [`h${level}`, `标题${level}`, "biaoti"], description: `标题${level}` });
const callout = (title: string, en: string, py: string): SlashItem => ({ title, icon: "callout", keywords: ["callout", title, en, py], description: title });
/** 媒体二级项：固定「本地上传 / 网络地址」+ 宿主注册的插入来源（media/utils/mediaInsert.ts） */
const MEDIA_KEYWORDS = { 图片: ["图片", "image", "picture", "pic", "tupian"], 视频: ["视频", "video", "shipin"], 音频: ["音频", "audio", "yinpin"] };
const media = (kind: keyof typeof MEDIA_KEYWORDS, extra: SlashItem[] = []): SlashItem[] => [
  { title: "本地上传", icon: "upload", keywords: ["上传", "upload", "本地", ...MEDIA_KEYWORDS[kind]], description: `从本地选择${kind}文件上传` },
  { title: "网络地址", icon: "link", keywords: ["网络", "链接", "url", ...MEDIA_KEYWORDS[kind]], description: `通过${kind}的网络地址插入` },
  ...extra,
];

export const SLASH_ITEMS: SlashItem[] = [
  {
    title: "标题",
    icon: "heading",
    keywords: ["heading", "title", "h1", "h2", "h3", "h4", "h5", "h6", "标题", "biaoti"],
    description: "插入标题",
    children: [1, 2, 3, 4, 5, 6].map(heading),
  },
  { title: "无序列表", icon: "list", keywords: ["bulleted-list", "列表", "liebiao", "ul"], description: "无序列表" },
  { title: "任务列表", icon: "checks", keywords: ["check-list", "列表", "todo"], description: "任务列表" },
  { title: "有序列表", icon: "ordered", keywords: ["numbered-list", "列表", "liebiao", "ol"], description: "有序列表" },
  { title: "标签页", icon: "tabs", keywords: ["tabs", "Tabs", "标签页", "biaoqianye"], description: "标签页" },
  { title: "详情块", icon: "detail", keywords: ["detail", "详情块", "xiangqingkuai"], description: "详情块" },
  { title: "高亮块", icon: "highlight", keywords: ["highlight", "高亮块", "gaoliangkuai"], description: "高亮块" },
  { title: "引用块", icon: "quote", keywords: ["blockquote", "引用块", "yinyongkuai", "quote"], description: "引用块" },
  {
    title: "Callout",
    icon: "callout",
    keywords: ["callout", "提示", "信息", "笔记", "危险", "警告", "tip", "info", "note", "danger", "warning"],
    description: "插入 Callout",
    children: [callout("提示", "tip", "tishi"), callout("信息", "info", "xinxi"), callout("笔记", "note", "biji"), callout("危险", "danger", "weixian"), callout("警告", "warning", "jinggao")],
  },
  { title: "网页书签", icon: "bookmark", keywords: ["网页书签", "书签", "bookmark", "链接卡片", "shuqian", "wangye"], description: "以卡片展示网页标题、描述与封面" },
  { title: "分割线", icon: "divider", keywords: ["divide-line", "分割线", "fengexian"], description: "分割线" },
  { title: "表格", icon: "table", keywords: ["table", "表格", "biaoge"], description: "表格" },
  {
    title: "音频",
    icon: "audio",
    keywords: ["音频", "audio", "yinpin"],
    description: "插入音频",
    children: media("音频", [{ title: "文本转语音", icon: "speech", keywords: ["文本转语音", ...MEDIA_KEYWORDS.音频], description: "文本转语音" }]),
  },
  { title: "视频", icon: "video", keywords: ["视频", "video", "shipin"], description: "插入视频", children: media("视频") },
  { title: "注解", icon: "annotation", keywords: ["annotation", "注解", "zhujie", "note", "注释"], description: "在光标处插入带序号的注解" },
  { title: "流程图", icon: "mermaid", keywords: ["mermaid", "流程图"], description: "流程图" },
  { title: "PlantUML", icon: "plantuml", keywords: ["plantuml", "uml", "图表"], description: "PlantUML 图表" },
  { title: "代码块", icon: "code", keywords: ["codeblock", "代码块", "daimakuai"], description: "代码块" },
  { title: "数学公式", icon: "math", keywords: ["math", "数学公式", "latex", "katex", "shuxue"], description: "数学公式" },
  { title: "表情符号", icon: "emoji", keywords: ["emoji", "表情", "表情符号", "😊"], description: "插入表情符号" },
  { title: "网页", icon: "web", keywords: ["网页", "url", "webview", "wangye"], description: "插入一个网页视图" },
  {
    title: "图片",
    icon: "image",
    keywords: ["图片", "image", "tupian"],
    description: "插入图片",
    children: media("图片", [{ title: "行内图片", icon: "image", keywords: ["行内图片", "image", "tupian", "inline-image"], description: "行内图片" }]),
  },
  { title: "文件附件", icon: "file", keywords: ["文件", "附件", "file", "attachment"], description: "文件附件" },
  { title: "白板", icon: "board", keywords: ["whiteboard", "canvas", "draw", "白板", "画布", "绘图"], description: "插入一个新的白板" },
  { title: "引用白板", icon: "board", keywords: ["reference", "existing", "whiteboard", "引用", "已有", "白板"], description: "引用一个已有的白板" },
  { title: "数据库视图", icon: "table", keywords: ["database", "数据表", "table"], description: "插入一个数据表视图" },
];

/** `/` 之后的查询：空串列出全部；否则递归展开，只留命中的叶子 */
export function filterSlash(query: string, items: SlashItem[] = SLASH_ITEMS): SlashItem[] {
  if (!query) return items;
  return items.flatMap(item =>
    item.children ? filterSlash(query, item.children) : item.keywords.some(k => k.includes(query)) || item.title.includes(query) || item.description.includes(query) ? [item] : []
  );
}

/** 菜单条目高度（28px 图标块 + 6px × 2 内边距）与条目间距，滚动与定位用 */
export const SLASH_ROW = 40 + 2;
/** 滚动区限高（max-h-[min(360px,70vh)]） */
export const SLASH_MAX_HEIGHT = 360;

/** 高亮项滚进可视区：同 Item 的 scrollIntoView({ block: "nearest" }) */
export function slashScroll(active: number, previous = 0) {
  const top = active * SLASH_ROW;
  const visible = Math.floor(SLASH_MAX_HEIGHT / SLASH_ROW);
  if (top < previous) return top;
  if (top + SLASH_ROW > previous + SLASH_MAX_HEIGHT) return (active - visible + 1) * SLASH_ROW;
  return previous;
}
