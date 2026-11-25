import Database from "better-sqlite3";
import { afterEach, beforeEach, expect, it } from "vitest";
import schema from "@tau/db-schema/schema/main.sql?raw";
import Events from "../tables/data-change-events";
let db: Database.Database;
beforeEach(() => {
  db = new Database(":memory:");
  db.exec(schema);
});
afterEach(() => db.close());
it("所有四域给出 get 使用的身份，关联更新和删除沿用同一个事件格式", () => {
  db.exec(
    "INSERT INTO todo_group(id,title,create_time,update_time) VALUES(1,'目录',5,5);INSERT INTO calendar(id,title,color,create_time,update_time) VALUES(1,'日历','blue',5,5);INSERT INTO todo_item(id,group_id,title,create_time,update_time) VALUES(3,1,'任务',7,7);INSERT INTO calendar_event(id,calendar_id,title,start_date,create_time,update_time) VALUES(4,1,'事件',0,9,9)"
  );
  const created = Events.read(db, 0);
  expect(created.events).toEqual(
    expect.arrayContaining([
      { type: "todo-list.created", id: "1", at: expect.any(Number) },
      { type: "calendar.created", id: "1", at: expect.any(Number) },
      { type: "todo.created", id: "todo:3:7", at: expect.any(Number) },
      { type: "event.created", id: "4:9", at: expect.any(Number) },
    ])
  );
  db.exec(
    "UPDATE todo_item SET title='新名' WHERE id=3;UPDATE calendar_event SET title='新事件' WHERE id=4"
  );
  const updated = Events.read(db, created.cursor, 0);
  expect(updated.events).toEqual([
    { type: "todo.updated", id: "todo:3:7", at: 0 },
    { type: "event.updated", id: "4:9", at: 0 },
  ]);
  db.exec("DELETE FROM todo_item WHERE id=3;DELETE FROM calendar_event WHERE id=4");
  expect(Events.read(db, updated.cursor, 0).events).toEqual([
    { type: "todo.deleted", id: "todo:3:7", at: 0 },
    { type: "event.deleted", id: "4:9", at: 0 },
  ]);
});
it("日志分页保留所有身份，未知历史和过期水位需要重置", () => {
  for (let id = 1; id <= 501; id++)
    db.prepare(
      "INSERT INTO calendar(id,title,color,create_time,update_time) VALUES(?,'目录','blue',1,1)"
    ).run(id);
  let page = Events.read(db, 0);
  const ids = page.events.map(e => e.id);
  while (page.hasMore) {
    page = Events.read(db, page.cursor);
    ids.push(...page.events.map(e => e.id));
  }
  expect(new Set(ids)).toEqual(new Set(Array.from({ length: 501 }, (_, n) => String(n + 1))));
  db.exec("UPDATE data_change_log SET action=NULL WHERE seq=501");
  expect(Events.read(db, 500).reset).toBe(true);
  db.exec(
    "UPDATE data_change_state SET retention=1;INSERT INTO calendar(id,title,color,create_time,update_time) VALUES(502,'新','blue',1,1)"
  );
  expect(Events.read(db, 0)).toMatchObject({ reset: true, events: [] });
});
it("新建后修改和删除的合并不丢身份，也不把回滚当作提交", () => {
  db.exec("BEGIN;INSERT INTO todo_group(id,title,create_time,update_time) VALUES(1,'目录',1,1)");
  expect(() => Events.read(db, 0)).toThrow(/未提交/);
  db.exec("ROLLBACK");
  expect(Events.read(db, 0).events).toEqual([]);
  db.exec(
    "INSERT INTO todo_group(id,title,create_time,update_time) VALUES(1,'目录',1,1);UPDATE todo_group SET title='新名' WHERE id=1;DELETE FROM todo_group WHERE id=1"
  );
  expect(Events.read(db, 0, 0).events).toEqual([{ type: "todo-list.deleted", id: "1", at: 0 }]);
});
