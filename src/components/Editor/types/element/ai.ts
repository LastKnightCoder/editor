import { Descendant } from "slate";

export interface AIElement {
  type: 'ai',
  children: Descendant[];
  isFinished?: boolean;
}
