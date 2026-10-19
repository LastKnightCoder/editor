import type {} from "@tau/editor/api";
import type { FrontMatterElement } from "./types";
declare module "@tau/editor/api" {
  interface ExtensionElementMap {
    "front-matter": FrontMatterElement;
  }
}
