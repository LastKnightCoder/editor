import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron");
vi.mock("../../video-note-index-queue");

import { reindexDocTasks } from "../indexer";
import {
  getDocTaskContentStatus,
  getDocTaskSnapshot,
  getDocTasksOf,
  readDocTaskReminders,
  setDocTaskReminders,
  toggleDocTask,
} from "../query";
import { assistantReminders } from "../../task-assistant/reminders";
import { hmToClockOffset } from "@tau/shared/reminders";

const SCHEMA_DIR = resolve(__dirname, "../../../../../../../packages/db-schema/schema");
const MAIN_SQL = readFileSync(resolve(SCHEMA_DIR, "main.sql"), "utf8");
const INDEX_SQL = readFileSync(resolve(SCHEMA_DIR, "index.sql"), "utf8");

const p = (t: string) => ({ type: "paragraph", children: [{ type: "formatted", text: t }] });
const item = (taskId: string, t: string, checked = false) => ({
  type: "check-list-item",
  checked,
  taskId,
  children: [p(t)],
});
const list = (...children: unknown[]) => ({ type: "check-list", children });

let mainDb: Database.Database;
let indexDb: Database.Database;

const insertContent = (nodes: unknown[], time = 1_000) =>
  Number(
    mainDb
      .prepare(
        `INSERT INTO contents (create_time, update_time, content, count, ref_count) VALUES (?, ?, ?, 0, 1)`
      )
      .run(time, time, JSON.stringify(nodes)).lastInsertRowid
  );
const insertCard = (contentId: number) =>
  mainDb
    .prepare(
      `INSERT INTO cards (create_time, update_time, tags, content_id) VALUES (0, 0, '[]', ?)`
    )
    .run(contentId);
const insertArticle = (contentId: number, title: string, isDelete = 0) =>
  mainDb
    .prepare(
      `INSERT INTO articles (create_time, update_time, title, author, tags, links, content_id, is_delete)
       VALUES (0, 0, ?, '', '[]', '[]', ?, ?)`
    )
    .run(title, contentId, isDelete);

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

describe("getDocTaskSnapshot", () => {
  it("文档数量增长时来源 SQL 按批执行，不回源读取全文", () => {
    const ids = Array.from({ length: 420 }, (_, index) => {
      const id = insertContent([list(item(`t${index}`, `任务 ${index}`))]);
      insertArticle(id, `文章 ${index}`);
      return id;
    });
    reindexDocTasks(mainDb, indexDb, ids);
    const prepare = vi.spyOn(mainDb, "prepare");
    expect(getDocTaskSnapshot(mainDb, indexDb).sources).toHaveLength(420);
    expect(prepare.mock.calls.length).toBeLessThan(10);
    prepare.mockRestore();
  });

  it("日记来源以片段为实体身份", () => {
    const id = insertContent([list(item("diary-task", "日记待办"))]);
    mainDb.exec(
      `INSERT INTO diary_entries (id,type,date,create_time,update_time) VALUES (7,'daily','2026-10-08',1,1)`
    );
    mainDb
      .prepare(
        `INSERT INTO diary_segments (diary_id,content_id,create_time,update_time) VALUES (7,?,1,1)`
      )
      .run(id);
    reindexDocTasks(mainDb, indexDb, [id]);
    expect(getDocTaskSnapshot(mainDb, indexDb).sources[0]).toMatchObject({
      ref: { kind: "diary-moment", id: 1 },
      title: "2026-10-08 日记",
    });
  });
  it("按文档汇总；只列未完成条目；不属于实体的正文与已删文章不出现", () => {
    const a = insertContent([list(item("a1", "甲"), item("a2", "乙", true))], 2_000);
    insertArticle(a, "Q4 发布准备");
    const c = insertContent([list(item("c1", "丙"))], 3_000);
    insertCard(c);
    const orphan = insertContent([list(item("o1", "无主"))]);
    const deleted = insertContent([list(item("d1", "已删"))]);
    insertArticle(deleted, "删掉的", 1);
    reindexDocTasks(mainDb, indexDb, [a, c, orphan, deleted]);

    const snapshot = getDocTaskSnapshot(mainDb, indexDb);
    expect(snapshot.sources.map(s => [s.contentId, s.ref.kind, s.openCount, s.doneCount])).toEqual([
      [c, "card", 1, 0],
      [a, "article", 1, 1],
    ]);
    expect(snapshot.sources[1].title).toBe("Q4 发布准备");
    expect(snapshot.open.map(t => t.taskId).sort()).toEqual(["a1", "c1"]);
  });
});

