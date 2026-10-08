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
    case "diary-moment":
      return "日记";
    case "excerpt":
      return "划线";
    case "pdf-annotation":
      return "PDF 标注";
    case "web-clip":
      return "剪藏";
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
    case "diary-moment":
      return "#8b5cf6"; // purple
    default:
      return "#6b7280"; // gray
  }
}
