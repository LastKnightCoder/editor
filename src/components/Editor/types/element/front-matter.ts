import { BaseElement, Descendant } from "slate";

export interface FrontMatterElement extends BaseElement {
  type: "front-matter";
  value: string;
  children: Descendant[];
}
