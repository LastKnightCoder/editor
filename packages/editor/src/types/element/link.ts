import { FormattedText } from "../text";

export interface LinkElement {
  type: "link";
  url: string;
  openEdit?: boolean;
  children: FormattedText[];
}
