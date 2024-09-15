import { Descendant } from "slate";

export interface TikzElement {
  type: 'tikz';
  content: string;
  children: Descendant[];
}