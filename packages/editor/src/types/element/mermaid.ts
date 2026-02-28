import { Descendant } from "slate";
import type { MermaidRenderStyle } from "@tau/shared";

export interface MermaidElement {
  type: "mermaid";
  chart: string;
  /** Optional per-block render style. Undefined means following global setting */
  renderStyle?: MermaidRenderStyle;
  /** Cached SVG output from mermaid rendering */
  svg?: string;
  /** The chart code that was used to generate the cached SVG */
  compiledFrom?: string;
  /** Timestamp when the SVG was compiled */
  compiledAt?: number;
  children: Descendant[];
}
