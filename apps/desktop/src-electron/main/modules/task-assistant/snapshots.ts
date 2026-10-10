import type Database from "better-sqlite3";
import ContentTable from "../tables/content";
import { canonical, fail, type Row } from "./common";

const KEYS: Record<string, string[]> = {
  todo_item: ["id"],
  calendar_event: ["id"],
  todo_recurrence: ["id"],
  todo_recurrence_completion: ["id"],
  todo_calendar_mapping: ["id"],
  todo_note_link: ["id"],
  doc_task_calendar_link: ["calendar_event_id"],
  todo_schedule_occurrence: ["calendar_event_id"],
  todo_group: ["id"],
  calendar: ["id"],
  todo_recurrence_history: ["series_id"],
  todo_occurrence_override: ["todo_item_id", "todo_created_at", "series_id", "occurrence_date"],
};
export type Snapshot = Record<string, Row[]>;
const dependencies = new Set(["todo_group", "calendar"]);
function withDependencies(db: Database.Database, snapshot: Snapshot): Snapshot {
  for (const [table, rows, field] of [
    ["todo_group", snapshot.todo_item ?? [], "group_id"],
    ["calendar", snapshot.calendar_event ?? [], "calendar_id"],
  ] as const) {
    const ids = [...new Set(rows.map(row => row[field]))];
    snapshot[table] = ids.length
      ? (db
          .prepare(
            `SELECT id,create_time FROM ${table} WHERE id IN (${ids.map(() => "?").join(",")})`
          )
          .all(...ids) as Row[])
      : [];
  }
  return snapshot;
}
export function captureTodos(db: Database.Database, ids: number[]): Snapshot {
  if (!ids.length) return {};
  const marks = ids.map(() => "?").join(",");
  const result: Snapshot = {};
  const take = (table: string, where: string) => {
    result[table] = db.prepare(`SELECT * FROM ${table} WHERE ${where}`).all(...ids) as Row[];
  };
  take("todo_item", `id IN (${marks})`);
  take("todo_recurrence", `todo_item_id IN (${marks})`);
  take(
    "todo_recurrence_completion",
    `recurrence_id IN (SELECT id FROM todo_recurrence WHERE todo_item_id IN (${marks}))`
  );
  take("todo_calendar_mapping", `todo_item_id IN (${marks})`);
  take("todo_note_link", `todo_id IN (${marks})`);
  take("todo_recurrence_history", `todo_item_id IN (${marks})`);
  take("todo_occurrence_override", `todo_item_id IN (${marks})`);
  result.calendar_event = db
    .prepare(
      `SELECT * FROM calendar_event WHERE todo_item_id IN (${marks})
    OR id IN (SELECT calendar_event_id FROM todo_calendar_mapping WHERE todo_item_id IN (${marks}))`
    )
    .all(...ids, ...ids) as Row[];
  const events = (result.calendar_event ?? []).map(row => row.id);
  result.todo_schedule_occurrence = events.length
    ? (db
        .prepare(
          `SELECT * FROM todo_schedule_occurrence WHERE calendar_event_id IN (${events.map(() => "?").join(",")})`
        )
        .all(...events) as Row[])
    : [];
  return withDependencies(db, result);
}
export function captureEvents(db: Database.Database, ids: number[]): Snapshot {
  if (!ids.length) return {};
  const marks = ids.map(() => "?").join(",");
  return withDependencies(
    db,
    Object.fromEntries(
      ["calendar_event", "doc_task_calendar_link", "todo_schedule_occurrence"].map(table => [
        table,
        db
          .prepare(
            `SELECT * FROM ${table} WHERE ${table === "calendar_event" ? "id" : "calendar_event_id"} IN (${marks})`
          )
          .all(...ids) as Row[],
      ])
    )
  );
}
export function mergeSnapshots(...snapshots: Snapshot[]): Snapshot {
  const result: Snapshot = {};
  for (const snapshot of snapshots)
    for (const [table, rows] of Object.entries(snapshot)) {
      const byKey = new Map((result[table] ?? []).map(row => [rowKey(table, row), row]));
      for (const row of rows) byKey.set(rowKey(table, row), row);
      result[table] = [...byKey.values()];
    }
  return result;
}
const rowKey = (table: string, row: Row) => canonical(KEYS[table].map(key => row[key]));
export function snapshotEffects(before: Snapshot, after: Snapshot) {
  const effects: Record<string, { created: number; updated: number; deleted: number }> = {};
  for (const table of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (dependencies.has(table)) continue;
    const previous = new Map((before[table] ?? []).map(row => [rowKey(table, row), row]));
    const current = new Map((after[table] ?? []).map(row => [rowKey(table, row), row]));
    const counts = { created: 0, updated: 0, deleted: 0 };
    for (const key of new Set([...previous.keys(), ...current.keys()])) {
      if (!previous.has(key)) counts.created++;
      else if (!current.has(key)) counts.deleted++;
      else if (canonical(previous.get(key)) !== canonical(current.get(key))) counts.updated++;
    }
    if (counts.created + counts.updated + counts.deleted) effects[table] = counts;
  }
  return effects;
}
export function captureKnown(db: Database.Database, snapshot: Snapshot): Snapshot {
  return Object.fromEntries(
    Object.entries(snapshot).map(([table, rows]) => {
      if (!KEYS[table]) fail("INVALID_SNAPSHOT", "撤销快照包含未知表");
      const statement = db.prepare(
        `SELECT ${dependencies.has(table) ? "id,create_time" : "*"} FROM ${table} WHERE ${KEYS[table].map(key => `${key}=?`).join(" AND ")}`
      );
      return [
        table,
        rows.flatMap(row => {
          const current = statement.get(...KEYS[table].map(key => row[key])) as Row | undefined;
          return current ? [current] : [];
        }),
      ];
    })
  );
}

