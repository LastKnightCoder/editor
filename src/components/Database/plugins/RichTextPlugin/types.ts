export interface RichTextItem {
  id: string;
  contentId: number;
  title: string;
  type: "card" | "article" | "document" | "project-item" | "custom";
  preview?: string; // 内容预览
}

export type RichTextPluginValue = RichTextItem[];

export interface RichTextPluginConfig {
  maxItems?: number;
  allowedTypes?: (
    | "card"
    | "article"
    | "document"
    | "project-item"
    | "custom"
  )[];
}
