import { type FormattedText } from "@tau/markdown/model";

export interface UnderlineElement {
  type: "underline";
  color: string;
  lineType: string;
  colorSelectOpen: boolean;
  children: FormattedText[];
}
