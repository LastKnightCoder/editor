import Database from "better-sqlite3";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import schema from "../../../../../../../packages/db-schema/schema/main.sql?raw";
import { executeDatabaseCommand } from "../../database-command";
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
