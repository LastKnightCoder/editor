/**
 * 「计划任务」退役：planned 待办转为普通待办 + 用户日历里的关联事件，系统「计划任务」日历与待办系统分组删除。
 */
import Database from "better-sqlite3";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import schema from "@tau/db-schema/schema/main.sql?raw";
import { retirePlannedTodos } from "@tau/db-schema/src/planned-retirement";

const NOW = 1_000;
const DAY = new Date(2026, 9, 5).getTime();
const at = (h: number, m = 0, day = DAY) => day + (h * 60 + m) * 60_000;

function seed(db: Database.Database) {
  db.exec(`
    INSERT INTO calendar_group (id, name, is_system, order_index, create_time, update_time, parent_group_id)
      VALUES (1, '系统', 1, 0, 0, 0, NULL), (2, '待办清单', 0, -1, 0, 0, 1), (3, '工作组', 0, 0, 0, 0, NULL);
    INSERT INTO calendar (id, create_time, update_time, title, color, description_content_id, archived, pinned, visible, order_index, group_id) VALUES
      (10, 0, 0, '番茄钟', 'red', 0, 0, 0, 1, 0, 1),
      (11, 0, 0, '截止任务', 'red', 0, 0, 0, 1, 0, 2),
      (12, 0, 0, '计划任务', 'blue', 0, 0, 0, 1, 1, 2),
      (20, 0, 0, '归档的', 'green', 0, 1, 0, 1, 0, NULL),
      (21, 0, 0, '工作', 'blue', 0, 0, 0, 1, 1, 3);
    INSERT INTO todo_group (id, title, is_system, system_type, sort_index, is_archived, create_time, update_time) VALUES
      (1, '普通任务', 1, 'normal', 0, 0, 0, 0), (2, '计划任务', 1, 'planned', 0, 0, 0, 0), (5, '我的', 0, NULL, 0, 0, 0, 0);
  `);
  const item = db.prepare(
    `INSERT INTO todo_item (id, group_id, title, type, description_content_id, is_completed, start_at, due_at, remind_before, sort_index, is_archived, create_time, update_time)
     VALUES (?, 5, ?, ?, ?, 0, ?, ?, ?, 0, 0, 0, 0)`
  );
  item.run(1, "写季度报告", "planned", 77, at(9), at(11), 15);
  item.run(2, "被移动端删了事件", "planned", 0, at(14), at(15), null);
  item.run(3, "没有时间", "planned", 0, null, null, null);
  item.run(4, "截止任务", "deadline", 0, null, at(18), 30);
  const event = db.prepare(
    `INSERT INTO calendar_event (id, create_time, update_time, calendar_id, title, detail_content_id, start_date, end_date, start_time, end_time, color, all_day)
     VALUES (?, 0, 0, ?, ?, ?, ?, NULL, ?, ?, NULL, 0)`
  );
  event.run(100, 12, "旧标题", 77, DAY, 540, 660);
  event.run(101, 12, "孤儿", 0, DAY, 600, 660);
  event.run(102, 11, "截止任务", 0, DAY, 1080, null);
  const mapping = db.prepare(
    `INSERT INTO todo_calendar_mapping (todo_item_id, calendar_event_id, sync_type, recurrence_date, create_time) VALUES (?, ?, ?, NULL, 0)`
  );
  mapping.run(1, 100, "planned");
  mapping.run(4, 102, "deadline");
}

