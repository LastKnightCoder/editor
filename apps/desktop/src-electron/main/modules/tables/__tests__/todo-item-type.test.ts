import Database from "better-sqlite3";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import schema from "../../../../../../../packages/db-schema/schema/main.sql?raw";
import { executeDatabaseCommand } from "../../database-command";
import { ensureMainSchema } from "../../main-schema";
import { must } from "../../../test-support";
import TodoItemTable from "../todo-item";
import TodoRecurrenceTable from "../todo-recurrence";
import TodoRecurrenceCompletionTable from "../todo-recurrence-completion";
import type { TodoItemType } from "@/types";

vi.mock("electron");
vi.mock("../../video-note-index-queue");

let db: Database.Database;
let id: number;
beforeEach(() => {
  db = new Database(":memory:");
  db.exec(schema);
  id = TodoItemTable.createItem(db, { groupId: 1, title: "每周复盘" }).id;
});
afterEach(() => db.close());

function changeType(type: TodoItemType) {
  const handler = TodoItemTable.getListenEvents()["todo:update-item-type"];
  return executeDatabaseCommand(db, handler, db, { id, type });
}

it("首次切入周期建立每日规则，经截止再切回保留每周规则和打卡", () => {
  changeType("recurring");
  const rule = must(TodoRecurrenceTable.getRecurrenceByItemId(db, { todoItemId: id }));
  expect(rule.type).toBe("daily");
  const wednesday = new Date(2026, 0, 7).getTime();
  TodoRecurrenceTable.updateRecurrence(db, {
    id: rule.id,
    type: "weekly",
    weekdays: [3],
    startDate: wednesday,
  });
  const occurrence = { recurrenceId: rule.id, scheduledDate: wednesday };
  const mark = TodoRecurrenceCompletionTable.completeRecurrence(db, occurrence);

  expect(changeType("deadline").dueAt).toEqual(expect.any(Number));
  expect(changeType("recurring").type).toBe("recurring");
  expect(TodoRecurrenceTable.getRecurrenceByItemId(db, { todoItemId: id })).toMatchObject({
    id: rule.id,
    type: "weekly",
    weekdays: [3],
    startDate: wednesday,
  });
  expect(TodoRecurrenceCompletionTable.getCompletion(db, occurrence)).toEqual(mark);
});

it("创建规则失败时保留原截止任务和日历标记", () => {
  const deadline = changeType("deadline");
  const mappings = () =>
    db
      .prepare("SELECT calendar_event_id FROM todo_calendar_mapping WHERE todo_item_id = ?")
      .all(id);
  const original = mappings();
  expect(original).toHaveLength(1);
  db.exec(
    "CREATE TEMP TRIGGER reject_rule BEFORE INSERT ON todo_recurrence BEGIN SELECT RAISE(ABORT, '规则写入失败'); END"
  );

  expect(() => changeType("recurring")).toThrow("规则写入失败");
  expect(TodoItemTable.listItemsByType(db, { type: "deadline" })).toContainEqual(deadline);
  expect(mappings()).toEqual(original);
});

it("优先级与标签支持读写、批量改名合并、移除并触发数据变更日志", () => {
  const created = TodoItemTable.createItem(db, {
    groupId: 1,
    title: "评审设计稿",
    priority: "high",
    tags: ["设计", "评审", "设计"],
  });
  expect(created.priority).toBe("high");
  expect(created.tags).toEqual(["设计", "评审"]);

  const beforeSeq = (
    db.prepare("SELECT COALESCE(MAX(seq), 0) AS s FROM data_change_log").get() as { s: number }
  ).s;
  const updated = TodoItemTable.updateItem(db, {
    id: created.id,
    priority: "medium",
    tags: ["设计", "前端"],
  });
  expect(updated.priority).toBe("medium");
  expect(updated.tags).toEqual(["设计", "前端"]);
  const logged = db
    .prepare("SELECT domain, action FROM data_change_log WHERE seq > ?")
    .all(beforeSeq) as Array<{ domain: string; action: string }>;
  expect(logged).toContainEqual({ domain: "todo", action: "updated" });

  // 改名到已有标签时自动合并去重
  expect(TodoItemTable.renameTag(db, { from: "设计", to: "前端" })).toBe(1);
  expect(
    TodoItemTable.listItemsByType(db, { type: "all" }).find(item => item.id === created.id)?.tags
  ).toEqual(["前端"]);

  expect(TodoItemTable.removeTag(db, { tag: "前端" })).toBe(1);
  expect(
    TodoItemTable.listItemsByType(db, { type: "all" }).find(item => item.id === created.id)?.tags
  ).toEqual([]);
});

it("旧库升级补齐 todo_item 的 priority 与 tags 列并保留已有任务", () => {
  const legacy = new Database(":memory:");
  try {
    legacy.exec(
      schema.replace(
        ", priority TEXT NOT NULL DEFAULT 'none' CHECK(priority IN ('none','low','medium','high')), tags TEXT NOT NULL DEFAULT '[]'",
        ""
      )
    );
    legacy
      .prepare("INSERT INTO todo_group(id,title,create_time,update_time) VALUES(1,'工作',100,100)")
      .run();
    legacy
      .prepare(
        "INSERT INTO todo_item(id,group_id,title,create_time,update_time) VALUES(10,1,'旧任务',100,100)"
      )
      .run();
    legacy
      .prepare(
        "INSERT INTO schema_meta(key,value,updated_at) VALUES('main_schema_version','18',100)"
      )
      .run();

    ensureMainSchema(legacy);

    const items = TodoItemTable.listItemsByType(legacy, { type: "all" });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 10,
      title: "旧任务",
      priority: "none",
      tags: [],
    });
  } finally {
    legacy.close();
  }
});
