import { type FormattedText } from "@tau/markdown/model";
import type { EStyledColor } from "./colors.ts";

export interface StyledTextElement {
  type: "styled-text";
  color: EStyledColor;
  children: FormattedText[];
}