describe("计划任务退役", () => {
  let db: Database.Database;
  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(schema);
    seed(db);
  });
  afterEach(() => db.close());

  it("有物化事件：原行移入首个可用用户日历、保留 id、清零备注、关联待办", () => {
    expect(retirePlannedTodos(db, ":memory:", NOW)).toBe(3);
    expect(db.prepare("SELECT * FROM calendar_event WHERE id = 100").get()).toMatchObject({
      calendar_id: 21,
      todo_item_id: 1,
      detail_content_id: 0,
      title: "写季度报告",
      start_time: 540,
      end_time: 660,
    });
  });

  it("无物化事件按起止新建；无时间不建；待办改普通并清空起止与提醒", () => {
    retirePlannedTodos(db, ":memory:", NOW);
    expect(db.prepare("SELECT * FROM calendar_event WHERE todo_item_id = 2").all()).toEqual([
      expect.objectContaining({
        calendar_id: 21,
        title: "被移动端删了事件",
        start_date: DAY,
        start_time: 840,
        end_time: 900,
        all_day: 0,
      }),
    ]);
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM calendar_event WHERE todo_item_id = 3").get()
    ).toEqual({ n: 0 });
    expect(
      db
        .prepare(
          "SELECT id, type, start_at, due_at, remind_before, description_content_id FROM todo_item ORDER BY id"
        )
        .all()
    ).toEqual([
      {
        id: 1,
        type: "normal",
        start_at: null,
        due_at: null,
        remind_before: null,
        description_content_id: 77,
      },
      {
        id: 2,
        type: "normal",
        start_at: null,
        due_at: null,
        remind_before: null,
        description_content_id: 0,
      },
      {
        id: 3,
        type: "normal",
        start_at: null,
        due_at: null,
        remind_before: null,
        description_content_id: 0,
      },
      {
        id: 4,
        type: "deadline",
        start_at: null,
        due_at: at(18),
        remind_before: 30,
        description_content_id: 0,
      },
    ]);
  });

  it("删除计划任务日历（含孤儿事件）、映射与待办系统分组；截止任务不受影响", () => {
    retirePlannedTodos(db, ":memory:", NOW);
    expect(db.prepare("SELECT id FROM calendar ORDER BY id").all()).toEqual([
      { id: 10 },
      { id: 11 },
      { id: 20 },
      { id: 21 },
    ]);
    expect(db.prepare("SELECT id FROM calendar_event WHERE id IN (101, 102)").all()).toEqual([
      { id: 102 },
    ]);
    expect(db.prepare("SELECT sync_type FROM todo_calendar_mapping").all()).toEqual([
      { sync_type: "deadline" },
    ]);
    expect(db.prepare("SELECT id FROM todo_group ORDER BY id").all()).toEqual([
      { id: 1 },
      { id: 5 },
    ]);
    expect(
      db.prepare("SELECT value FROM migration_meta WHERE key = 'planned-retirement:v1'").get()
    ).toEqual({
      value: "3",
    });
  });

  it("没有可用用户日历时新建「日程」", () => {
    db.exec("DELETE FROM calendar WHERE id = 21");
    retirePlannedTodos(db, ":memory:", NOW);
    const created = db.prepare("SELECT id, group_id FROM calendar WHERE title = '日程'").get() as {
      id: number;
      group_id: number | null;
    };
    expect(created.group_id).toBeNull();
    expect(db.prepare("SELECT calendar_id FROM calendar_event WHERE id = 100").get()).toEqual({
      calendar_id: created.id,
    });
  });

  it("幂等：再跑不动库；旧客户端写回 planned 后再次转换并累计记账", () => {
    retirePlannedTodos(db, ":memory:", NOW);
    expect(retirePlannedTodos(db, ":memory:", NOW)).toBe(0);
    db.exec(`INSERT INTO todo_item (id, group_id, title, type, is_completed, start_at, due_at, sort_index, is_archived, create_time, update_time)
             VALUES (9, 5, '旧版写回', 'planned', 0, ${at(8)}, ${at(9)}, 0, 0, 0, 0)`);
    expect(retirePlannedTodos(db, ":memory:", NOW)).toBe(1);
    expect(
      db.prepare("SELECT value FROM migration_meta WHERE key = 'planned-retirement:v1'").get()
    ).toEqual({
      value: "4",
    });
  });

  it("新库跳过；老库缺列先补列", () => {
    const fresh = new Database(":memory:");
    expect(retirePlannedTodos(fresh, ":memory:", NOW)).toBe(0);
    fresh.close();

    const old = new Database(":memory:");
    old.exec(`CREATE TABLE calendar_event (id INTEGER PRIMARY KEY, create_time INTEGER NOT NULL, update_time INTEGER NOT NULL,
      calendar_id INTEGER NOT NULL, title TEXT NOT NULL, detail_content_id INTEGER DEFAULT 0, start_date INTEGER NOT NULL,
      end_date INTEGER, start_time INTEGER, end_time INTEGER, color TEXT, all_day INTEGER DEFAULT 0)`);
    expect(retirePlannedTodos(old, ":memory:", NOW)).toBe(0);
    const columns = (
      old.prepare("PRAGMA table_info(calendar_event)").all() as Array<{ name: string }>
    ).map(c => c.name);
    expect(columns.at(-1)).toBe("todo_item_id");
    old.exec(schema);
    old.close();
  });

  it("失败回滚并抛 PLANNED_RETIREMENT_FAILED；落盘库转换前备份", () => {
    db.exec(
      `CREATE TRIGGER boom BEFORE UPDATE ON todo_item BEGIN SELECT RAISE(ABORT, 'boom'); END;`
    );
    expect(() => retirePlannedTodos(db, ":memory:", NOW)).toThrow(
      /^PLANNED_RETIREMENT_FAILED: .*boom/
    );
    expect(
      db.prepare("SELECT calendar_id, todo_item_id FROM calendar_event WHERE id = 100").get()
    ).toEqual({
      calendar_id: 12,
      todo_item_id: null,
    });

    const dir = mkdtempSync(join(tmpdir(), "tau-planned-retire-"));
    const disk = new Database(join(dir, "data.db"));
    try {
      disk.exec(schema);
      seed(disk);
      retirePlannedTodos(disk, join(dir, "data.db"), NOW);
      expect(readdirSync(dir).filter(f => f.includes(".pre-planned-retirement-v1-"))).toHaveLength(
        1
      );
      retirePlannedTodos(disk, join(dir, "data.db"), NOW);
      expect(readdirSync(dir).filter(f => f.includes(".pre-planned-retirement-v1-"))).toHaveLength(
        1
      );
    } finally {
      disk.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
