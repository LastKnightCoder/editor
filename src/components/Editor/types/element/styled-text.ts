import { FormattedText } from "../text.ts";
import { EStyledColor } from "../../constants";

export interface StyledTextElement {
  type: "styled-text";
  color: EStyledColor;
  children: FormattedText[];
}
