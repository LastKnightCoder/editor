import { FormattedText } from "../text";

export interface UnderlineElement {
  type: "underline";
  color: string;
  lineType: string;
  colorSelectOpen: boolean;
  children: FormattedText[];
}
