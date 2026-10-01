import type {
  BulletedListElement,
  NumberedListElement,
  ListItemElement,
  CheckListElement,
  CheckListItemElement,
} from "./types";
declare module "@tau/editor/api" {
  interface ExtensionElementMap {
    "bulleted-list": BulletedListElement;
    "numbered-list": NumberedListElement;
    "list-item": ListItemElement;
    "check-list": CheckListElement;
    "check-list-item": CheckListItemElement;
  }
}
