import { type FormattedText } from "@tau/markdown/model";

export interface LinkElement {
  type: "link";
  url: string;
  children: FormattedText[];
}