function references(snapshot: Snapshot): Map<number, number> {
  const result = new Map<number, number>();
  for (const [table, field] of [
    ["todo_item", "description_content_id"],
    ["todo_note_link", "content_id"],
    ["calendar_event", "detail_content_id"],
  ]) {
    for (const row of snapshot[table] ?? []) {
      // 系统日历标记借用待办描述，未持有额外引用。
      if (
        table === "calendar_event" &&
        (snapshot.todo_calendar_mapping ?? []).some(link => link.calendar_event_id === row.id)
      )
        continue;
      const id = Number(row[field]);
      if (id > 0) result.set(id, (result.get(id) ?? 0) + 1);
    }
  }
  return result;
}
export function pinSnapshot(db: Database.Database, operationId: string, snapshot: Snapshot) {
  for (const id of references(snapshot).keys()) {
    const row = db.prepare("SELECT create_time FROM contents WHERE id=?").get(id) as
      { create_time: number } | undefined;
    if (!row) fail("NOT_FOUND", "关联正文不存在");
    const inserted = db
      .prepare("INSERT OR IGNORE INTO task_assistant_content_pin VALUES (?,?,?)")
      .run(operationId, id, row!.create_time).changes;
    if (inserted) ContentTable.incrementRefCount(db, id);
  }
}
export function releasePins(db: Database.Database, operationId: string) {
  const pins = db
    .prepare("SELECT * FROM task_assistant_content_pin WHERE operation_id=?")
    .all(operationId) as Array<{ content_id: number; content_created_at: number }>;
  for (const pin of pins) {
    const row = db
      .prepare("SELECT create_time,ref_count FROM contents WHERE id=?")
      .get(pin.content_id) as { create_time: number; ref_count: number } | undefined;
    if (row?.create_time === pin.content_created_at) {
      if (row.ref_count > 1) ContentTable.decrementRefCount(db, pin.content_id);
      else ContentTable.deleteContent(db, pin.content_id);
    }
  }
  db.prepare("DELETE FROM task_assistant_content_pin WHERE operation_id=?").run(operationId);
}

