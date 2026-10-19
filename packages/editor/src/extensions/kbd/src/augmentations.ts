import type {} from "@tau/editor/api";
import type { KbdElement } from "./types";
declare module "@tau/editor/api" {
  interface ExtensionElementMap {
    kbd: KbdElement;
  }
  interface ExtensionInlineElementMap {
    kbd: KbdElement;
  }
}
