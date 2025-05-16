import { Descendant } from "slate";

export interface InlineMathElement {
  type: "inline-math";
  tex: string;
  children: Descendant[];
}

export interface BlockMathElement {
  type: "block-math";
  tex: string;
  children: Descendant[];
}
