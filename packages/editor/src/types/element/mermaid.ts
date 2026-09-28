import type { Descendant } from "slate";

export interface MermaidElement {
  type: "mermaid";
  chart: string;
  /** Cached SVG output from mermaid rendering */
  svg?: string;
  /** The chart code that was used to generate the cached SVG */
  compiledFrom?: string;
  /** Timestamp when the SVG was compiled */
  compiledAt?: number;
  children: Descendant[];
}
