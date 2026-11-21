import type { ParagraphElement } from "@tau/editor/api";

export interface LinkElement {
  type: "link";
  url: string;
  children: ParagraphElement["children"];
}
