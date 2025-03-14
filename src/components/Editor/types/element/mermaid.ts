import { Descendant } from "slate";

export interface MermaidElement {
  type: "mermaid";
  chart: string;
  children: Descendant[];
}
