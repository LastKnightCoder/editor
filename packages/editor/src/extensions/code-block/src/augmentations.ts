import type {} from "@tau/editor/api";
import type { CodeBlockElement } from "./types";
declare module "@tau/editor/api" {
  interface ExtensionElementMap {
    "code-block": CodeBlockElement;
  }
}
