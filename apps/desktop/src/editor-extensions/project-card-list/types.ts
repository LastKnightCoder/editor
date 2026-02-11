import type { Descendant } from "slate";

export interface ProjectCardListElement {
  type: "project-card-list";
  projectItemId: number;
  children: Descendant[];
}
