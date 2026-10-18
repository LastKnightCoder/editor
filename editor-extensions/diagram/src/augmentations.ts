import type {} from "@tau/editor/api";
import type { MermaidElement, PlantUMLElement, AbcElement, TypstElement } from "./types";

declare module "@tau/editor/api" {
  interface ExtensionElementMap {
    mermaid: MermaidElement;
    plantuml: PlantUMLElement;
    abc: AbcElement;
    typst: TypstElement;
  }
}
