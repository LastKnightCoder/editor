import type { EntityRef } from "@/entity/ref";

/** 连接列的一个条目：显式连接（可解除）或正文内联引用（只读） */
export interface LinkCellItem {
  ref: EntityRef;
  title: string;
  inlineOnly: boolean;
  /** 连接落点的正文 id（选择器排除用）；内联引用的老节点可能缺失 */
  contentId: number | null;
}

/** 连接列的单元格值：行内自建（显式连接来自 content_links，标题已解析） */
export interface CardLinksCellValue {
  self: EntityRef;
  selfContentId: number;
  items: LinkCellItem[];
}

export interface CardLinksPluginConfig {
  onClickLink?: (ref: EntityRef) => void;
}
