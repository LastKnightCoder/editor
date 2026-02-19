import { Descendant } from "slate";

export interface CodeBlockMagicMoveStep {
  id: string;
  title?: string;
  code: string;
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
  isFold?: boolean;
  foldHeight?: number;
  children: Descendant[];
}
