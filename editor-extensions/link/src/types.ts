import { type FormattedText } from "@tau/markdown/model";

export interface LinkElement {
  type: "link";
  url: string;
  openEdit?: boolean;
  children: FormattedText[];
}