describe("toggleDocTask", () => {
  it("写回正文并更新镜像；正文 update_time 前进", () => {
    const id = insertContent([list(item("t", "任务"))]);
    insertCard(id);
    reindexDocTasks(mainDb, indexDb, [id]);

    expect(toggleDocTask(mainDb, indexDb, id, "t", true)).toBe("ok");

    const row = mainDb
      .prepare(`SELECT content, update_time FROM contents WHERE id = ?`)
      .get(id) as {
      content: string;
      update_time: number;
    };
    expect(JSON.parse(row.content)[0].children[0].checked).toBe(true);
    expect(row.update_time).toBeGreaterThan(1_000);
    expect(getDocTasksOf(mainDb, indexDb, id)[0].checked).toBe(true);
  });

  it("原文里已没有这一项时返回 not-found 并重建索引", () => {
    const id = insertContent([list(item("t", "任务"))]);
    reindexDocTasks(mainDb, indexDb, [id]);
    mainDb
      .prepare(`UPDATE contents SET content = ?, update_time = 2000 WHERE id = ?`)
      .run(JSON.stringify([p("删光了")]), id);

    expect(toggleDocTask(mainDb, indexDb, id, "t", true)).toBe("not-found");
    expect(getDocTasksOf(mainDb, indexDb, id)).toEqual([]);
  });

  it("内容层拒绝写入（共享内容）时返回 readonly，正文不变", () => {
    const id = insertContent([list(item("t", "任务"))]);
    reindexDocTasks(mainDb, indexDb, [id]);
    mainDb
      .prepare(
        `INSERT INTO collaboration_bindings (content_id, content_created_at, server_url, document_id)
         VALUES (?, 0, '', 'doc')`
      )
      .run(id);

    expect(toggleDocTask(mainDb, indexDb, id, "t", true)).toBe("readonly");
    const row = mainDb.prepare(`SELECT content FROM contents WHERE id = ?`).get(id) as {
      content: string;
    };
    expect(JSON.parse(row.content)[0].children[0].checked).toBe(false);
  });
});

describe("getDocTaskContentStatus", () => {
  it("给编辑器状态条：未完成数与是否排除", () => {
    const id = insertContent([list(item("a", "甲"), item("b", "乙", true))]);
    reindexDocTasks(mainDb, indexDb, [id]);
    expect(getDocTaskContentStatus(mainDb, indexDb, id)).toEqual({
      excluded: false,
      openCount: 1,
      collectable: false,
      promotedTaskIds: [],
    });
  });
  it("有实体的正文才可展示收集状态", () => {
    const id = insertContent([list(item("a", "甲"))]);
    insertCard(id);
    reindexDocTasks(mainDb, indexDb, [id]);
    expect(getDocTaskContentStatus(mainDb, indexDb, id).collectable).toBe(true);
  });
});

