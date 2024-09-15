import { FormattedText } from "../text.ts";

export interface UnderlineElement {
  type: 'underline',
  color: string;
  lineType: string;
  colorSelectOpen: boolean;
  children: FormattedText[];
}