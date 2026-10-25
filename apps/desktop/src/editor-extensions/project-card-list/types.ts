import type { Descendant } from "slate";
import type { ContentEntityReference } from "@tau/db-schema/content-identities";

export interface ProjectCardListElement {
  type: "project-card-list";
  projectItemId?: number;
  entityRef?: ContentEntityReference;
  children: Descendant[];
}
