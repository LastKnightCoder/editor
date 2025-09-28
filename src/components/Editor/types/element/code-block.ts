import { Descendant } from "slate";

export interface CodeBlockElement {
  type: "code-block";
  language: string;
  code: string;
  uuid: string;
  isFold?: boolean;
  foldHeight?: number;
  children: Descendant[];
}
