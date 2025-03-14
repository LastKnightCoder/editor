import { FormattedText } from "../text.ts";

export interface LinkElement {
  type: "link";
  url: string;
  openEdit?: boolean;
  children: FormattedText[];
}
