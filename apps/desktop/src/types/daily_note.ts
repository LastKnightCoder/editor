import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";
import { Descendant } from "slate";

export interface DailyNote {
  id: number;
  content: Descendant[];
  contracts?: ContentContractDictionary;
  date: string;
  contentId: number;
}
