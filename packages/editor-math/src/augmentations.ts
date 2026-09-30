import type {} from "@tau/editor/api";
import type { InlineMathElement, BlockMathElement } from "./types";

declare module "@tau/editor/api" {
  interface ExtensionElementMap {
    "inline-math": InlineMathElement;
    "block-math": BlockMathElement;
  }
  interface ExtensionInlineElementMap {
    "inline-math": InlineMathElement;
  }
}
