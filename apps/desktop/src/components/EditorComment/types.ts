import type { Path } from "slate";
import { type CommentElement } from "@tau/editor-comment/types";

export interface CommentPosition {
  element: CommentElement;
  path: Path;
  originalY: number;
  displayY: number;
  cardHeight: number;
  domNode: HTMLElement;
}
