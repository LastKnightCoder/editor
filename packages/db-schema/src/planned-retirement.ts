import { randomUUID } from "node:crypto";
import type { MigrationDatabase } from "./knowledge-migration";

/**
 * 「计划任务」退役（D-114）：待办的计划时段改由「用户日历里关联待办的事件」表达。
 *
 * - 补 calendar_event.todo_item_id（须在 MAIN_SCHEMA_SQL 之前：其上的索引写在 schema 里）；
 * - 每条 type='planned' 的待办：系统「计划任务」日历里的物化事件原行移入默认用户日历并关联待办
 *   （保留事件 id，番茄绑定不悬空；detail_content_id 清零——原值与待办描述共用同一 content），
 *   没有物化事件则按 start_at / due_at 新建；待办改为 normal、清空起止与提醒；
 * - 删除「计划任务」系统日历（连同残余事件）与待办系统分组「计划任务」。
 *
 * 是否需要转换按实际数据判断：旧版移动端 / CLI 同步回来的 planned 会在下次开库时再转换。
 * 先 VACUUM INTO 备份，单事务完成；失败回滚并抛 PLANNED_RETIREMENT_FAILED，调用方不放行。
 * 桌面开库、同步下载校验、CLI 共用。
 */

const TODO_CALENDAR_GROUP = "待办清单";
const PLANNED_CALENDAR = "计划任务";
const DEFAULT_CALENDAR = "日程";
const META_KEY = "planned-retirement:v1";

interface PlannedTodo {
  id: number;
  title: string;
  start_at: number | null;
  due_at: number | null;
}

const tableExists = (db: MigrationDatabase, name: string) =>
  Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));

const columnExists = (db: MigrationDatabase, table: string, column: string) =>
  db
    .prepare(`PRAGMA table_info("${table}")`)
    .all()
    .some(row => row.name === column);

const dayStart = (ms: number) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const minutesOf = (ms: number) => {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
};

/** 系统根分组与其直接子分组（「待办清单」）——与 CalendarTable.isInSystemGroup 同口径 */
function systemGroupIds(db: MigrationDatabase): Set<number> {
  const rows = db
    .prepare("SELECT id, is_system, parent_group_id FROM calendar_group")
    .all() as Array<{
    id: number;
    is_system: number;
    parent_group_id: number | null;
  }>;
  const roots = new Set(rows.filter(r => r.is_system).map(r => r.id));
  const ids = new Set(roots);
  for (const r of rows)
    if (r.parent_group_id != null && roots.has(r.parent_group_id)) ids.add(r.id);
  return ids;
}

function plannedCalendarIds(db: MigrationDatabase): number[] {
  if (!tableExists(db, "calendar_group") || !tableExists(db, "calendar")) return [];
  return (
    db
      .prepare(
        `SELECT c.id FROM calendar c
         JOIN calendar_group g ON g.id = c.group_id
         JOIN calendar_group root ON root.id = g.parent_group_id
         WHERE c.title = ? AND g.name = ? AND root.is_system = 1`
      )
      .all(PLANNED_CALENDAR, TODO_CALENDAR_GROUP) as Array<{ id: number }>
  ).map(r => r.id);
}

function hasPlannedLeftovers(db: MigrationDatabase): boolean {
  if (
    tableExists(db, "todo_item") &&
    db.prepare("SELECT 1 FROM todo_item WHERE type = 'planned' LIMIT 1").get()
  )
    return true;
  if (
    tableExists(db, "todo_group") &&
    columnExists(db, "todo_group", "system_type") &&
    db
      .prepare("SELECT 1 FROM todo_group WHERE is_system = 1 AND system_type = 'planned' LIMIT 1")
      .get()
  )
    return true;
  return plannedCalendarIds(db).length > 0;
}

/** 默认用户日历：首个非系统分组、未归档的日历（与日程页补记同口径）；没有则新建 */
function defaultCalendarId(db: MigrationDatabase, now: number): number {
  const system = systemGroupIds(db);
  const calendars = db
    .prepare(
      "SELECT id, group_id, archived FROM calendar ORDER BY order_index ASC, create_time DESC"
    )
    .all() as Array<{ id: number; group_id: number | null; archived: number }>;
  const found = calendars.find(c => !c.archived && (c.group_id == null || !system.has(c.group_id)));
  if (found) return found.id;
  db.prepare(
    `INSERT INTO calendar (create_time, update_time, title, color, description_content_id, archived, pinned, visible, order_index, group_id)
     VALUES (?, ?, ?, 'blue', 0, 0, 0, 1, 0, NULL)`
  ).run(now, now, DEFAULT_CALENDAR);
  return Number((db.prepare("SELECT last_insert_rowid() AS id").get() as { id: number }).id);
}

