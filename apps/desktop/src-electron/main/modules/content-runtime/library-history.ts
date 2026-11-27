import type Database from "better-sqlite3";
import * as Y from "yjs";
import { type DocumentHistoryEntry, type DocumentHistoryReader } from "@tau/collaboration";
import recover from "@tau/db-schema/src/history-archive/recover.sql?raw";
import preserve from "@tau/db-schema/src/history-archive/preserve.sql?raw";
import fixVersions from "@tau/db-schema/src/history-archive/fix-versions.sql?raw";
import capture from "@tau/db-schema/src/history-archive/capture.sql?raw";
import closedInput from "@tau/db-schema/src/history-archive/closed-input.sql?raw";
import desktopInput from "@tau/db-schema/src/history-archive/desktop-input.sql?raw";
import documents from "@tau/db-schema/src/history-archive/documents.sql?raw";
import selectDocuments from "@tau/db-schema/src/history-archive/select-documents.sql?raw";
import entries from "@tau/db-schema/src/history-archive/entries.sql?raw";
import resolveVersions from "@tau/db-schema/src/history-archive/resolve-versions.sql?raw";
import listVersions from "@tau/db-schema/src/history-archive/list.sql?raw";
import read from "@tau/db-schema/src/history-archive/read.sql?raw";
import type { CollaborationLocalStore } from "../collaboration/local-store";

// The cache is attached only while the synchronous transfer holds both SQLite write locks.
export function captureLibraryHistory(
  db: Database.Database,
  store: CollaborationLocalStore,
  id?: string,
  replacing = false,
  preview?: number
) {
  db.prepare("ATTACH DATABASE ? AS history_cache").run(store.db.name);
  try {
    db.transaction(() => {
      db.exec(documents);
      db.prepare(selectDocuments.replaceAll("?1", "@id")).run({ id: id ?? null });
      db.exec(recover);
      for (const input of [closedInput, desktopInput]) {
        db.exec(input);
        db.exec(resolveVersions);
        db.exec(capture);
        db.exec(
          "DROP VIEW temp.history_payload; DROP VIEW temp.history_input; DROP VIEW temp.history_raw"
        );
      }
      if (!id || preview !== undefined)
        db.prepare(`UPDATE history_cache.document_history_entries AS e SET metadata=json_set(metadata,'$.sealed',json('true'))
        WHERE document_id IN (SELECT cache_id FROM temp.history_documents) AND sequence=(
          SELECT MAX(sequence) FROM history_cache.document_history_entries WHERE document_id=e.document_id
        ) AND json_extract(metadata,'$.kind')='edit' AND json_extract(metadata,'$.sealed') IS NOT 1
        AND (@all OR EXISTS(SELECT 1 FROM content_history_versions v JOIN temp.history_documents d USING(document_id) WHERE d.cache_id=e.document_id AND v.sequence=@seq AND json_extract(v.metadata,'$.operationId')=e.operation_id))`).run(
          { all: id ? 0 : 1, seq: preview ?? -1 }
        );
      if (!id || preview !== undefined)
        db.prepare(fixVersions.replaceAll("?1", "@seq")).run({ seq: preview ?? null });
      if (replacing) db.exec(preserve);
      db.exec("DROP TABLE temp.history_documents");
    }).immediate();
  } finally {
    db.exec("DETACH DATABASE history_cache");
  }
}

export class LibraryHistory implements DocumentHistoryReader {
  constructor(private readonly db: Database.Database) {
    db.exec(entries.replace("CREATE TEMP VIEW", "CREATE TEMP VIEW IF NOT EXISTS"));
  }
  private row(id: string, sequence: number) {
    const row = this.db
      .prepare("SELECT * FROM temp.history_version_entries WHERE document_id=? AND sequence=?")
      .get(id, sequence) as
      | { metadata: string; version_key: string; previous_sequence: number | null; undone: number }
      | undefined;
    if (!row) throw new Error("该历史版本不存在");
    return row;
  }
  entry(id: string, sequence: number): DocumentHistoryEntry {
    return JSON.parse(this.row(id, sequence).metadata);
  }
  versionKey(id: string, sequence: number) {
    return this.row(id, sequence).version_key;
  }
  previousSequence(id: string, sequence: number) {
    const previous = this.row(id, sequence).previous_sequence;
    if (previous === null) throw new Error("历史版本缺少前一条记录");
    return previous;
  }
  undone(id: string, sequence: number) {
    return !!this.row(id, sequence).undone;
  }
  list(id: string, before?: number): DocumentHistoryEntry[] {
    const rows = this.db
      .prepare(listVersions.replaceAll("?1", "@id").replaceAll("?2", "@before"))
      .all({ id, before: before ?? null }) as { metadata: string }[];
    return rows.map(row => JSON.parse(row.metadata));
  }
  replay(id: string, sequence: number) {
    const rows = this.db
      .prepare(read.replaceAll("?1", "@id").replaceAll("?2", "@sequence"))
      .all({ id, sequence }) as { state: Buffer; checkpoint: number }[];
    if (!rows[0]?.checkpoint) throw new Error("历史版本缺少起点");
    const doc = new Y.Doc({ gc: false });
    try {
      for (const row of rows) Y.applyUpdate(doc, row.state);
      if (doc.store.pendingStructs || doc.store.pendingDs) throw new Error("历史版本缺少先行增量");
      return doc;
    } catch (error) {
      doc.destroy();
      throw error;
    }
  }
}
