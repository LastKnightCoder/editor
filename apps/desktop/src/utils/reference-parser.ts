/**
 * 获取引用类型的中文标签
 */
export function getRefTypeLabel(type: string): string {
  switch (type) {
    case "card":
      return "卡片";
    case "article":
      return "文章";
    case "project-item":
      return "项目";
    case "document-item":
      return "知识库";
    case "diary-daily":
      return "日记";
    case "diary-weekly":
      return "周记";
    case "diary-monthly":
      return "月记";
    default:
      return type;
  }
}

/**
 * 获取引用类型的颜色
 */
export function getRefTypeColor(type: string): string {
  switch (type) {
    case "card":
      return "#ec4899"; // pink
    case "article":
      return "#3b82f6"; // blue
    case "project-item":
      return "#10b981"; // green
    case "document-item":
      return "#f59e0b"; // orange
    case "diary-daily":
      return "#8b5cf6"; // purple
    case "diary-weekly":
      return "#06b6d4"; // cyan
    case "diary-monthly":
      return "#d946ef"; // fuchsia
    default:
      return "#6b7280"; // gray
  }
}