describe("doc-tasks 多条提醒读写、冲突保护与排期", () => {
  it("打开抽屉后转为协作、排除或提升时，旧指纹不能再提交", () => {
    const id = insertContent([list(item("a", "原任务"))]);
    insertCard(id);
    const baseline = readDocTaskReminders(mainDb, id, "a");
    if (!baseline.ok) throw new Error("未找到夹具");
    const save = () =>
      setDocTaskReminders(
        mainDb,
        indexDb,
        id,
        "a",
        [{ at: "2026-11-28T08:00:00Z" }],
        baseline.digest
      );
    mainDb
      .prepare(
        "INSERT INTO collaboration_bindings(content_id,content_created_at,server_url,document_id) SELECT id,create_time,'https://example.test','doc' FROM contents WHERE id=?"
      )
      .run(id);
    expect(save()).toBe("readonly");
    mainDb.prepare("DELETE FROM collaboration_bindings WHERE content_id=?").run(id);
    for (const [kind, taskId] of [
      ["promoted", "a"],
      ["excluded", ""],
    ]) {
      mainDb
        .prepare(
          "INSERT INTO doc_task_settings(content_id,task_id,kind,create_time) VALUES(?,?,?,1)"
        )
        .run(id, taskId, kind);
      expect(save()).toBe("unavailable");
      expect(readDocTaskReminders(mainDb, id, "a")).toMatchObject({
        writable: false,
        reminders: [],
      });
      mainDb.prepare("DELETE FROM doc_task_settings WHERE content_id=?").run(id);
    }
  });

  it("老笔记单条 08:00 → 加 20:00 → 改 19:30 → 删 08:00，最终只为 19:30 排期", () => {
    const at0800 = new Date(2026, 10, 28, 8, 0, 0).toISOString();
    const at2000 = new Date(2026, 10, 28, 20, 0, 0).toISOString();
    const at1930 = new Date(2026, 10, 28, 19, 30, 0).toISOString();
    const legacyItem = {
      ...item("legacy-1", "老笔记勾选项"),
      taskReminder: { version: 1, at: at0800 },
    };
    const id = insertContent([list(legacyItem)]);
    insertCard(id);
    reindexDocTasks(mainDb, indexDb, [id]);

    const firstRead = readDocTaskReminders(mainDb, id, "legacy-1");
    expect(firstRead).toMatchObject({ ok: true, recurring: false, reminders: [{ at: at0800 }] });
    if (!firstRead.ok) throw new Error("unexpected");

    // 添加 20:00，保留原 08:00
    expect(
      setDocTaskReminders(
        mainDb,
        indexDb,
        id,
        "legacy-1",
        [{ at: at0800 }, { at: at2000 }],
        firstRead.digest
      )
    ).toBe("ok");

    const secondRead = readDocTaskReminders(mainDb, id, "legacy-1");
    expect(secondRead).toMatchObject({
      ok: true,
      reminders: [{ at: at0800 }, { at: at2000 }],
    });
    if (!secondRead.ok) throw new Error("unexpected");

    // 用旧 digest 写回被拒绝，不覆盖新值
    expect(
      setDocTaskReminders(mainDb, indexDb, id, "legacy-1", [{ at: at0800 }], firstRead.digest)
    ).toBe("conflict");

    // 把 20:00 改成 19:30，再删除 08:00
    expect(
      setDocTaskReminders(
        mainDb,
        indexDb,
        id,
        "legacy-1",
        [{ at: at0800 }, { at: at1930 }],
        secondRead.digest
      )
    ).toBe("ok");
    const thirdRead = readDocTaskReminders(mainDb, id, "legacy-1");
    if (!thirdRead.ok) throw new Error("unexpected");
    expect(
      setDocTaskReminders(mainDb, indexDb, id, "legacy-1", [{ at: at1930 }], thirdRead.digest)
    ).toBe("ok");

    // 排期窗口落在当天 23:00：只为 19:30 排期，08:00 与 20:00 均已移除
    const scheduled = assistantReminders(
      mainDb,
      indexDb,
      new Date(2026, 10, 28, 23, 0, 0).getTime()
    );
    expect(scheduled.map(entry => entry.remindAt)).toEqual([Date.parse(at1930)]);
  });

  it("重复正文勾选项当天完成后取消当天剩余提醒，次日仍按设置提醒", () => {
    const o0800 = hmToClockOffset(8, 0);
    const o2000 = hmToClockOffset(20, 0);
    const recurringItem = {
      ...item("rec-doc-1", "每天写复盘"),
      taskRecurrence: {
        version: 1,
        segments: [
          {
            seriesId: "s1",
            effectiveDate: "2026-11-28",
            rule: { type: "daily", interval: 1, startDate: "2026-11-28" },
          },
        ],
      },
      taskOccurrenceState: {
        "s1/2026-11-28": { completedAt: new Date(2026, 10, 28, 9, 0, 0).getTime() },
      },
    };
    const id = insertContent([list(recurringItem)]);
    insertCard(id);
    reindexDocTasks(mainDb, indexDb, [id]);

    const read = readDocTaskReminders(mainDb, id, "rec-doc-1");
    expect(read).toMatchObject({ ok: true, recurring: true, reminders: [] });
    if (!read.ok) throw new Error("unexpected");
    expect(
      setDocTaskReminders(
        mainDb,
        indexDb,
        id,
        "rec-doc-1",
        [{ offsetMs: o0800 }, { offsetMs: o2000 }],
        read.digest
      )
    ).toBe("ok");

    // 当天 21:00 检查：当天已完成，当天 20:00 不再触发
    const todayWindow = assistantReminders(
      mainDb,
      indexDb,
      new Date(2026, 10, 28, 21, 0, 0).getTime()
    );
    expect(todayWindow).toEqual([]);

    // 次日 21:00 检查：次日 08:00 和 20:00 仍正常排期
    const tomorrowWindow = assistantReminders(
      mainDb,
      indexDb,
      new Date(2026, 10, 29, 21, 0, 0).getTime()
    );
    expect(tomorrowWindow.map(entry => entry.remindAt)).toEqual([
      new Date(2026, 10, 29, 8, 0, 0).getTime(),
      new Date(2026, 10, 29, 20, 0, 0).getTime(),
    ]);
  });
});
