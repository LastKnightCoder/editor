import { useQuery } from "@tanstack/react-query";
import { FileText, FolderKanban, Layers, PenLine, type LucideIcon } from "lucide-react";
import type { DataTableSourceKind, DataTableSourceScope } from "@tau/shared/database-types";
import { getDataSourceCatalog, type DataSourceCatalogEntry } from "@/commands/data-table";
import type { SourceDef } from "./data-sources";

export const SOURCE_ICONS: Record<DataTableSourceKind, LucideIcon> = {
  card: Layers,
  article: FileText,
  document: FolderKanban,
  diary: PenLine,
};

export interface SourceDraft {
  scope: DataTableSourceScope;
  fields: string[];
}

export const initialDraft = (def: SourceDef): SourceDraft => ({
  scope: def.defaultScope,
  fields: def.fields.filter(field => field.defaultOn || field.primary).map(field => field.key),
});

export function useDataSourceCatalog() {
  return useQuery({
    queryKey: ["databases", "source-catalog"],
    queryFn: getDataSourceCatalog,
    staleTime: 10_000,
  });
}

export function catalogOptions(
  catalog: DataSourceCatalogEntry[] | undefined,
  kind: DataTableSourceKind
) {
  return catalog?.find(entry => entry.kind === kind)?.options ?? {};
}

/** 范围是否完整：项目文档必须选一个项目 */
export const draftReady = (def: SourceDef, draft: SourceDraft) =>
  def.kind !== "document" || Boolean(draft.scope.projectId);
