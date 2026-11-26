import type { Descendant } from "slate";
import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";
import type { QuerySource } from "@tau/shared/query-database";

export interface FixtureInfo {
  expected: Partial<Record<QuerySource, string[]>>;
  tables: { id: number; columns: string[]; ids: string[] }[];
  content?: { contentId: number; createdAt: number };
  marker: string;
  bulkSize: number;
  baseline: Record<string, string>;
  projectDocumentCounts: { id: string; count: number }[];
  pinnedGroups: { pinned: number; count: number }[];
  migrations?: { tableId: number; ids: string[] }[];
  migrationSourceUnchanged?: boolean;
}
export interface FixtureInspection {
  snapshot: Record<string, string>;
  quickCheck: unknown;
  foreignKeys: number;
}
export interface FixtureSample {
  source: QuerySource;
  id: string;
  params?: import("@tau/shared/query-database").QueryDefinition["params"];
  diarySegmentId?: number;
}
export interface FixtureDiaryBody {
  segmentId: number;
  contentId: number;
  revision?: string;
  contracts?: ContentContractDictionary;
  content: Descendant[];
}
