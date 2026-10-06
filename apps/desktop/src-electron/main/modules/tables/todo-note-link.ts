import Database from "better-sqlite3";
import { TodoNoteLink, AttachExistingNotePayload } from "@/types";
import ContentTable from "./content";
import { Descendant } from "slate";

export default class TodoNoteLinkTable {
  static getListenEvents() {
    return {
      "todoNote:list": this.list.bind(this),
      "todoNote:listByTodoIds": this.listByTodoIds.bind(this),
      "todoNote:getById": this.getById.bind(this),
      "todoNote:attachExisting": this.attachExisting.bind(this),
      "todoNote:createAndAttach": this.createAndAttach.bind(this),
      "todoNote:detach": this.detach.bind(this),
      "todoNote:reorder": this.reorder.bind(this),
      "todoNote:updateTitleSnapshot": this.updateTitleSnapshot.bind(this),
    } as const;
  }

  static parse(row: any): TodoNoteLink {
    return {
      id: row.id,
      todoId: row.todo_id,
      contentId: row.content_id,
      title: row.title ?? undefined,
      type: row.type ?? undefined,
      sortIndex: row.sort_index,
      createTime: row.create_time,
      updateTime: row.update_time,
    };
  }

  static list(db: Database.Database, params: { todoId: number }): TodoNoteLink[] {
    const stmt = db.prepare(
      `SELECT * FROM todo_note_link WHERE todo_id = ? ORDER BY sort_index ASC, create_time ASC`
    );
    return (stmt.all(params.todoId) as any[]).map(this.parse);
  }

  static listByTodoIds(
    db: Database.Database,
    params: { todoIds: number[] }
  ): Record<number, TodoNoteLink[]> {
    if (!params.todoIds.length) {
      return {};
    }

    const placeholders = params.todoIds.map(() => "?").join(",");
    const rows = db
      .prepare(
        `SELECT * FROM todo_note_link WHERE todo_id IN (${placeholders}) ORDER BY todo_id ASC, sort_index ASC, create_time ASC`
      )
      .all(...params.todoIds) as any[];

    const grouped: Record<number, TodoNoteLink[]> = {};
    rows.forEach(row => {
      const note = this.parse(row);
      grouped[note.todoId] = [...(grouped[note.todoId] ?? []), note];
    });
    return grouped;
  }

  static getById(db: Database.Database, params: { linkId: number }): TodoNoteLink | null {
    const row = db.prepare(`SELECT * FROM todo_note_link WHERE id = ?`).get(params.linkId);
    return row ? this.parse(row) : null;
  }

  static getMaxSortIndex(db: Database.Database, todoId: number): number {
    const row = db
      .prepare(`SELECT MAX(sort_index) AS max_idx FROM todo_note_link WHERE todo_id = ?`)
      .get(todoId) as { max_idx: number | null };
    return row?.max_idx ?? 0;
  }

  static attachExisting(
    db: Database.Database,
    payload: AttachExistingNotePayload,
    increaseRef = true
  ): TodoNoteLink {
    const now = Date.now();
    const sortIndex = this.getMaxSortIndex(db, payload.todoId) + 1024;
    const res = db
      .prepare(
        `INSERT INTO todo_note_link (todo_id, content_id, title, type, sort_index, create_time, update_time)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        payload.todoId,
        payload.contentId,
        payload.title ?? null,
        payload.type ?? null,
        sortIndex,
        now,
        now
      );
    const id = Number(res.lastInsertRowid);
    if (increaseRef) {
      ContentTable.incrementRefCount(db, payload.contentId);
    }
    const row = db.prepare(`SELECT * FROM todo_note_link WHERE id = ?`).get(id);
    return this.parse(row);
  }

  static createAndAttach(
    db: Database.Database,
    params: { todoId: number; initialTitle?: string }
  ): { link: TodoNoteLink; contentId: number } {
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
        todoId: params.todoId,
        contentId,
        title: params.initialTitle ?? "未命名文档",
        type: "custom",
      },
      false
    );
    return { link, contentId };
  }

  static detach(db: Database.Database, params: { linkId: number }): number {
    const row = db
      .prepare(`SELECT content_id FROM todo_note_link WHERE id = ?`)
      .get(params.linkId) as { content_id: number } | undefined;
    if (!row) return 0;
    const del = db.prepare(`DELETE FROM todo_note_link WHERE id = ?`).run(params.linkId).changes;
    // 减少引用计数/可能删除
    ContentTable.deleteContent(db, row.content_id);
    return del;
  }

  static reorder(
    db: Database.Database,
    params: { todoId: number; orderedLinkIds: number[] }
  ): number {
    const step = 1024;
    const now = Date.now();
    const upd = db.prepare(
      `UPDATE todo_note_link SET sort_index = ?, update_time = ? WHERE id = ? AND todo_id = ?`
    );
    params.orderedLinkIds.forEach((id, idx) => upd.run((idx + 1) * step, now, id, params.todoId));
    return params.orderedLinkIds.length;
  }

  static updateTitleSnapshot(
    db: Database.Database,
    params: { linkId: number; title: string }
  ): number {
    const now = Date.now();
    const res = db
      .prepare(`UPDATE todo_note_link SET title = ?, update_time = ? WHERE id = ?`)
      .run(params.title, now, params.linkId);
    return res.changes;
  }
}
