import type { FormattedText } from "../text";

export interface KbdElement {
  type: "kbd";
  children: FormattedText[];
}
