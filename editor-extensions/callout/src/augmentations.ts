import type { CalloutElement } from "./types";
declare module "@tau/editor/api" {
  interface ExtensionElementMap {
    callout: CalloutElement;
  }
}
