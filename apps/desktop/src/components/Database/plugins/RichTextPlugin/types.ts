export interface RichTextItem {
  id: string;
  contentId: number;
  title: string;
  /** "document" 是知识库时代的遗留值：无新生产者，仅为历史单元格数据保留，渲染按 project-item 归并。 */
  type: "card" | "article" | "document" | "project-item" | "custom";
  preview?: string; // 内容预览
}

export type RichTextPluginValue = RichTextItem[];

export interface RichTextPluginConfig {
  maxItems?: number;
  allowedTypes?: ("card" | "article" | "document" | "project-item" | "custom")[];
}
