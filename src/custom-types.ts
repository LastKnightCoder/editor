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

export interface HighLightText {
  type: 'highlight';
  text: string;
  extra?: string[];
}

export interface NormalText {
  type: 'normal';
  text: string;
}

export interface BoldText {
  type: 'bold';
  text: string;
}

export interface ItalicText {
  type: 'italic';
  text: string;
}

export interface UnderlineText {
  type: 'underline';
  text: string;
}