import { useMemo } from "react";
import {
  buildQueryDatabaseMessages,
  type QueryDatabaseAssistanceInput,
} from "@tau/ai/query-database";
import { useCodeAssist } from "../database/useFormulaAssist";

export function useQueryDatabaseAssist() {
  const complete = useCodeAssist("queryDatabase");
  return useMemo(
    () =>
      complete
        ? (input: QueryDatabaseAssistanceInput) => complete(buildQueryDatabaseMessages(input))
        : undefined,
    [complete]
  );
}
