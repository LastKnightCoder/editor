import type { DocumentKind } from "@tau/whiteboard";

/** 版宽：卡片与碎碎念是短内容，窄一档，缩小后字更好认 */
export const DOCUMENT_PAPER_WIDTH: Record<DocumentKind, number> = {
  card: 460,
  article: 620,
  "project-item": 620,
  "diary-moment": 460,
};

/** 短内容：居中展开时是更小的纸、高度随内容，不铺满 */
export const isCompactDocument = (kind: DocumentKind) => kind === "card" || kind === "diary-moment";
