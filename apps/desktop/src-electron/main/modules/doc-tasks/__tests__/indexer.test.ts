import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RECONCILE_BATCH, reconcileDocTasks, regroupDocTasks, reindexDocTasks } from "../indexer";

const SCHEMA_DIR = resolve(__dirname, "../../../../../../../packages/db-schema/schema");
const MAIN_SQL = readFileSync(resolve(SCHEMA_DIR, "main.sql"), "utf8");
const INDEX_SQL = readFileSync(resolve(SCHEMA_DIR, "index.sql"), "utf8");

const p = (t: string) => ({ type: "paragraph", children: [{ type: "formatted", text: t }] });
const item = (taskId: string | undefined, t: string, checked = false) => ({
  type: "check-list-item",
  checked,
  ...(taskId ? { taskId } : {}),
  children: [p(t)],
});
const list = (...children: unknown[]) => ({ type: "check-list", children });

let mainDb: Database.Database;
let indexDb: Database.Database;
let clock = 1_000;

const insertContent = (nodes: unknown[]) =>
  Number(
    mainDb
      .prepare(
        `INSERT INTO contents (create_time, update_time, content, count, ref_count) VALUES (?, ?, ?, 0, 1)`
      )
      .run(clock, clock++, JSON.stringify(nodes)).lastInsertRowid
  );
const updateContent = (id: number, nodes: unknown[]) =>
  mainDb
    .prepare(`UPDATE contents SET content = ?, update_time = ? WHERE id = ?`)
    .run(JSON.stringify(nodes), clock++, id);
const contentOf = (id: number) =>
  mainDb.prepare(`SELECT content, update_time FROM contents WHERE id = ?`).get(id) as {
    content: string;
    update_time: number;
  };
const tasksOf = (id: number) =>
  indexDb
    .prepare(
      `SELECT task_id, title, checked, group_id, date_hint, date_anchor, due_at
       FROM doc_tasks WHERE content_id = ? ORDER BY sort_index`
    )
    .all(id) as Array<{
    task_id: string;
    title: string;
    checked: number;
    group_id: number | null;
    date_hint: string | null;
    date_anchor: number | null;
    due_at: number | null;
  }>;
const addGroup = (title: string) =>
  Number(
    mainDb
      .prepare(
        `INSERT INTO todo_group (title, sort_index, is_archived, is_system, create_time, update_time)
         VALUES (?, 0, 0, 0, 0, 0)`
      )
      .run(title).lastInsertRowid
  );

// 2026-10-08 周四
const NOW = new Date(2026, 9, 8, 10).getTime();
const DAY = 86_400_000;

beforeEach(() => {
  mainDb = new Database(":memory:");
  mainDb.exec(MAIN_SQL);
  indexDb = new Database(":memory:");
  indexDb.exec(INDEX_SQL);
});

afterEach(() => {
  mainDb.close();
  indexDb.close();
});

