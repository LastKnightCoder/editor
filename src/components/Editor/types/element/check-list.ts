import { ParagraphElement } from "./paragraph.ts";

export interface CheckListItemElement {
  type: "check-list-item";
  checked: boolean;
  children: [ParagraphElement] | [ParagraphElement, CheckListElement];
}

export interface CheckListElement {
  type: "check-list";
  children: CheckListItemElement[];
}
