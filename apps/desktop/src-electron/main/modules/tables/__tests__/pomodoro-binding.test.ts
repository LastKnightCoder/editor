import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MAIN_SCHEMA_SQL from "../../../../../../../packages/db-schema/schema/main.sql?raw";

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
  Notification: class {
    show = vi.fn();
  },
}));
// 与 todo-calendar-consistency 同款：切断 tables → database 模块的循环依赖链
vi.mock("../../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));

import PomodoroSessionTable, { pomodoroEventTitle } from "../pomodoro-session";

const NOW = Date.now();
const START = new Date(2026, 9, 5, 9, 0).getTime();
const MIN = 60_000;

function seed(db: Database.Database) {
  db.prepare(
    `INSERT INTO calendar_group (id, name, is_system, order_index, create_time, update_time, parent_group_id)
     VALUES (1, '系统', 1, 0, ?, ?, NULL), (2, '待办清单', 1, 0, ?, ?, 1)`
  ).run(NOW, NOW, NOW, NOW);
  const calendar = db.prepare(
    `INSERT INTO calendar (id, create_time, update_time, title, color, description_content_id, archived, pinned, visible, order_index, group_id)
     VALUES (?, ?, ?, ?, 'red', 0, 0, 0, 1, 0, ?)`
  );
  calendar.run(10, NOW, NOW, "番茄钟", 1);
  calendar.run(11, NOW, NOW, "计划任务", 2);
  calendar.run(20, NOW, NOW, "工作", null);
  db.prepare(
    `INSERT INTO pomodoro_presets (id, name, mode, duration_min, sort_order, archived, create_time, update_time)
     VALUES (1, '深度工作', 'countdown', 50, 0, 0, ?, ?)`
  ).run(NOW, NOW);
  db.prepare(
    `INSERT INTO todo_item (id, group_id, title, type, is_completed, create_time, update_time)
     VALUES (7, 1, '写季度报告', 'planned', 0, ?, ?)`
  ).run(NOW, NOW);
  const event = db.prepare(
    `INSERT INTO calendar_event (id, create_time, update_time, calendar_id, title, detail_content_id, start_date, end_date, start_time, end_time, color, all_day)
     VALUES (?, ?, ?, ?, ?, 0, ?, NULL, 540, 660, NULL, 0)`
  );
  event.run(100, NOW, NOW, 20, "产品评审会", START);
  event.run(101, NOW, NOW, 11, "写季度报告", START);
  event.run(102, NOW, NOW, 10, "🍅 深度工作", START);
  db.prepare(
    `INSERT INTO todo_calendar_mapping (todo_item_id, calendar_event_id, sync_type, recurrence_date, create_time)
     VALUES (7, 101, 'planned', NULL, ?)`
  ).run(NOW);
}

function insertSession(
  db: Database.Database,
  binding: Partial<Parameters<typeof PomodoroSessionTable.insertCompletedSession>[1]> = {}
) {
  return PomodoroSessionTable.insertCompletedSession(db, {
    presetId: 1,
    startTime: START,
    endTime: START + 50 * MIN,
    focusMs: 50 * MIN,
    pauseTotalMs: 0,
    pauseCount: 0,
    pauses: [],
    status: "completed",
    ...binding,
  });
}

const eventTitles = (db: Database.Database, sessionId: number) =>
  (
    db
      .prepare(
        `SELECT e.title FROM calendar_event e JOIN pomodoro_calendar_mapping m ON m.calendar_event_id = e.id
         WHERE m.pomodoro_session_id = ?`
      )
      .all(sessionId) as { title: string }[]
  ).map(r => r.title);

describe("番茄绑定", () => {
  let db: Database.Database;
  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(MAIN_SCHEMA_SQL);
    seed(db);
  });
  afterEach(() => db.close());

  describe("resolveBinding", () => {
    it("用户事件：只填事件与标题", () => {
      expect(PomodoroSessionTable.resolveBinding(db, { kind: "event", eventId: 100 })).toEqual({
        boundEventId: 100,
        boundTodoId: undefined,
        boundTitle: "产品评审会",
      });
    });
    it("待办来源事件：反查待办", () => {
      expect(PomodoroSessionTable.resolveBinding(db, { kind: "event", eventId: 101 })).toEqual({
        boundEventId: 101,
        boundTodoId: 7,
        boundTitle: "写季度报告",
      });
    });
    it("待办：只填待办与标题", () => {
      expect(PomodoroSessionTable.resolveBinding(db, { kind: "todo", todoId: 7 })).toEqual({
        boundTodoId: 7,
        boundTitle: "写季度报告",
      });
    });
    it("空绑定返回空；番茄事件与不存在的对象报错", () => {
      expect(PomodoroSessionTable.resolveBinding(db, null)).toEqual({});
      expect(() =>
        PomodoroSessionTable.resolveBinding(db, { kind: "event", eventId: 102 })
      ).toThrow("pomodoro");
      expect(() =>
        PomodoroSessionTable.resolveBinding(db, { kind: "event", eventId: 999 })
      ).toThrow();
      expect(() =>
        PomodoroSessionTable.resolveBinding(db, { kind: "todo", todoId: 999 })
      ).toThrow();
    });
  });

  describe("refreshBinding", () => {
    it("对象改名取新名，待办优先于事件", () => {
      db.prepare("UPDATE todo_item SET title = '写 Q4 报告' WHERE id = 7").run();
      expect(
        PomodoroSessionTable.refreshBinding(db, {
          boundEventId: 101,
          boundTodoId: 7,
          boundTitle: "写季度报告",
        }).boundTitle
      ).toBe("写 Q4 报告");
    });
    it("对象都已删除时保留快照", () => {
      expect(
        PomodoroSessionTable.refreshBinding(db, {
          boundEventId: 999,
          boundTodoId: 998,
          boundTitle: "旧标题",
        }).boundTitle
      ).toBe("旧标题");
    });
  });

  describe("日历标题", () => {
    it("有绑定用绑定标题，否则用预设名", () => {
      expect(pomodoroEventTitle("写季度报告", "深度工作")).toBe("🍅 写季度报告");
      expect(pomodoroEventTitle(undefined, "深度工作")).toBe("🍅 深度工作");
    });
    it("结束写入与修改时长重建使用同一标题规则", () => {
      const bound = insertSession(db, { boundTodoId: 7, boundTitle: "写季度报告" });
      PomodoroSessionTable.writeCalendarEvents(db, bound.id);
      expect(eventTitles(db, bound.id)).toEqual(["🍅 写季度报告"]);
      PomodoroSessionTable.updateSession(db, { sessionId: bound.id, focusMs: 30 * MIN });
      expect(eventTitles(db, bound.id)).toEqual(["🍅 写季度报告"]);

      const plain = insertSession(db);
      PomodoroSessionTable.updateSession(db, { sessionId: plain.id, focusMs: 30 * MIN });
      expect(eventTitles(db, plain.id)).toEqual(["🍅 深度工作"]);
    });
  });

  it("按待办汇总只算绑定该待办的已结束会话", () => {
    insertSession(db, { boundEventId: 101, boundTodoId: 7, boundTitle: "写季度报告" });
    insertSession(db, { boundTodoId: 7, boundTitle: "写季度报告", focusMs: 25 * MIN });
    insertSession(db);
    expect(PomodoroSessionTable.summaryByTodo(db, 7)).toEqual({ count: 2, focusMs: 75 * MIN });
    expect(PomodoroSessionTable.summaryByTodo(db, 8)).toEqual({ count: 0, focusMs: 0 });
  });

  it("番茄事件 → 会话绑定", () => {
    const bound = insertSession(db, { boundEventId: 100, boundTitle: "产品评审会" });
    const [eventId] = PomodoroSessionTable.writeCalendarEvents(db, bound.id);
    const plain = insertSession(db);
    const [plainEventId] = PomodoroSessionTable.writeCalendarEvents(db, plain.id);
    expect(
      PomodoroSessionTable.getEventBindings(db, { calendarEventIds: [eventId, plainEventId, 999] })
    ).toEqual({
      [eventId]: { sessionId: bound.id, boundEventId: 100, boundTodoId: null },
      [plainEventId]: { sessionId: plain.id, boundEventId: null, boundTodoId: null },
    });
    expect(PomodoroSessionTable.getEventBindings(db, { calendarEventIds: [] })).toEqual({});
  });

  it("旧库升级补齐三列，重复执行幂等", () => {
    const old = new Database(":memory:");
    old.exec(`CREATE TABLE pomodoro_sessions (
      id INTEGER PRIMARY KEY, preset_id INTEGER NOT NULL, start_time INTEGER NOT NULL, end_time INTEGER,
      expected_ms INTEGER, focus_ms INTEGER NOT NULL DEFAULT 0, pause_total_ms INTEGER NOT NULL DEFAULT 0,
      pause_count INTEGER NOT NULL DEFAULT 0, pauses TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL,
      create_time INTEGER NOT NULL, update_time INTEGER NOT NULL)`);
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    PomodoroSessionTable.upgradeTable(old);
    PomodoroSessionTable.upgradeTable(old);
    errors.mockRestore();
    const columns = (old.pragma("table_info(pomodoro_sessions)") as { name: string }[]).map(
      c => c.name
    );
    expect(columns.slice(-3)).toEqual(["bound_event_id", "bound_todo_id", "bound_title"]);
    old.close();
  });
});
