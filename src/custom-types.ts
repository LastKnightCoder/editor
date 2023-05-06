import { Descendant } from "slate";

export interface ParagraphElement {
  type: 'paragraph';
  children: Descendant[];
}

export interface CodeBlockElement {
  type: 'code-block';
  language: string;
  code: string;
}