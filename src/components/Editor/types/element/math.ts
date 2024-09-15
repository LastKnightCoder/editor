import { FormattedText } from "../text.ts";
import { Descendant } from "slate";

export interface InlineMathElement {
  type: 'inline-math';
  tex: string;
  children: FormattedText[];
}

export interface BlockMathElement {
  type: 'block-math';
  tex: string;
  children: Descendant[];
}