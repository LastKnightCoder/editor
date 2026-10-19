import type {} from "@tau/editor/api";
import type { DivideLineElement } from "./types";
declare module "@tau/editor/api" {
  interface ExtensionElementMap {
    "divide-line": DivideLineElement;
  }
}
