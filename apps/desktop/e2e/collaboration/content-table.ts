import type Database from "better-sqlite3";
import { readSharedContent } from "@tau/collaboration";
import {
  contentSession,
  contentRevision,
} from "../../src-electron/main/modules/collaboration/content-sessions";

export default class ContentTable {
  static getContentById(db: Database.Database, id: number) {
    const row = db.prepare("SELECT * FROM contents WHERE id=?").get(id) as any;
    if (!row) return null;
    const session = contentSession(db, id);
    return {
      id,
      createTime: row.create_time,
      updateTime: row.update_time,
      count: row.count,
      refCount: row.ref_count,
      content: session
        ? readSharedContent(session.doc, session.privateNodes).content
        : JSON.parse(row.content),
      revision: session ? contentRevision(session) : undefined,
    };
  }
  static createContent(db: Database.Database, value: { content: unknown; count: number }) {
    return Number(
      db
        .prepare("INSERT INTO contents(create_time,update_time,content,count) VALUES (?,?,?,?)")
        .run(Date.now(), Date.now(), JSON.stringify(value.content), value.count).lastInsertRowid
    );
  }
}
