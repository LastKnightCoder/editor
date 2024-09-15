import { EStyledColor } from "../../constants";
import { FormattedText } from "../text.ts";

export interface StyledTextElement {
  type: 'styled-text';
  color: EStyledColor;
  children: FormattedText[];
}
