import type {} from "@tau/editor/api";
import type { AnnotationElement } from "./types";
declare module "@tau/editor/api" {
  interface ExtensionElementMap {
    annotation: AnnotationElement;
  }
  interface ExtensionInlineElementMap {
    annotation: AnnotationElement;
  }
}
