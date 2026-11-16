/**
 * 获取类型显示名称
 */
export function getTypeDisplayName(type: string): string {
  const typeMap: Record<string, string> = {
    card: "卡片",
    article: "文章",
    "project-item": "项目条目",
    "diary-moment": "日记",
    excerpt: "划线",
    "pdf-annotation": "PDF 标注",
    "web-clip": "剪藏",
    "plugin-entity": "插件内容",
  };
  return typeMap[type] || type;
}
