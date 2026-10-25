import type {} from "@tau/editor/api";
import type { CodeBlockElement, CodeStepElement } from "./types";
declare module "@tau/editor/api" {
  interface ExtensionElementMap {
    "code-block": CodeBlockElement;
    "code-step": CodeStepElement;
  }
}
