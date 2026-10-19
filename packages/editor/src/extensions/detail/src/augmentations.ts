import type { DetailElement } from "./types";
declare module "@tau/editor/api" {
  interface ExtensionElementMap {
    detail: DetailElement;
  }
}
