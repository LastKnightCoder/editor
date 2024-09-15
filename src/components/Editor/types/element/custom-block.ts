import { Descendant } from "slate";

export interface CustomBlockElement {
  type: 'custom-block';
  content: string;
  children: Descendant[];
}