import Database from "better-sqlite3";
import { Descendant } from "slate";
import ContentTable from "./content";

export interface GoalProgressNoteLink {
  id: number;
  goalProgressEntryId: number;
  contentId: number;
  title?: string;
  type?: string;
  sortIndex: number;
  createTime: number;
  updateTime: number;
}

export interface AttachExistingNotePayload {
  goalProgressEntryId: number;
  contentId: number;
  title?: string;
  type?: string;
}

export default class GoalProgressNoteLinkTable {
  static initTable(db: Database.Database) {
    db.exec(
      `CREATE TABLE IF NOT EXISTS goal_progress_note_link (
        id INTEGER PRIMARY KEY,
        goal_progress_entry_id INTEGER NOT NULL,
        content_id INTEGER NOT NULL,
        title TEXT,
        type TEXT,
        sort_index INTEGER NOT NULL DEFAULT 0,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL
      );`,
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_goal_progress_note_goal_progress_entry ON goal_progress_note_link(goal_progress_entry_id);`,
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_goal_progress_note_content ON goal_progress_note_link(content_id);`,
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_goal_progress_note_sort ON goal_progress_note_link(goal_progress_entry_id, sort_index);`,
    );
  }

  static upgradeTable(_db: Database.Database) {
    // no-op
  }

  static getListenEvents() {
    return {
      "goalProgressNote:list": this.list.bind(this),
      "goalProgressNote:attachExisting": this.attachExisting.bind(this),
      "goalProgressNote:createAndAttach": this.createAndAttach.bind(this),
      "goalProgressNote:detach": this.detach.bind(this),
      "goalProgressNote:reorder": this.reorder.bind(this),
      "goalProgressNote:updateTitleSnapshot":
        this.updateTitleSnapshot.bind(this),
      "goalProgressNote:updateType": this.updateType.bind(this),
    } as const;
  }

  static parse(row: any): GoalProgressNoteLink {
    return {
      id: row.id,
      goalProgressEntryId: row.goal_progress_entry_id,
      contentId: row.content_id,
      title: row.title ?? undefined,
      type: row.type ?? undefined,
      sortIndex: row.sort_index,
      createTime: row.create_time,
      updateTime: row.update_time,
    };
  }

  static list(
    db: Database.Database,
    params: { goalProgressEntryId: number },
  ): GoalProgressNoteLink[] {
    const stmt = db.prepare(
      `SELECT * FROM goal_progress_note_link WHERE goal_progress_entry_id = ? ORDER BY sort_index ASC, create_time ASC`,
    );
    return stmt.all(params.goalProgressEntryId).map(this.parse);
  }

  static getMaxSortIndex(
    db: Database.Database,
    goalProgressEntryId: number,
  ): number {
    const row = db
      .prepare(
        `SELECT MAX(sort_index) AS max_idx FROM goal_progress_note_link WHERE goal_progress_entry_id = ?`,
      )
      .get(goalProgressEntryId) as { max_idx: number | null };
    return row?.max_idx ?? 0;
  }

  static attachExisting(
    db: Database.Database,
    payload: AttachExistingNotePayload,
    increaseRef = true,
  ): GoalProgressNoteLink {
    const now = Date.now();
    const sortIndex =
      this.getMaxSortIndex(db, payload.goalProgressEntryId) + 1024;
    const res = db
      .prepare(
        `INSERT INTO goal_progress_note_link (goal_progress_entry_id, content_id, title, type, sort_index, create_time, update_time)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        payload.goalProgressEntryId,
        payload.contentId,
        payload.title ?? null,
        payload.type ?? null,
        sortIndex,
        now,
        now,
      );
    const id = Number(res.lastInsertRowid);
    if (increaseRef) {
      ContentTable.incrementRefCount(db, payload.contentId);
    }
    const row = db
      .prepare(`SELECT * FROM goal_progress_note_link WHERE id = ?`)
      .get(id);
    return this.parse(row);
  }

  static createAndAttach(
    db: Database.Database,
    params: { goalProgressEntryId: number; initialTitle?: string },
  ): { link: GoalProgressNoteLink; contentId: number } {
    const emptyContent: Descendant[] = [
      { type: "paragraph", children: [{ type: "formatted", text: "" }] },
    ];
    const contentId = ContentTable.createContent(db, {
      content: emptyContent,
      count: 0,
    });
    const link = this.attachExisting(
      db,
      {
        goalProgressEntryId: params.goalProgressEntryId,
        contentId,
        title: params.initialTitle ?? "未命名文档",
        type: "custom",
      },
      false,
    );
    return { link, contentId };
  }

  static detach(db: Database.Database, params: { linkId: number }): number {
    const row = db
      .prepare(`SELECT content_id FROM goal_progress_note_link WHERE id = ?`)
      .get(params.linkId) as { content_id: number } | undefined;
    if (!row) return 0;
    const del = db
      .prepare(`DELETE FROM goal_progress_note_link WHERE id = ?`)
      .run(params.linkId).changes;
    // 减少引用计数/可能删除
    ContentTable.deleteContent(db, row.content_id);
    return del;
  }

  static reorder(
    db: Database.Database,
    params: { goalProgressEntryId: number; orderedLinkIds: number[] },
  ): number {
    const step = 1024;
    const now = Date.now();
    const upd = db.prepare(
      `UPDATE goal_progress_note_link SET sort_index = ?, update_time = ? WHERE id = ? AND goal_progress_entry_id = ?`,
    );
    params.orderedLinkIds.forEach((id, idx) =>
      upd.run((idx + 1) * step, now, id, params.goalProgressEntryId),
    );
    return params.orderedLinkIds.length;
  }

  static updateTitleSnapshot(
    db: Database.Database,
    params: { linkId: number; title: string },
  ): number {
    const now = Date.now();
    const res = db
      .prepare(
        `UPDATE goal_progress_note_link SET title = ?, update_time = ? WHERE id = ?`,
      )
      .run(params.title, now, params.linkId);
    return res.changes;
  }

  static updateType(
    db: Database.Database,
    params: { linkId: number; type: string },
  ): number {
    const now = Date.now();
    const res = db
      .prepare(
        `UPDATE goal_progress_note_link SET type = ?, update_time = ? WHERE id = ?`,
      )
      .run(params.type, now, params.linkId);
    return res.changes;
  }
}
