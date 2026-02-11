import type { Descendant } from "slate";

export interface DocumentCardListElement {
  type: "document-card-list";
  documentItemId: number;
  children: Descendant[];
}
