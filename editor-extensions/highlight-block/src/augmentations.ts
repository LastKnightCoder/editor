import type { HighlightBlockElement } from "./types";
declare module "@tau/editor/api" {
  interface ExtensionElementMap {
    "highlight-block": HighlightBlockElement;
  }
}
