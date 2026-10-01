import { type FormattedText } from "@tau/markdown/model";

export interface KbdElement {
  type: "kbd";
  children: FormattedText[];
}
