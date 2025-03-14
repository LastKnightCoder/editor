import { BlockElement } from "../custom-element.ts";

export interface ListItemElement {
  type: "list-item";
  children: BlockElement[];
  isFold?: boolean;
  allContent?: BlockElement[];
}

export interface BulletedListElement {
  type: "bulleted-list";
  children: ListItemElement[];
}

export interface NumberedListElement {
  type: "numbered-list";
  children: ListItemElement[];
}
