import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("electron");
vi.mock("../video-note-index-queue");
import schema from "@tau/db-schema/schema/main.sql?raw";
import { writePluginDirectory } from "../plugin-directories";
import { readDirectory } from "../task-assistant/catalog";
import { readTask } from "../task-assistant/engine";
import type { DirectoryWrite } from "@tau/plugins/host";

let db: Database.Database;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  db = new Database(":memory:");
  db.exec(schema);
});
afterEach(() => {
  db.close();
  vi.useRealTimers();
});
const create = (entity: "todo-list" | "calendar", title: string, key = "create") =>
  writePluginDirectory(db, "fixture", {
    entity,
    action: "create",
    input: { title },
    requestId: key,
  });
const update = (
  item: NonNullable<ReturnType<typeof readDirectory>>,
  patch: Record<string, unknown>,
  entity: "todo-list" | "calendar" = "todo-list"
) =>
  writePluginDirectory(db, "fixture", {
    entity,
    action: "update",
    id: item.id,
    patch,
    expectedRevision: item.revision,
  } as DirectoryWrite);
const logs = () =>
  db.prepare("SELECT domain,entity_id,operation FROM data_change_log ORDER BY seq").all();

describe("目录写入事务", () => {
  it("创建重试返回当前目录、请求按插件隔离，参数和类型不能偷换，删除恢复后不复活旧请求", () => {
    const list = create("todo-list", "工作");
    const renamed = update(list, { title: "新工作" });
    expect(create("todo-list", "工作")).toEqual(renamed);
    expect(() => create("todo-list", "换参数")).toThrow(/请求/);
    expect(() => create("calendar", "工作")).toThrow(/请求/);
    const another = writePluginDirectory(db, "other", {
      entity: "todo-list",
      action: "create",
      input: { title: "工作" },
      requestId: "create",
    });
    expect(another.id).not.toBe(list.id);
    const before = db.prepare("SELECT * FROM todo_group WHERE id=?").get(list.id) as Record<
      string,
      unknown
    >;
    db.prepare("DELETE FROM todo_group WHERE id=?").run(list.id);
    db.prepare(
      `INSERT INTO todo_group(${Object.keys(before).join(",")}) VALUES(${Object.keys(before)
        .map(() => "?")
        .join(",")})`
    ).run(...Object.values(before));
    expect(() => create("todo-list", "工作")).toThrow(/已删除/);
    expect(db.prepare("SELECT title FROM todo_group WHERE id=?").get(list.id)).toEqual({
      title: "新工作",
    });
  });
  it("同毫秒并发和时钟回拨由业务摘要判冲突，无操作写入不改变版本或日志", () => {
    const first = create("todo-list", "工作");
    const second = update(first, { title: "改名" });
    expect(second.revision).not.toBe(first.revision);
    expect(() => update(first, { title: "改名" })).toThrow(/PLUGIN_CONFLICT/);
    const before = logs();
    expect(update(second, { title: "改名" })).toEqual(second);
    expect(logs()).toEqual(before);
    vi.setSystemTime(10);
    const third = update(second, { title: "回拨" });
    expect(third.revision).not.toBe(second.revision);
    db.prepare("UPDATE todo_group SET sort_index=999,update_time=0 WHERE id=?").run(first.id);
    expect(readDirectory(db, "todo-list", Number(first.id))?.revision).toBe(third.revision);
  });
  it("只改日历名称和颜色保留描述、归档、分组、排序、置顶和事件身份", () => {
    const calendar = create("calendar", "工作");
    db.prepare(
      "INSERT INTO contents(id,create_time,update_time,content) VALUES(100,1,1,'[]')"
    ).run();
    db.prepare(
      "INSERT INTO calendar_group(id,name,is_system,create_time,update_time) VALUES(100,'个人',0,1,1)"
    ).run();
    db.prepare(
      "UPDATE calendar SET description_content_id=100,archived=1,pinned=1,group_id=100,order_index=99 WHERE id=?"
    ).run(calendar.id);
    db.prepare(
      "INSERT INTO calendar_event(id,title,calendar_id,start_date,create_time,update_time) VALUES(100,'原事件',?,1,2,2)"
    ).run(calendar.id);
    const before = db.prepare("SELECT * FROM calendar WHERE id=?").get(calendar.id) as Record<
      string,
      unknown
    >;
    const events = db.prepare("SELECT * FROM calendar_event").all();
    const current = readDirectory(db, "calendar", Number(calendar.id))!;
    expect(current).toMatchObject({ editable: true, writable: false });
    const result = update(current, { title: "新名称", color: "red", visible: false }, "calendar");
    const after = db.prepare("SELECT * FROM calendar WHERE id=?").get(calendar.id) as Record<
      string,
      unknown
    >;
    for (const key of [
      "description_content_id",
      "archived",
      "pinned",
      "group_id",
      "order_index",
      "create_time",
    ])
      expect(after[key], key).toEqual(before[key]);
    expect(result).toMatchObject({
      title: "新名称",
      color: "red",
      visible: false,
      editable: true,
      writable: false,
    });
    expect(db.prepare("SELECT * FROM calendar_event").all()).toEqual(events);
  });
  it("系统待办组和多层系统日历不允许元数据修改，清单可清空颜色", () => {
    const list = create("todo-list", "工作");
    const colored = update(list, { color: "red" });
    expect(update(colored, { color: null }).color).toBeNull();
    db.prepare("UPDATE todo_group SET is_system=1 WHERE id=?").run(list.id);
    const system = readDirectory(db, "todo-list", Number(list.id))!;
    expect(system).toMatchObject({ editable: false, writable: true });
    expect(() => update(system, { title: "改系统" })).toThrow(/系统/);
    db.exec(
      "INSERT INTO calendar_group(id,name,is_system,create_time,update_time) VALUES(1,'系统',1,1,1);INSERT INTO calendar_group(id,name,parent_group_id,create_time,update_time) VALUES(2,'子',1,1,1),(3,'孙',2,1,1)"
    );
    const calendar = create("calendar", "日历", "calendar");
    db.prepare("UPDATE calendar SET group_id=3 WHERE id=?").run(calendar.id);
    const nested = readDirectory(db, "calendar", Number(calendar.id))!;
    expect(nested).toMatchObject({ editable: false, writable: false });
    expect(() => update(nested, { title: "修改" }, "calendar")).toThrow(/系统/);
  });
  it("清单改名保留旧项目词和显式绑定，不改正文；颜色改变不通知全库正文任务", () => {
    const list = create("todo-list", "工作");
    const nodes = [
      {
        type: "check-list",
        children: [
          {
            type: "check-list-item",
            taskId: "task",
            checked: false,
            taskGroup: { id: Number(list.id), createdAt: 1000, token: "#工作" },
            children: [
              { type: "paragraph", children: [{ type: "formatted", text: "任务 #工作" }] },
            ],
          },
        ],
      },
    ];
    const original = JSON.stringify(nodes);
    db.prepare(
      "INSERT INTO contents(id,create_time,update_time,content,ref_count) VALUES(100,2,2,?,1)"
    ).run(original);
    db.exec(
      "INSERT INTO articles(title,content_id,create_time,update_time) VALUES('原文',100,2,2)"
    );
    const ref = { kind: "document" as const, contentId: 100, createdAt: 2, taskId: "task" };
    expect(readTask(db, ref).groupId).toBe(Number(list.id));
    const renamed = update(list, { title: "工作新名" });
    create("todo-list", "工作", "same-name");
    expect(readTask(db, ref).groupId).toBe(Number(list.id));
    expect(db.prepare("SELECT content FROM contents WHERE id=100").get()).toEqual({
      content: original,
    });
    db.exec("DELETE FROM data_change_log");
    update(renamed, { color: "red" });
    expect(db.prepare("SELECT entity_id FROM data_change_log WHERE domain='todo'").all()).toEqual(
      []
    );
    expect(db.prepare("SELECT domain FROM data_change_log WHERE domain='todo-list'").all()).toEqual(
      [{ domain: "todo-list" }]
    );
  });
  it("目录、回执与变化日志在后续失败时一起回滚", () => {
    db.exec(
      "CREATE TRIGGER injected_receipt BEFORE INSERT ON plugin_create_receipts BEGIN SELECT RAISE(ABORT,'injected'); END"
    );
    const before = logs();
    expect(() => create("calendar", "失败")).toThrow(/injected/);
    expect(db.prepare("SELECT id FROM calendar").all()).toEqual([]);
    expect(db.prepare("SELECT * FROM plugin_create_receipts").all()).toEqual([]);
    expect(logs()).toEqual(before);
  });
});
