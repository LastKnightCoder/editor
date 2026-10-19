/** 插件中心分类按扩展点划分，顺序即展示顺序；新增面向用户的扩展点时同步扩充。 */
export const PLUGIN_CATEGORIES = [
  { id: "sync", label: "同步" },
  { id: "upload", label: "资源上传" },
  { id: "editor", label: "编辑器" },
  { id: "whiteboard", label: "白板" },
  { id: "blog-template", label: "博客模板" },
  { id: "ai", label: "AI" },
  { id: "voice", label: "语音" },
  { id: "video", label: "在线视频" },
  { id: "page", label: "页面" },
] as const;

export type PluginCategory = (typeof PLUGIN_CATEGORIES)[number]["id"];

export const PLUGIN_KEYWORD_LIMIT = 5;
export const PLUGIN_KEYWORD_MAX_LENGTH = 20;

const categoryIds = new Set<string>(PLUGIN_CATEGORIES.map(item => item.id));

export const isPluginCategory = (value: unknown): value is PluginCategory =>
  typeof value === "string" && categoryIds.has(value);

export interface PluginCatalogFields {
  categories?: readonly PluginCategory[];
  keywords?: readonly string[];
}

/**
 * 读取 manifest 中的分类与关键词。
 * strict 用于门户上传，非法值直接报错；客户端用宽松模式静默丢弃，
 * 使老客户端不会因词表新增或上限调整而拒收插件。
 */
export function readCatalogFields(
  item: Record<string, unknown>,
  strict: boolean
): PluginCatalogFields {
  const fail = (message: string) => {
    if (strict) throw new Error(message);
  };
  const list = (value: unknown, name: string): unknown[] => {
    if (value === undefined) return [];
    if (Array.isArray(value)) return value;
    fail(`${name} 必须是数组`);
    return [];
  };

  const categories: PluginCategory[] = [];
  for (const value of list(item.categories, "categories")) {
    if (!isPluginCategory(value)) fail(`未知插件分类：${String(value)}`);
    else if (!categories.includes(value)) categories.push(value);
  }

  const keywords: string[] = [];
  for (const value of list(item.keywords, "keywords")) {
    const keyword = typeof value === "string" ? value.trim() : "";
    if (!keyword || keyword.length > PLUGIN_KEYWORD_MAX_LENGTH)
      fail(`关键词必须为 1 至 ${PLUGIN_KEYWORD_MAX_LENGTH} 字`);
    else if (!keywords.includes(keyword)) keywords.push(keyword);
  }
  if (keywords.length > PLUGIN_KEYWORD_LIMIT) {
    fail(`关键词最多 ${PLUGIN_KEYWORD_LIMIT} 个`);
    keywords.length = PLUGIN_KEYWORD_LIMIT;
  }

  return {
    ...(categories.length ? { categories: Object.freeze(categories) } : {}),
    ...(keywords.length ? { keywords: Object.freeze(keywords) } : {}),
  };
}
