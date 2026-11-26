import { invoke } from "@/electron";
import type { QueryDefinition, QueryReadPage, QueryReadRequest } from "@tau/shared/query-database";

export const readQueryData = (request: QueryReadRequest): Promise<QueryReadPage> =>
  invoke("data-table-query:read", request);
export const updateQueryDefinition = (request: {
  tableId: number;
  definition: QueryDefinition;
  expectedRevision: number;
}): Promise<{ definition: QueryDefinition; revision: number }> =>
  invoke("data-table-query:update", request);
