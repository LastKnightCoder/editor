import { Descendant } from "slate";

export interface GraphvizElement {
  type: 'graphviz',
  dot: string;
  children: Descendant[];
}