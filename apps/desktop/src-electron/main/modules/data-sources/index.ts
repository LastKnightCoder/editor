import type { DataTableSourceKind } from "@tau/shared/database-types";
import { articleSource } from "./article";
import { cardSource } from "./card";
import { diarySource } from "./diary";
import { documentSource } from "./document";
import type { DataSourceDefinition } from "./types";

export type { DataSourceDefinition, SourceRow, SourceScopeOptions } from "./types";

const SOURCES: Record<DataTableSourceKind, DataSourceDefinition> = {
  card: cardSource,
  article: articleSource,
  document: documentSource,
  diary: diarySource,
};

export function dataSource(kind: string): DataSourceDefinition {
  const source = SOURCES[kind as DataTableSourceKind];
  if (!source) throw new Error(`不支持的数据源：${kind}`);
  return source;
}
