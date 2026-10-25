import type { Descendant } from "slate";
import type { ContentEntityReference } from "@tau/db-schema/content-identities";

export interface DatabaseElement {
  type: "database";
  id: string;
  tableId?: number;
  entityRef?: ContentEntityReference;
  height: number;
  children: Descendant[];
}
