import { Descendant } from "slate";

export interface DivideLineElement {
  type: 'divide-line';
  children: Descendant[];
}