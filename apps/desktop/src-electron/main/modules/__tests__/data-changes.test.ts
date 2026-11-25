import DocumentTaskIdentitiesTable from "../tables/document-task-identities";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import mainSchema from "@tau/db-schema/schema/main.sql?raw";
import DataChangesTable from "../tables/data-changes";
import {
  queryDataChanges,
  type PluginChangesQuery,
  type PluginChangesPage,
} from "../../../../../../packages/plugins/src/data-changes";
import { taskKey } from "@tau/shared/task-assistant";
import { PluginSyncResetRequiredError } from "@tau/plugins";

describe("业务变更读取", () => {
  let db: Database.Database;
  let scope: string;
  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(mainSchema);
    scope = "device:workspace:epoch";
    db.prepare(
      "INSERT INTO todo_group(id,title,create_time,update_time) VALUES(1,'工作',100,100)"
    ).run();
    db.prepare(
      "INSERT INTO calendar(id,title,color,create_time,update_time) VALUES(1,'工作','blue',100,100)"
    ).run();
  });
  afterEach(() => db.close());
  const task = (title: string) => {
    const row = db
      .prepare("INSERT INTO todo_item(group_id,title,create_time,update_time) VALUES(1,?,100,100)")
      .run(title);
    return {
      key: Number(row.lastInsertRowid),
      id: taskKey({ kind: "todo", todoId: Number(row.lastInsertRowid), createdAt: 100 }),
    };
  };
  const query = (value: PluginChangesQuery) =>
    queryDataChanges(value, "plugin:reader", async request =>
      DataChangesTable.read(db, request, scope)
    );
  const finish = async (input: PluginChangesQuery): Promise<PluginChangesPage> => {
    let page = await query(input);
    while (page.hasMore) page = await query({ ...input, cursor: page.cursor });
    return page;
  };

  it("全量分页覆盖归档与无日期对象，并补偿扫描期间的新增、修改和删除", async () => {
    const first = task("先读到");
    const removed = task("未读就删除");
    db.prepare("UPDATE todo_item SET is_archived=1 WHERE id=?").run(first.key);
    const start = await query({ domains: ["todo"], limit: 1 });
    expect(start.items).toContainEqual({ domain: "todo", id: first.id, operation: "upsert" });
    expect(start.checkpoint).toBeUndefined();
    db.prepare("DELETE FROM todo_item WHERE id=?").run(removed.key);
    db.prepare("UPDATE todo_item SET title='修改',update_time=50 WHERE id=?").run(first.key);
    const added = task("期间新增");
    const changes = [...start.items];
    let page = start;
    while (page.hasMore) {
      page = await query({ domains: ["todo"], limit: 1, cursor: page.cursor });
      changes.push(...page.items);
    }
    expect(changes).toEqual(
      expect.arrayContaining([
        { domain: "todo", id: removed.id, operation: "delete" },
        { domain: "todo", id: added.id, operation: "upsert" },
        { domain: "todo", id: first.id, operation: "upsert" },
      ])
    );
    expect(page.mode).toBe("snapshot");
    expect((await query({ domains: ["todo"], cursor: page.checkpoint })).items).toEqual([]);
  });

  it("回滚不留下变更，删除墓碑保留原始身份", async () => {
    const original = task("原任务");
    db.prepare("UPDATE data_change_state SET retention=2 WHERE id='main'").run();
    const checkpoint = (await finish({ domains: ["todo"] })).checkpoint;
    expect(() =>
      db.transaction(() => {
        task("回滚任务");
        task("回滚二");
        task("回滚三");
        throw new Error("取消事务");
      })()
    ).toThrow("取消事务");
    expect((await query({ domains: ["todo"], cursor: checkpoint })).items).toEqual([]);
    db.prepare("UPDATE data_change_state SET retention=100 WHERE id='main'").run();
    db.prepare("DELETE FROM todo_item WHERE id=?").run(original.key);
    const newer = task("新任务");
    const page = await query({ domains: ["todo"], cursor: checkpoint });
    expect(page.items).toContainEqual({ domain: "todo", id: original.id, operation: "delete" });
    expect(page.items).toContainEqual({ domain: "todo", id: newer.id, operation: "upsert" });
    expect(newer.id).not.toBe(original.id);
  });

  it("增量固定本轮上界，分页中新提交的修改留给下一轮", async () => {
    const checkpoint = (await finish({ domains: ["todo"] })).checkpoint;
    const a = task("A");
    task("B");
    let page = await query({ domains: ["todo"], cursor: checkpoint, limit: 1 });
    expect(page.hasMore).toBe(true);
    const later = task("下一轮");
    const seen = [...page.items];
    while (page.hasMore) {
      page = await query({ domains: ["todo"], cursor: page.cursor, limit: 1 });
      seen.push(...page.items);
    }
    expect(seen.some(item => item.id === a.id)).toBe(true);
    expect(seen.some(item => item.id === later.id)).toBe(false);
    expect((await query({ domains: ["todo"], cursor: page.checkpoint })).items).toContainEqual({
      domain: "todo",
      id: later.id,
      operation: "upsert",
    });
  });

  it("没有匹配域的变更也推进检查点，日志清理后明确要求全量", async () => {
    const checkpoint = (await finish({ domains: ["event"] })).checkpoint;
    task("其他域");
    const empty = await query({ domains: ["event"], cursor: checkpoint });
    expect(empty.items).toEqual([]);
    expect(empty.checkpoint).not.toBe(checkpoint);
    db.prepare("UPDATE data_change_state SET retention=2 WHERE id='main'").run();
    for (const title of ["一", "二", "三", "四"]) task(title);
    expect(
      (
        db
          .prepare("SELECT pruned_through AS floor FROM data_change_state WHERE id='main'")
          .get() as { floor: number }
      ).floor
    ).toBeGreaterThan(0);
    await expect(query({ domains: ["event"], cursor: empty.checkpoint })).rejects.toMatchObject({
      reason: "history-expired",
    });
  });

  it("作用域或域范围变化拒绝旧游标，普通重新建立读取器仍可继续", async () => {
    const checkpoint = (await finish({ domains: ["todo"] })).checkpoint;
    task("重启后");
    expect(
      (await query({ domains: ["todo"], cursor: checkpoint })).items.some(
        item => item.domain === "todo"
      )
    ).toBe(true);
    await expect(
      query({ domains: ["todo", "calendar"], cursor: checkpoint })
    ).rejects.toBeInstanceOf(PluginSyncResetRequiredError);
    scope = "device:workspace:new-epoch";
    await expect(query({ domains: ["todo"], cursor: checkpoint })).rejects.toMatchObject({
      reason: "scope-changed",
    });
  });

  it("提醒、备注投影和所属日历的可写性变化都会产生身份变更", async () => {
    const original = task("有提醒");
    const content = db
      .prepare(
        "INSERT INTO contents(create_time,update_time,content,count,ref_count) VALUES(100,100,'[]',0,1)"
      )
      .run().lastInsertRowid;
    db.prepare(
      "INSERT INTO content_documents(content_id,document_id,format_version,contracts,revision) VALUES(?,'note',3,'{}','r1')"
    ).run(content);
    const id = db
      .prepare(
        "INSERT INTO calendar_event(create_time,update_time,calendar_id,title,detail_content_id,start_date,end_date,all_day) VALUES(100,100,1,'日程',?,100,200,1)"
      )
      .run(content).lastInsertRowid;
    const checkpoint = (await finish({ domains: ["todo", "event", "calendar"] })).checkpoint;
    db.prepare(
      "INSERT INTO item_reminder(owner_type,owner_id,offset_ms) VALUES('todo',?,60000)"
    ).run(original.key);
    db.prepare("UPDATE content_documents SET revision='r2' WHERE content_id=?").run(content);
    db.prepare("UPDATE calendar SET archived=1 WHERE id=1").run();
    const page = await query({ domains: ["todo", "event", "calendar"], cursor: checkpoint });
    expect(page.items).toEqual(
      expect.arrayContaining([
        { domain: "todo", id: original.id, operation: "upsert" },
        { domain: "event", id: `${id}:100`, operation: "upsert" },
        { domain: "calendar", id: "1", operation: "upsert" },
      ])
    );
  });
  it("分页期间水位回退使用重置错误，不能当作已读完", async () => {
    const checkpoint = (await finish({ domains: ["todo"] })).checkpoint;
    task("第一项");
    task("第二项");
    const page = await query({ domains: ["todo"], cursor: checkpoint, limit: 1 });
    expect(page.hasMore).toBe(true);
    db.prepare("DELETE FROM data_change_log").run();
    db.prepare("DELETE FROM sqlite_sequence WHERE name='data_change_log'").run();
    await expect(query({ domains: ["todo"], cursor: page.cursor, limit: 1 })).rejects.toMatchObject(
      { reason: "history-replaced" }
    );
  });
  it("全量续页跨过两位数主键也不丢身份", async () => {
    const expected = new Set(Array.from({ length: 12 }, (_, index) => task(`任务${index}`).id));
    const actual = new Set<string>();
    let page = await query({ domains: ["todo"], limit: 2 });
    page.items.forEach(item => actual.add(item.id));
    while (page.hasMore) {
      page = await query({ domains: ["todo"], cursor: page.cursor, limit: 2 });
      page.items.forEach(item => actual.add(item.id));
    }
    expect(actual).toEqual(expected);
  });
  it("保留边界被重建后仍根据实际缺失前缀拒绝旧游标", async () => {
    const checkpoint = (await finish({ domains: ["todo"] })).checkpoint;
    db.prepare("UPDATE data_change_state SET retention=2 WHERE id='main'").run();
    for (const title of ["一", "二", "三", "四"]) task(title);
    db.prepare("DELETE FROM data_change_state").run();
    db.prepare("INSERT INTO data_change_state(id,protocol_version) VALUES('main',1)").run();
    await expect(query({ domains: ["todo"], cursor: checkpoint })).rejects.toMatchObject({
      reason: "history-expired",
    });
  });
  const nodes = (ids: string[]) =>
    JSON.stringify([
      {
        type: "check-list",
        children: ids.map(taskId => ({
          type: "check-list-item",
          taskId,
          checked: true,
          taskArchived: true,
          children: [{ type: "paragraph", children: [{ text: taskId }] }],
        })),
      },
    ]);
  const document = (id: number, ids: string[]) => {
    db.prepare(
      "INSERT INTO contents(id,create_time,update_time,content,ref_count) VALUES(?,100,100,?,1)"
    ).run(id, nodes(ids));
    db.prepare(
      "INSERT INTO articles(title,content_id,create_time,update_time) VALUES('原文',?,100,100)"
    ).run(id);
    while (!DocumentTaskIdentitiesTable.prepare(db, 1)) {
      // 已有库按批补齐，直到可靠身份目录就绪。
    }
  };
  it("正文变化不依赖查询索引，混合全量包含完成和归档，排除与来源恢复可以续读", async () => {
    const standalone = task("独立");
    document(100, ["a", "b"]);
    const first = await finish({ domains: ["todo"], todoSource: "all", limit: 1 });
    const snapshot = await query({ domains: ["todo"], todoSource: "document", limit: 100 });
    expect(snapshot.items.map(item => item.id).sort()).toEqual([
      "document:100:100:a",
      "document:100:100:b",
    ]);
    db.prepare(
      "INSERT INTO doc_task_settings(content_id,task_id,kind,create_time) VALUES(100,'','excluded',1)"
    ).run();
    const excluded = await query({
      domains: ["todo"],
      todoSource: "all",
      cursor: first.checkpoint,
    });
    expect(excluded.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "document:100:100:a", operation: "delete" }),
        expect.objectContaining({ id: "document:100:100:b", operation: "delete" }),
      ])
    );
    expect(excluded.items.some(item => item.id === standalone.id)).toBe(false);
    db.prepare("DELETE FROM doc_task_settings WHERE content_id=100").run();
    const restored = await query({
      domains: ["todo"],
      todoSource: "all",
      cursor: excluded.checkpoint,
    });
    expect(restored.items).toContainEqual({
      domain: "todo",
      id: "document:100:100:a",
      operation: "upsert",
    });
  });
  it("分块与整篇互换、节点删除和回滚保持身份及墓碑一致", async () => {
    document(100, ["a", "b"]);
    const checkpoint = (await finish({ domains: ["todo"], todoSource: "document" })).checkpoint;
    db.transaction(() => {
      db.prepare(
        "INSERT INTO content_document_blocks(content_id,block_id,position,content,count) VALUES(100,'block',0,?,0)"
      ).run(JSON.stringify(JSON.parse(nodes(["a", "b"]))[0]));
      db.prepare("UPDATE contents SET content=NULL WHERE id=100").run();
    })();
    expect(
      db.prepare("SELECT task_id FROM document_task_visible_identities ORDER BY task_id").all()
    ).toEqual([{ task_id: "a" }, { task_id: "b" }]);
    db.prepare(
      "UPDATE content_document_blocks SET block_id='moved',position=1 WHERE content_id=100"
    ).run();
    const moved = await query({ domains: ["todo"], todoSource: "document" });
    expect(moved.items.map(item => item.id).sort()).toEqual([
      "document:100:100:a",
      "document:100:100:b",
    ]);
    expect(() =>
      db.transaction(() => {
        db.prepare("UPDATE content_document_blocks SET content=? WHERE content_id=100").run(
          JSON.stringify(JSON.parse(nodes(["c"]))[0])
        );
        throw new Error("rollback");
      })()
    ).toThrow("rollback");
    db.prepare("UPDATE content_document_blocks SET content=? WHERE content_id=100").run(
      JSON.stringify(JSON.parse(nodes(["a"]))[0])
    );
    const page = await query({ domains: ["todo"], todoSource: "document", cursor: checkpoint });
    expect(page.items).toContainEqual({
      domain: "todo",
      id: "document:100:100:b",
      operation: "delete",
    });
    expect(page.items.some(item => item.id.endsWith(":c"))).toBe(false);
    db.prepare("UPDATE contents SET content=? WHERE id=100").run(nodes(["a", "b"]));
    expect(
      db.prepare("SELECT task_id FROM document_task_visible_identities ORDER BY task_id").all()
    ).toEqual([{ task_id: "a" }, { task_id: "b" }]);
  });
  it("损坏或重复身份不伪装成空成功，修复后可以从原检查点补齐", async () => {
    document(100, ["a"]);
    const checkpoint = (await finish({ domains: ["todo"], todoSource: "document" })).checkpoint;
    db.prepare("UPDATE contents SET content=? WHERE id=100").run(nodes(["a", "a"]));
    await expect(
      query({ domains: ["todo"], todoSource: "document", cursor: checkpoint })
    ).rejects.toThrow("完整解析");
    expect(db.prepare("SELECT task_id FROM document_task_identities").all()).toEqual([
      { task_id: "a" },
    ]);
    db.prepare(
      "INSERT INTO doc_task_settings(content_id,task_id,kind,create_time) VALUES(100,'','excluded',1)"
    ).run();
    const hidden = await finish({ domains: ["todo"], todoSource: "document" });
    expect(hidden.checkpoint).toEqual(expect.any(String));
    db.prepare("DELETE FROM doc_task_settings WHERE content_id=100").run();
    await expect(query({ domains: ["todo"], todoSource: "document" })).rejects.toThrow("完整解析");
    db.prepare("UPDATE contents SET content=? WHERE id=100").run(nodes(["b"]));
    const page = await query({ domains: ["todo"], todoSource: "document", cursor: checkpoint });
    expect(page.items).toEqual(
      expect.arrayContaining([
        { domain: "todo", id: "document:100:100:a", operation: "delete" },
        { domain: "todo", id: "document:100:100:b", operation: "upsert" },
      ])
    );
  });
  it("回填分批进度可继续，可靠目录代次变化要求重置游标", async () => {
    document(100, ["a"]);
    document(101, ["b"]);
    db.prepare("DELETE FROM document_task_identities").run();
    db.prepare(
      "UPDATE document_task_projection_state SET ready=0,after_content_id=0 WHERE id='main'"
    ).run();
    await expect(query({ domains: ["todo"], todoSource: "document" })).rejects.toThrow("正在准备");
    expect(DocumentTaskIdentitiesTable.prepare(db, 1)).toBe(false);
    while (!DocumentTaskIdentitiesTable.prepare(db, 1)) {
      // 已有库按批补齐，直到可靠身份目录就绪。
    }
    const first = await finish({ domains: ["todo"], todoSource: "document", limit: 1 });
    db.prepare(
      "UPDATE document_task_projection_state SET epoch='replacement' WHERE id='main'"
    ).run();
    await expect(
      query({ domains: ["todo"], todoSource: "document", cursor: first.checkpoint })
    ).rejects.toMatchObject({ reason: "scope-changed" });
  });

  // 压测曾发现公开 id 别名让 ORDER BY 走字典序，数字续页位置因此跳过部分任务。
  it("混合小页扫描按稳定数字键续读，不受公开身份字典序影响", async () => {
    const expected = new Set<string>();
    for (let i = 0; i < 25; i++) expected.add(task(`任务${i}`).id);
    document(
      100,
      Array.from({ length: 30 }, (_, i) => `task-${i}`)
    );
    for (let i = 0; i < 30; i++) expected.add(`document:100:100:task-${i}`);
    const seen = new Set<string>();
    let page = await query({ domains: ["todo"], todoSource: "all", limit: 3 });
    for (let pages = 0; ; pages++) {
      expect(pages).toBeLessThan(100);
      for (const item of page.items) seen.add(item.id);
      if (!page.hasMore) break;
      page = await query({ domains: ["todo"], todoSource: "all", limit: 3, cursor: page.cursor });
    }
    expect([...seen].sort()).toEqual([...expected].sort());
  });
  it("含日期后缀和换行的正文身份仍与共享编码一致，不与实例混淆", async () => {
    const ids = ["task@2026-11-25", "nested:task@source", "~4142", "line\nbreak", "任务"];
    document(100, ids);
    const result = await query({ domains: ["todo"], todoSource: "document", limit: 100 });
    const expected = ids.map(taskId =>
      taskKey({ kind: "document", contentId: 100, createdAt: 100, taskId })
    );
    expect(result.items.map(item => item.id).sort()).toEqual(expected.sort());
    const checkpoint = (await finish({ domains: ["todo"], todoSource: "document" })).checkpoint;
    db.prepare("UPDATE contents SET content=? WHERE id=100").run(nodes([]));
    const removed = await query({ domains: ["todo"], todoSource: "document", cursor: checkpoint });
    expect(
      removed.items
        .filter(item => item.operation === "delete")
        .map(item => item.id)
        .sort()
    ).toEqual(expected.sort());
  });
});
