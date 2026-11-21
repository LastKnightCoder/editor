import type { ParagraphElement } from "@tau/editor/api";
import type { EStyledColor } from "./colors.ts";

export interface StyledTextElement {
  type: "styled-text";
  color: EStyledColor;
  children: ParagraphElement["children"];
}
