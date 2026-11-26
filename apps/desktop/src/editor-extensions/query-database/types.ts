import type { Descendant } from "slate";
import type { QueryDefinition } from "@tau/shared/query-database";

export interface QueryDatabaseElement {
  type: "query-database";
  id: string;
  code: string;
  language: QueryDefinition["language"];
  paramsJson?: string;
  presentationJson?: string;
  children: Descendant[];
}
