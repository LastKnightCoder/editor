import type { TabsElement, TabPaneElement } from "./types";
declare module "@tau/editor/api" {
  interface ExtensionElementMap {
    tabs: TabsElement;
    "tab-pane": TabPaneElement;
  }
}
