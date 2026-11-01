import type Database from "better-sqlite3";
import { joinTodoReminders, normalizeReminders, splitTodoReminders } from "@tau/shared/reminders";

export type ReminderOwner = "todo" | "event";

/**
 * 待办与日程的提醒列表：待办首个仍存 todo_item.remind_before（老写入方只认它），
 * 追加提醒与日程的全部提醒存 item_reminder。
 */
export default class ItemReminderTable {
  static getListenEvents() {
    return {
      "todo:get-reminders": (db: Database.Database, todoId: number) =>
        this.getTodoReminders(db, todoId),
      "todo:update-reminders": (
        db: Database.Database,
        payload: { todoId: number; offsets: number[] }
      ) => this.setTodoReminders(db, payload.todoId, payload.offsets),
      "calendar-event:get-reminders": (db: Database.Database, eventId: number) =>
        this.list(db, "event", eventId),
      "calendar-event:update-reminders": (
        db: Database.Database,
        payload: { eventId: number; offsets: number[] }
      ) => this.replace(db, "event", payload.eventId, payload.offsets),
    } as const;
  }

  static list(db: Database.Database, owner: ReminderOwner, ownerId: number): number[] {
    return (
      db
        .prepare(
          "SELECT offset_ms FROM item_reminder WHERE owner_type = ? AND owner_id = ? ORDER BY offset_ms"
        )
        .all(owner, ownerId) as Array<{ offset_ms: number }>
    ).map(row => row.offset_ms);
  }

  static replace(
    db: Database.Database,
    owner: ReminderOwner,
    ownerId: number,
    offsets: readonly number[]
  ): number[] {
    const list = normalizeReminders(offsets);
    db.transaction(() => {
      db.prepare("DELETE FROM item_reminder WHERE owner_type = ? AND owner_id = ?").run(
        owner,
        ownerId
      );
      const insert = db.prepare(
        "INSERT INTO item_reminder (owner_type, owner_id, offset_ms) VALUES (?, ?, ?)"
      );
      for (const offset of list) insert.run(owner, ownerId, offset);
    })();
    return list;
  }

  static getTodoReminders(db: Database.Database, todoId: number): number[] {
    const row = db.prepare("SELECT remind_before FROM todo_item WHERE id = ?").get(todoId) as
      | { remind_before: number | null }
      | undefined;
    if (!row) return [];
    return joinTodoReminders(row.remind_before, this.list(db, "todo", todoId));
  }

  /** 先写 remind_before（触发器会清空追加提醒），再写追加提醒 */
  static setTodoReminders(db: Database.Database, todoId: number, offsets: readonly number[]) {
    const { first, extras } = splitTodoReminders(offsets);
    db.transaction(() => {
      const changes = db
        .prepare("UPDATE todo_item SET remind_before = ?, update_time = ? WHERE id = ?")
        .run(first, Date.now(), todoId).changes;
      if (!changes) throw new Error("todo_item not found");
      this.replace(db, "todo", todoId, extras);
    })();
    return joinTodoReminders(first, extras);
  }

  /** 批量读取追加提醒：todoId → 追加 offset 列表 */
  static extrasByOwner(db: Database.Database, owner: ReminderOwner): Map<number, number[]> {
    const map = new Map<number, number[]>();
    for (const row of db
      .prepare(
        "SELECT owner_id, offset_ms FROM item_reminder WHERE owner_type = ? ORDER BY owner_id, offset_ms"
      )
      .all(owner) as Array<{ owner_id: number; offset_ms: number }>) {
      const list = map.get(row.owner_id) ?? [];
      list.push(row.offset_ms);
      map.set(row.owner_id, list);
    }
    return map;
  }
}
