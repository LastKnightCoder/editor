import type { Descendant } from "slate";
import type { ContentEntityReference } from "@tau/db-schema/content-identities";

export interface WhiteboardElement {
  type: "whiteboard";
  id: string;
  height: number;
  children: Descendant[];
  whiteboardContentId?: number;
  /** 旧正文遗留的误拼 key，读取兼容（whiteboardEmbedPageId） */
  whiteBoardContentId?: number;
  entityRef?: ContentEntityReference;
}
