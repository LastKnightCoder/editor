import type { ParagraphElement } from "@tau/editor/api";

export interface UnderlineElement {
  type: "underline";
  color: string;
  lineType: string;
  colorSelectOpen: boolean;
  children: ParagraphElement["children"];
}
