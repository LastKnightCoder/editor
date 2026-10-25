import type Database from "better-sqlite3";
import type { ContentEntityKind } from "@tau/db-schema/content-identities";
import { ContentIdentityTable } from "../tables/content-identity";
export interface ContentLibraryBaseline {
  library: {
    source_id: string;
    baseline_id: string;
    confirmed_snapshot: string | null;
    create_time: number;
  };
  entities: {
    entity_kind: ContentEntityKind;
    entity_id: string;
    local_id: number;
    created_at: number;
    retired_at: number | null;
  }[];
}
export function readContentLibraryBaseline(db: Database.Database): ContentLibraryBaseline {
  const library = db
    .prepare(
      "SELECT source_id,baseline_id,confirmed_snapshot,create_time FROM library_identity WHERE id=1"
    )
    .get() as ContentLibraryBaseline["library"] | undefined;
  if (!library) throw new Error("资料库尚未建立来源基线");
  return {
    library,
    entities: db
      .prepare("SELECT * FROM entity_identities")
      .all() as ContentLibraryBaseline["entities"],
  };
}
/** 必须包含在调用方的主库安装事务中；编辑器与白板共用同一身份规则。 */
export function installContentLibraryBaseline(
  db: Database.Database,
  baseline: ContentLibraryBaseline
): void {
  const existingLibrary = ContentIdentityTable.library(db),
    library = baseline.library;
  if (
    existingLibrary &&
    (existingLibrary.sourceId !== library.source_id ||
      existingLibrary.baselineId !== library.baseline_id)
  )
    throw new Error("资料库来源基线已变化");
  if (!existingLibrary)
    db.prepare("INSERT INTO library_identity VALUES (1,?,?,?,?)").run(
      library.source_id,
      library.baseline_id,
      library.confirmed_snapshot,
      library.create_time
    );
  for (const entity of baseline.entities) {
    const existing = db
      .prepare(
        "SELECT entity_id FROM entity_identities WHERE entity_kind=? AND local_id=? AND retired_at IS NULL"
      )
      .get(entity.entity_kind, entity.local_id) as { entity_id: string } | undefined;
    if (!entity.retired_at && existing && existing.entity_id !== entity.entity_id)
      throw new Error("实体来源身份已变化");
    db.prepare("INSERT OR IGNORE INTO entity_identities VALUES (?,?,?,?,?)").run(
      entity.entity_kind,
      entity.entity_id,
      entity.local_id,
      entity.created_at,
      entity.retired_at
    );
  }
}
