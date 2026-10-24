/** 插件中心分类按扩展点划分，顺序即展示顺序；新增面向用户的扩展点时同步扩充。 */
export const PLUGIN_CATEGORIES = [
  { id: "sync", label: "同步" },
  { id: "upload", label: "资源上传" },
  { id: "editor", label: "编辑器" },
  { id: "whiteboard", label: "白板" },
  { id: "blog-template", label: "博客模板" },
  { id: "blog-publish", label: "博客发布" },
  { id: "ai", label: "AI" },
  { id: "skill", label: "Skill" },
  { id: "voice", label: "语音" },
  { id: "video", label: "视频" },
  { id: "page", label: "页面" },
] as const;

export type PluginCategory = (typeof PLUGIN_CATEGORIES)[number]["id"];

const categoryIds = new Set<string>(PLUGIN_CATEGORIES.map(item => item.id));

export const isPluginCategory = (value: unknown): value is PluginCategory =>
  typeof value === "string" && categoryIds.has(value);

export interface PluginCatalogFields {
  categories?: readonly PluginCategory[];
  keywords?: readonly string[];
}

/** 分类使用产品词表，关键词保留有效文本并去重。 */
export function readCatalogFields(item: Record<string, unknown>): PluginCatalogFields {
  const list = (value: unknown, name: string): unknown[] => {
    if (value === undefined) return [];
    if (Array.isArray(value)) return value;
    throw new Error(`${name} 必须是数组`);
  };

  const categories: PluginCategory[] = [];
  for (const value of list(item.categories, "categories")) {
    if (!isPluginCategory(value)) throw new Error(`未知插件分类：${String(value)}`);
    else if (!categories.includes(value)) categories.push(value);
  }

  const keywords: string[] = [];
  for (const value of list(item.keywords, "keywords")) {
    const keyword = typeof value === "string" ? value.trim() : "";
    if (!keyword) throw new Error("关键词必须是非空文本");
    else if (!keywords.includes(keyword)) keywords.push(keyword);
  }

  return {
    ...(categories.length ? { categories: Object.freeze(categories) } : {}),
    ...(keywords.length ? { keywords: Object.freeze(keywords) } : {}),
  };
}
