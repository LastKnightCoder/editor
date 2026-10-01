import type { Node } from "slate";
import type { ListItemElement, CheckListItemElement } from "./types";
export {
  getElementParent,
  getClosestCurrentElement,
  getParentNodeByNode,
  getPreviousSiblingNode,
  getPrevPath,
  isAtParagraphStart,
  isParagraphElement,
  isParagraphAndEmpty,
} from "@tau/editor/api";
export { insertBulletList, insertNumberedList, insertCheckList } from "./operations";
export const isListItemElement = (node: Node): node is ListItemElement => node.type === "list-item";
export const isCheckListItemElement = (node: Node): node is CheckListItemElement =>
  node.type === "check-list-item";
