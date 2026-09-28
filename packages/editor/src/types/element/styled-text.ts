import type { FormattedText } from "../text";
import type { EStyledColor } from "../../constants/styled-color";

export interface StyledTextElement {
  type: "styled-text";
  color: EStyledColor;
  children: FormattedText[];
}
