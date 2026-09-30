import type {} from "@tau/editor/api";
import type { HTMLBlockElement, HTMLInlineElement } from "./types";

declare module "@tau/editor/api" {
  interface ExtensionElementMap {
    "html-block": HTMLBlockElement;
    "html-inline": HTMLInlineElement;
  }
  interface ExtensionInlineElementMap {
    "html-inline": HTMLInlineElement;
  }
}
