import type {} from "@tau/editor/api";
import type { CustomBlockElement } from "./types";

declare module "@tau/editor/api" {
  interface ExtensionElementMap {
    "custom-block": CustomBlockElement;
  }
}
