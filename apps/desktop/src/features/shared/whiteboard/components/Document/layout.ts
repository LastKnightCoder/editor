import type { DocumentKind } from "@tau/whiteboard";

/** 版宽：卡片与碎碎念是短内容，窄一档，缩小后字更好认 */
/** 阅读纸版心上限：展开后正文按容器宽排，宽屏时不超过它并水平居中 */
export const READER_PAPER_MAX_WIDTH = 820;

export const DOCUMENT_PAPER_WIDTH: Record<DocumentKind, number> = {
  card: 460,
  article: 620,
  "project-item": 620,
  "diary-moment": 460,
};

/** 短内容（卡片、碎碎念）：没有标题，元信息排在正文之后 */
export const isCompactDocument = (kind: DocumentKind) => kind === "card" || kind === "diary-moment";
