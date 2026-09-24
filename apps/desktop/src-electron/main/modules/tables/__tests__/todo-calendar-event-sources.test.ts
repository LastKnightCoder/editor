import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import MAIN_SCHEMA_SQL from "../../../../../../../packages/db-schema/schema/main.sql?raw";
import TodoCalendarMappingTable from "../todo-calendar-mapping";

const DAY = 86_400_000;
const D1 = new Date(2026, 8, 24).getTime();
const D2 = D1 + DAY;

describe("TodoCalendarMappingTable.getEventSources", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(MAIN_SCHEMA_SQL);
    const now = Date.now();
    const item = db.prepare(
      `INSERT INTO todo_item (id, group_id, title, type, is_completed, create_time, update_time)
       VALUES (?, 1, ?, ?, ?, ?, ?)`
    );
    item.run(1, "截止任务", "deadline", 1, now, now);
    item.run(2, "计划任务", "planned", 0, now, now);
    item.run(3, "每日复盘", "recurring", 0, now, now);
    db.prepare(
      `INSERT INTO todo_recurrence (id, todo_item_id, type, start_date, create_time, update_time)
       VALUES (7, 3, 'daily', ?, ?, ?)`
    ).run(D1, now, now);
    // D1 完成、D2 跳过
    const completion = db.prepare(
      `INSERT INTO todo_recurrence_completion (recurrence_id, scheduled_date, completed_at, skipped, create_time)
       VALUES (7, ?, ?, ?, ?)`
    );
    completion.run(D1, now, 0, now);
    completion.run(D2, null, 1, now);
    const mapping = db.prepare(
      `INSERT INTO todo_calendar_mapping (todo_item_id, calendar_event_id, sync_type, recurrence_date, create_time)
       VALUES (?, ?, ?, ?, ?)`
    );
    mapping.run(1, 101, "deadline", null, now);
    mapping.run(2, 102, "planned", null, now);
    mapping.run(3, 103, "recurring", D1, now);
    mapping.run(3, 104, "recurring", D2, now);
  });

  afterEach(() => db.close());

  it("按日程批量返回来源与完成状态", () => {
    const sources = TodoCalendarMappingTable.getEventSources(db, {
      calendarEventIds: [101, 102, 103, 104, 999],
    });

    expect(Object.keys(sources).map(Number).sort()).toEqual([101, 102, 103, 104]);
    expect(sources[101]).toMatchObject({
      todoItemId: 1,
      syncType: "deadline",
      isCompleted: true,
      recurrenceId: null,
    });
    expect(sources[102]).toMatchObject({ todoItemId: 2, isCompleted: false });
    // 周期任务看该次完成记录；跳过不算完成
    expect(sources[103]).toMatchObject({ recurrenceId: 7, recurrenceDate: D1, isCompleted: true });
    expect(sources[104]).toMatchObject({ recurrenceId: 7, recurrenceDate: D2, isCompleted: false });
  });

  it("空列表直接返回空对象", () => {
    expect(TodoCalendarMappingTable.getEventSources(db, { calendarEventIds: [] })).toEqual({});
  });
});
