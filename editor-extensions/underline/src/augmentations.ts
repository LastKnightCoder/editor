import type {} from "@tau/editor/api";
import type { UnderlineElement } from "./types";

declare module "@tau/editor/api" {
  interface ExtensionElementMap {
    underline: UnderlineElement;
  }
  interface ExtensionInlineElementMap {
    underline: UnderlineElement;
  }
}
