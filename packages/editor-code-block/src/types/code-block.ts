import type { Descendant } from "slate";

export interface CodeBlockMagicMoveStep {
  id: string;
  title?: string;
  code: string;
  highlightLines?: string;
}

export interface CodeBlockMagicMove {
  v: 1;
  activeStep: number;
  steps: CodeBlockMagicMoveStep[];
}

export interface CodeBlockElement {
  type: "code-block";
  language: string;
  code: string;
  uuid: string;
  magicMove?: CodeBlockMagicMove;
  highlightLines?: string;
  isFold?: boolean;
  foldHeight?: number;
  children: Descendant[];
}
