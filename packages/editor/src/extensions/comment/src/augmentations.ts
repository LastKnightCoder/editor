import type {} from "@tau/editor/api";
import type { CommentElement } from "./types";
declare module "@tau/editor/api" {
  interface ExtensionElementMap {
    comment: CommentElement;
  }
  interface ExtensionInlineElementMap {
    comment: CommentElement;
  }
}
