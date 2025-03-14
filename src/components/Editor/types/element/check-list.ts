import { BlockElement } from "../custom-element.ts";

export interface CheckListItemElement {
  type: "check-list-item";
  checked: boolean;
  children: BlockElement[];
}

export interface CheckListElement {
  type: "check-list";
  children: CheckListItemElement[];
}