export function restoreSnapshot(
  db: Database.Database,
  before: Snapshot,
  after: Snapshot,
  validateOnly = false
) {
  for (const table of dependencies)
    for (const identity of before[table] ?? []) {
      const current = db.prepare(`SELECT create_time FROM ${table} WHERE id=?`).get(identity.id) as
        { create_time: number } | undefined;
      if (!current || current.create_time !== identity.create_time)
        fail("UNDO_CONFLICT", "原项目或日历已删除或被重新创建，不能自动撤销");
    }
  const changes: Array<{ table: string; before?: Row; after?: Row }> = [];
  for (const table of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (dependencies.has(table)) continue;
    if (!KEYS[table]) fail("INVALID_SNAPSHOT", "撤销快照包含未知表");
    const oldRows = new Map((before[table] ?? []).map(row => [rowKey(table, row), row]));
    const newRows = new Map((after[table] ?? []).map(row => [rowKey(table, row), row]));
    for (const key of new Set([...oldRows.keys(), ...newRows.keys()])) {
      const previous = oldRows.get(key),
        expected = newRows.get(key);
      if (canonical(previous) === canonical(expected)) continue;
      const identity = expected ?? previous!;
      const current = db
        .prepare(
          `SELECT * FROM ${table} WHERE ${KEYS[table].map(field => `${field}=?`).join(" AND ")}`
        )
        .get(...KEYS[table].map(field => identity[field])) as Row | undefined;
      if (canonical(current) !== canonical(expected))
        fail("UNDO_CONFLICT", "操作对象已有后续修改，不能自动撤销");
      changes.push({ table, before: previous, after: expected });
    }
  }
  for (const { table, before: previous, after: next } of changes) {
    if (
      table === "calendar_event" &&
      previous &&
      !db.prepare("SELECT 1 FROM calendar WHERE id=?").get(previous.calendar_id)
    )
      fail("UNDO_CONFLICT", "原日历已删除，无法恢复日程");
    if (table === "todo_item" && previous) {
      const restoredIds = new Set((before.todo_item ?? []).map(row => row.id));
      if (!db.prepare("SELECT 1 FROM todo_group WHERE id=?").get(previous.group_id))
        fail("UNDO_CONFLICT", "原项目已删除，无法撤销");
      if (
        previous.parent_id != null &&
        !restoredIds.has(previous.parent_id) &&
        !db.prepare("SELECT 1 FROM todo_item WHERE id=?").get(previous.parent_id)
      )
        fail("UNDO_CONFLICT", "原父待办已删除，无法撤销");
    }
    if (table === "todo_item" && !previous && next) {
      const expectedChildren = new Set((after.todo_item ?? []).map(row => row.id));
      const children = db.prepare("SELECT id FROM todo_item WHERE parent_id=?").all(next.id) as {
        id: number;
      }[];
      if (children.some(child => !expectedChildren.has(child.id)))
        fail("UNDO_CONFLICT", "待办新增了子项，不能撤销创建");
      const expectedEvents = new Set((after.calendar_event ?? []).map(row => row.id));
      const events = db
        .prepare("SELECT id FROM calendar_event WHERE todo_item_id=?")
        .all(next.id) as { id: number }[];
      if (events.some(event => !expectedEvents.has(event.id)))
        fail("UNDO_CONFLICT", "待办新增了安排，不能撤销创建");
    }
  }
  if (validateOnly) return;
  for (const { table, before: previous, after: next } of changes) {
    if (!previous) {
      const identity = next!;
      db.prepare(
        `DELETE FROM ${table} WHERE ${KEYS[table].map(key => `${key}=?`).join(" AND ")}`
      ).run(...KEYS[table].map(key => identity[key]));
    } else {
      const fields = Object.keys(previous);
      db.prepare(
        `INSERT INTO ${table} (${fields.join(",")}) VALUES (${fields.map(() => "?").join(",")})
        ON CONFLICT (${KEYS[table].join(",")}) DO UPDATE SET ${fields
          .filter(field => !KEYS[table].includes(field))
          .map(field => `${field}=excluded.${field}`)
          .join(",")}`
      ).run(...fields.map(field => previous[field]));
    }
  }
  const oldRefs = references(before),
    newRefs = references(after);
  for (const id of new Set([...oldRefs.keys(), ...newRefs.keys()])) {
    const difference = (oldRefs.get(id) ?? 0) - (newRefs.get(id) ?? 0);
    for (let count = 0; count < Math.abs(difference); count++) {
      if (difference > 0) ContentTable.incrementRefCount(db, id);
      else ContentTable.deleteContent(db, id);
    }
  }
}
