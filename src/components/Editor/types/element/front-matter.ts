import { BaseElement } from "slate";
import { FormattedText } from "../text";

export interface FrontMatterElement extends BaseElement {
  type: "front-matter";
  value: string;
  children: FormattedText[];
}
