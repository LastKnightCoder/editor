import type {} from "@tau/plugins";
import type { CustomBlockElement } from "./types";

declare module "@tau/plugins" {
  interface EditorElementMap {
    "custom-block": CustomBlockElement;
  }
}
