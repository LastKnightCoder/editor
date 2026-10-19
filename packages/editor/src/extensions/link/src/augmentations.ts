import type {} from "@tau/editor/api";
import type { LinkElement } from "./types";
declare module "@tau/editor/api" {
  interface ExtensionElementMap {
    link: LinkElement;
  }
  interface ExtensionInlineElementMap {
    link: LinkElement;
  }
}
