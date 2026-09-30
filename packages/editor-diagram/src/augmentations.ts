import type {} from "@tau/editor/api";
import type {
  MermaidElement,
  PlantUMLElement,
  AbcElement,
  TikzElement,
  TypstElement,
} from "./types";

declare module "@tau/editor/api" {
  interface ExtensionElementMap {
    mermaid: MermaidElement;
    plantuml: PlantUMLElement;
    abc: AbcElement;
    tikz: TikzElement;
    typst: TypstElement;
  }
}