/** 与原 buildEventData 的 planned 分支同口径：0 点视为未指定时刻 */
function eventFromRange(todo: PlannedTodo) {
  const anchor = todo.start_at ?? todo.due_at;
  if (anchor == null) return null;
  const startDate = dayStart(anchor);
  const endDate =
    todo.due_at != null && todo.start_at !== todo.due_at ? dayStart(todo.due_at) : null;
  const startTime =
    todo.start_at != null && minutesOf(todo.start_at) > 0 ? minutesOf(todo.start_at) : null;
  const endTime = todo.due_at != null && minutesOf(todo.due_at) > 0 ? minutesOf(todo.due_at) : null;
  const allDay = startTime == null && endTime == null;
  return { startDate, endDate, startTime, endTime, allDay };
}

function convert(db: MigrationDatabase, now: number): number {
  const plannedCalendars = new Set(plannedCalendarIds(db));
  const todos = (
    tableExists(db, "todo_item")
      ? db.prepare("SELECT id, title, start_at, due_at FROM todo_item WHERE type = 'planned'").all()
      : []
  ) as PlannedTodo[];
  const hasMapping = tableExists(db, "todo_calendar_mapping");
  let target: number | null = null;
  const targetCalendar = () => (target ??= defaultCalendarId(db, now));

  for (const todo of todos) {
    const mapped = hasMapping
      ? (db
          .prepare(
            `SELECT m.calendar_event_id AS id FROM todo_calendar_mapping m
             JOIN calendar_event e ON e.id = m.calendar_event_id
             WHERE m.todo_item_id = ? AND m.sync_type = 'planned'`
          )
          .all(todo.id) as Array<{ id: number }>)
      : [];
    if (mapped.length > 0) {
      for (const { id } of mapped) {
        db.prepare(
          `UPDATE calendar_event SET calendar_id = ?, todo_item_id = ?, detail_content_id = 0, title = ?, update_time = ?
           WHERE id = ?`
        ).run(targetCalendar(), todo.id, todo.title, now, id);
      }
    } else {
      const event = eventFromRange(todo);
      if (event) {
        db.prepare(
          `INSERT INTO calendar_event (create_time, update_time, calendar_id, title, detail_content_id, start_date, end_date, start_time, end_time, color, all_day, todo_item_id)
           VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, NULL, ?, ?)`
        ).run(
          now,
          now,
          targetCalendar(),
          todo.title,
          event.startDate,
          event.endDate,
          event.startTime,
          event.endTime,
          event.allDay ? 1 : 0,
          todo.id
        );
      }
    }
    if (hasMapping) {
      db.prepare(
        "DELETE FROM todo_calendar_mapping WHERE todo_item_id = ? AND sync_type = 'planned'"
      ).run(todo.id);
    }
    db.prepare(
      `UPDATE todo_item SET type = 'normal', start_at = NULL, due_at = NULL, remind_before = NULL, update_time = ?
       WHERE id = ?`
    ).run(now, todo.id);
  }

  // 残余：系统「计划任务」日历里没有归属待办的事件、日历本身、待办系统分组
  for (const calendarId of plannedCalendars) {
    if (hasMapping) {
      db.prepare(
        `DELETE FROM todo_calendar_mapping WHERE calendar_event_id IN (SELECT id FROM calendar_event WHERE calendar_id = ?)`
      ).run(calendarId);
    }
    db.prepare("DELETE FROM calendar_event WHERE calendar_id = ?").run(calendarId);
    db.prepare("DELETE FROM calendar WHERE id = ?").run(calendarId);
  }
  if (tableExists(db, "todo_group") && columnExists(db, "todo_group", "system_type")) {
    db.prepare("DELETE FROM todo_group WHERE is_system = 1 AND system_type = 'planned'").run();
  }
  return todos.length;
}

export function retirePlannedTodos(
  db: MigrationDatabase,
  databasePath: string,
  now = Date.now()
): number {
  if (!tableExists(db, "calendar_event")) return 0;
  if (!columnExists(db, "calendar_event", "todo_item_id")) {
    db.exec("ALTER TABLE calendar_event ADD COLUMN todo_item_id INTEGER");
  }
  if (!hasPlannedLeftovers(db)) return 0;

  try {
    if (databasePath !== ":memory:") {
      db.prepare("VACUUM INTO ?").run(
        `${databasePath}.pre-planned-retirement-v1-${randomUUID()}.bak`
      );
    }
    db.exec("BEGIN IMMEDIATE");
    try {
      const count = convert(db, now);
      if (tableExists(db, "migration_meta")) {
        const previous = db
          .prepare("SELECT value FROM migration_meta WHERE key = ?")
          .get(META_KEY) as { value: string } | undefined;
        const total = (Number(previous?.value) || 0) + count;
        db.prepare("INSERT OR REPLACE INTO migration_meta (key, value) VALUES (?, ?)").run(
          META_KEY,
          String(total)
        );
      }
      db.exec("COMMIT");
      return count;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } catch (error) {
    throw new Error(
      `PLANNED_RETIREMENT_FAILED: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