describe("reindexDocTasks", () => {
  it("收集勾选项，解析项目与日期", () => {
    const groupId = addGroup("笔记软件开发");
    const id = insertContent([
      list(item("a", "整理文档 #笔记软件开发 2026年10月10日"), item("b", "交电费", true)),
    ]);

    expect(reindexDocTasks(mainDb, indexDb, [id], NOW)).toEqual({ processed: 1, changed: 1 });
    expect(tasksOf(id)).toEqual([
      {
        task_id: "a",
        title: "整理文档",
        checked: 0,
        group_id: groupId,
        date_hint: "2026年10月10日",
        date_anchor: null,
        due_at: new Date(2026, 9, 10).getTime(),
      },
      {
        task_id: "b",
        title: "交电费",
        checked: 1,
        group_id: null,
        date_hint: null,
        date_anchor: null,
        due_at: null,
      },
    ]);
  });

  it("内容没变时不计变化", () => {
    const id = insertContent([list(item("a", "甲"))]);
    reindexDocTasks(mainDb, indexDb, [id], NOW);
    expect(reindexDocTasks(mainDb, indexDb, [id], NOW).changed).toBe(0);
  });

  it("相对日期沿用首次锚点，不随时间漂移；原文改变才换锚", () => {
    const id = insertContent([list(item("a", "回邮件 明天"))]);
    reindexDocTasks(mainDb, indexDb, [id], NOW);
    const tomorrow = new Date(2026, 9, 9).getTime();
    expect(tasksOf(id)[0]).toMatchObject({ date_anchor: NOW, due_at: tomorrow });

    updateContent(id, [list(item("a", "回邮件给房东 明天"))]);
    reindexDocTasks(mainDb, indexDb, [id], NOW + 5 * DAY);
    expect(tasksOf(id)[0]).toMatchObject({ date_anchor: NOW, due_at: tomorrow });

    updateContent(id, [list(item("a", "回邮件给房东 后天"))]);
    reindexDocTasks(mainDb, indexDb, [id], NOW + 5 * DAY);
    expect(tasksOf(id)[0]).toMatchObject({
      date_anchor: NOW + 5 * DAY,
      due_at: new Date(2026, 9, 15).getTime(),
    });
  });

  it("为缺 taskId 与重复 id 的项静默补 id：写回正文但不改 update_time", () => {
    const id = insertContent([
      list(item(undefined, "无 id"), item("dup", "原件"), item("dup", "副本")),
    ]);
    const before = contentOf(id).update_time;

    reindexDocTasks(mainDb, indexDb, [id], NOW);

    const tasks = tasksOf(id);
    expect(tasks).toHaveLength(3);
    expect(new Set(tasks.map(t => t.task_id)).size).toBe(3);
    expect(tasks[1].task_id).toBe("dup");
    const stored = contentOf(id);
    expect(stored.update_time).toBe(before);
    expect(stored.content).toContain(tasks[0].task_id);
  });

  it("勾选项删光或正文删除后清除", () => {
    const id = insertContent([list(item("a", "甲"))]);
    reindexDocTasks(mainDb, indexDb, [id], NOW);

    updateContent(id, [p("没有勾选项了")]);
    expect(reindexDocTasks(mainDb, indexDb, [id], NOW).changed).toBe(1);
    expect(tasksOf(id)).toEqual([]);

    mainDb.prepare(`DELETE FROM contents WHERE id = ?`).run(id);
    reindexDocTasks(mainDb, indexDb, [id], NOW);
    expect(
      indexDb.prepare(`SELECT COUNT(*) AS n FROM doc_task_sources`).get() as { n: number }
    ).toEqual({ n: 0 });
  });
});

describe("regroupDocTasks", () => {
  it("项目新建 / 改名后按已存原文重算归属", () => {
    const id = insertContent([list(item("a", "整理 #发布"))]);
    reindexDocTasks(mainDb, indexDb, [id], NOW);
    expect(tasksOf(id)[0]).toMatchObject({ group_id: null, title: "整理 #发布" });

    const groupId = addGroup("发布");
    expect(regroupDocTasks(mainDb, indexDb)).toBe(1);
    expect(tasksOf(id)[0]).toMatchObject({ group_id: groupId, title: "整理" });

    mainDb.prepare(`UPDATE todo_group SET is_archived = 1 WHERE id = ?`).run(groupId);
    regroupDocTasks(mainDb, indexDb);
    expect(tasksOf(id)[0]).toMatchObject({ group_id: null, title: "整理 #发布" });
  });
});

describe("reconcileDocTasks", () => {
  it("只处理新增、变更与已删除的正文，跨批处理", async () => {
    const ids = Array.from({ length: RECONCILE_BATCH + 3 }, (_, i) =>
      insertContent([list(item(`t${i}`, `任务 ${i}`))])
    );
    const first = await reconcileDocTasks(mainDb, indexDb);
    expect(first).toMatchObject({ processed: ids.length, changed: ids.length, aborted: false });

    updateContent(ids[0], [list(item("t0", "改过", true))]);
    const second = await reconcileDocTasks(mainDb, indexDb);
    expect(second).toMatchObject({ processed: 1, changed: 1 });
    expect(tasksOf(ids[0])[0]).toMatchObject({ checked: 1, title: "改过" });
  });

  it("isStale 为真时中途停止", async () => {
    insertContent([list(item("a", "甲"))]);
    expect(await reconcileDocTasks(mainDb, indexDb, () => true)).toMatchObject({ aborted: true });
  });
});
