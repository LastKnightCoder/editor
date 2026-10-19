import type { WebviewElement } from "./types";
import type {} from "@tau/editor/api";

declare module "@tau/editor/api" {
  interface ExtensionElementMap {
    webview: WebviewElement;
  }
}
