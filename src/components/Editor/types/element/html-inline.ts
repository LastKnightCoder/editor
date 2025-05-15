import { FormattedText } from "../text.ts";

export interface HTMLInlineElement {
  type: "html-inline";
  html: string;
  openEdit?: boolean;
  children: FormattedText[];
}
