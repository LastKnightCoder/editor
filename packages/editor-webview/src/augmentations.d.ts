import type { WebviewElement } from "./types";
import type {} from "@tau/editor/src/types/custom-element";

declare module "@tau/editor/src/types/custom-element" {
  interface ExternalElementMap {
    webview: WebviewElement;
  }
}
