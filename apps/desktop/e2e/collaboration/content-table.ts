import { ContentDocumentTable } from "../../src-electron/main/modules/tables/content-document";
import type Database from "better-sqlite3";
import {
  contentSession,
  readSessionContent,
  contentRevision,
} from "../../src-electron/main/modules/collaboration/content-sessions";

export default class ContentTable {
  static getContentById(db: Database.Database, id: number) {
    const row = db.prepare("SELECT * FROM contents WHERE id=?").get(id) as any;
    if (!row) return null;
    const session = contentSession(db, id);
    const stored = ContentDocumentTable.read(db, id);
    return {
      id,
      createTime: row.create_time,
      updateTime: row.update_time,
      count: row.count,
      refCount: row.ref_count,
      content: session
        ? readSessionContent(session).content
        : (stored?.content ?? JSON.parse(row.content)),
      contracts: stored?.contracts,
      revision: session ? contentRevision(session) : undefined,
    };
  }
  static ensureTaskIds() {}
  static createContent(db: Database.Database, value: { content: unknown; count: number }) {
    return Number(
      db
        .prepare("INSERT INTO contents(create_time,update_time,content,count) VALUES (?,?,?,?)")
        .run(Date.now(), Date.now(), JSON.stringify(value.content), value.count).lastInsertRowid
    );
  }
}

export const CONTENT_RELEASE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
