import type { Descendant } from "slate";
import type { ContentEntityReference } from "@tau/db-schema/content-identities";

export interface WhiteboardElement {
  type: "whiteboard";
  id: string;
  height: number;
  children: Descendant[];
  whiteBoardContentId?: number;
  entityRef?: ContentEntityReference;
}
