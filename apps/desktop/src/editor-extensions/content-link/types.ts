import type { ParagraphElement } from "@tau/editor/api";

export interface ContentLinkElement {
  type: "content-link";
  refId: number;
  contentId: number;
  contentType: string;
  contentTitle: string;
  children: ParagraphElement["children"];
}
