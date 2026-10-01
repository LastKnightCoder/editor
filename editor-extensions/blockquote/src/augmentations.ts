import type { BlockquoteElement } from "./types";
declare module "@tau/editor/api" {
  interface ExtensionElementMap {
    blockquote: BlockquoteElement;
  }
}
