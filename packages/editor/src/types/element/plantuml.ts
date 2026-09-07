import { Descendant } from "slate";

export interface PlantUMLElement {
  type: "plantuml";
  content: string;
  children: Descendant[];
}
