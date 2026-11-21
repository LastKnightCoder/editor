import type { ParagraphElement } from "@tau/editor/api";

export interface KbdElement {
  type: "kbd";
  children: ParagraphElement["children"];
}
