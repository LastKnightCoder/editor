import { BlockElement } from "../custom-element.ts";

export interface ListItemElement {
  type: "list-item";
  children: BlockElement[];
  isFold?: boolean;
  allContent?: BlockElement[];
  // Custom icon support
  icon?: string; // Emoji character for emoji type
  iconType?: "emoji" | "image"; // Type of icon
  iconUrl?: string; // URL for custom uploaded images
}

export interface BulletedListElement {
  type: "bulleted-list";
  children: ListItemElement[];
}

export interface NumberedListElement {
  type: "numbered-list";
  children: ListItemElement[];
}
