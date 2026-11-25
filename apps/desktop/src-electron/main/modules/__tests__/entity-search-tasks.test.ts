import Database from "better-sqlite3";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import MAIN_SCHEMA_SQL from "@tau/db-schema/schema/main.sql?raw";

vi.mock("electron");
vi.mock("../video-note-index-queue");

import EntitySearchTable from "../tables/entity-search";

let db: Database.Database;
beforeEach(() => {
  db = new Database(":memory:");
  db.exec(MAIN_SCHEMA_SQL);
});
afterEach(() => db.close());

it("按标题找到未归档待办，保留已完成条目并排除无关标题", () => {
  db.exec(`
    INSERT INTO todo_group (id, title, create_time, update_time) VALUES (1, '工作', 1, 1);
    INSERT INTO todo_item
      (id, group_id, title, is_completed, is_archived, create_time, update_time) VALUES
      (1, 1, '2026年度复盘', 0, 0, 1, 1),
      (2, 1, '2026年预算', 1, 0, 1, 2),
      (3, 1, '2026年旧任务', 0, 1, 1, 3),
      (4, 1, '每周评审', 0, 0, 1, 4);
  `);
  const results = EntitySearchTable.search(db, { kind: "todo", keyword: "2026年" });
  expect(results.map(result => result.id)).toEqual([2, 1]);
  expect(results[1]).toMatchObject({ kind: "todo", title: "2026年度复盘", contentId: null });
});

it("日程搜索不把系统日历及其子分组里的截止或周期投影重复列出", () => {
  db.exec(`
    INSERT INTO calendar_group (id, name, is_system, parent_group_id, create_time, update_time) VALUES
      (1, '系统', 1, NULL, 1, 1),
      (2, '待办清单', 0, 1, 1, 1),
      (3, '工作', 0, NULL, 1, 1);
    INSERT INTO calendar (id, title, color, group_id, create_time, update_time) VALUES
      (1, '系统', 'red', 1, 1, 1),
      (2, '截止任务', 'red', 2, 1, 1),
      (3, '工作', 'blue', 3, 1, 1),
      (4, '未分组', 'blue', NULL, 1, 1);
    INSERT INTO calendar_event
      (id, calendar_id, title, start_date, create_time, update_time) VALUES
      (1, 1, '2026年系统记录', 1, 1, 1),
      (2, 2, '2026年度复盘', 1, 1, 2),
      (3, 3, '2026年评审', 1, 1, 3),
      (4, 4, '2026年计划', 1, 1, 4),
      (5, 3, '每周评审', 1, 1, 5);
  `);
  const results = EntitySearchTable.search(db, { kind: "calendar-event", keyword: "2026年" });
  expect(results.map(result => result.id)).toEqual([4, 3]);
});
