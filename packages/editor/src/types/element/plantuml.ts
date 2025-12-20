import { Descendant } from "slate";

export interface PlantUMLElement {
  type: "plantuml";
  content: string;
  svg?: string;
  compiledFrom?: string;
  compiledAt?: number;
  children: Descendant[];
}
