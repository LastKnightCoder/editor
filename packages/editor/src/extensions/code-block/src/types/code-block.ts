import type { Descendant } from "slate";

export interface CodeStepElement {
  type: "code-step";
  code: string;
  title?: string;
  highlightLines?: string;
  collabId?: string;
  children: Descendant[];
}

export interface CodeBlockV2Element extends Omit<
  CodeBlockElement,
  "code" | "magicMove" | "highlightLines" | "isFold" | "foldHeight" | "children"
> {
  children: CodeStepElement[];
}

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
  code?: string;
  uuid: string;
  magicMove?: CodeBlockMagicMove;
  highlightLines?: string;
  /** 标题栏显示的文件名 */
  filename?: string;
  /** 自动换行；分步演示中不生效 */
  wrap?: boolean;
  /** 行号，缺省显示 */
  lineNumbers?: boolean;
  isFold?: boolean;
  foldHeight?: number;
  children: Descendant[];
}
