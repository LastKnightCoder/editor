import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Worker } from "node:worker_threads";
import { expect, it, vi } from "vitest";
vi.mock("electron");
vi.mock("../src-electron/main/modules/video-note-index-queue");
import { writePluginDirectory } from "../src-electron/main/modules/plugin-directories";
import { readDirectory } from "../src-electron/main/modules/task-assistant/catalog";
import { ensureMainSchema } from "../src-electron/main/modules/main-schema";
import Changes from "../src-electron/main/modules/tables/data-changes";
import ObjectEvents from "../src-electron/main/modules/tables/data-change-events";
import {
  queryDataChanges,
  type PluginChangesQuery,
} from "../../../packages/plugins/src/data-changes";
import { PluginSyncResetRequiredError } from "@tau/plugins";
import type { DirectoryWrite } from "@tau/plugins/host";

it("千个目录在改名、并发、重试和日志裁剪后与原始身份及内容对账", async () => {
  const directory = mkdtempSync(join(tmpdir(), "tau-directory-stress-"));
  const filename = join(directory, "directories.db");
  let db = new Database(filename);
  db.pragma("busy_timeout=15000");
  ensureMainSchema(db);
  const report: Record<string, unknown>[] = [];
  const measure = async (name: string, run: () => unknown | Promise<unknown>) => {
    const start = performance.now();
    const details = await run();
    report.push({ name, milliseconds: Math.round(performance.now() - start), details });
    process.stdout.write(JSON.stringify(report.at(-1)) + "\n");
  };
  const lists: string[] = [],
    calendars: string[] = [];
  const expected = new Set<string>();
  const create = (entity: "todo-list" | "calendar", title: string, key: string) =>
    writePluginDirectory(db, "stress", {
      entity,
      action: "create",
      input: { title },
      requestId: key,
    });
  const patch = (entity: "todo-list" | "calendar", id: string, patch: object) => {
    const current = readDirectory(db, entity, Number(id))!;
    return writePluginDirectory(db, "stress", {
      entity,
      action: "update",
      id,
      patch,
      expectedRevision: current.revision,
    } as DirectoryWrite);
  };
  const count = (table: string) =>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
  const head = () =>
    (
      db.prepare("SELECT seq FROM sqlite_sequence WHERE name='data_change_log'").get() as {
        seq: number;
      }
    ).seq;
  const bodies = () =>
    createHash("sha256")
      .update(
        JSON.stringify(db.prepare("SELECT id,create_time,content FROM contents ORDER BY id").all())
      )
      .digest("hex");
  const events = () =>
    createHash("sha256")
      .update(JSON.stringify(db.prepare("SELECT * FROM calendar_event ORDER BY id").all()))
      .digest("hex");
  const todoRows = () =>
    createHash("sha256")
      .update(JSON.stringify(db.prepare("SELECT * FROM todo_item ORDER BY id").all()))
      .digest("hex");
  const query = (input: PluginChangesQuery) =>
    queryDataChanges(input, "stress", async request =>
      Changes.read(db, request, "directory-stress")
    );
  const drain = async (input: PluginChangesQuery, during?: (page: number) => void) => {
    const seen = new Set<string>();
    let page,
      pages = 0;
    do {
      page = await query({ ...input, ...(page ? { cursor: page.cursor } : {}) });
      for (const item of page.items) {
        const key = `${item.domain}:${item.id}`;
        if (item.operation === "delete") seen.delete(key);
        else seen.add(key);
      }
      pages++;
      during?.(pages);
      expect(pages).toBeLessThan(10000);
    } while (page.hasMore);
    expect(page.checkpoint).toBeTypeOf("string");
    return { seen, checkpoint: page.checkpoint!, pages };
  };
  try {
    await measure("seed-1000-directories-10000-items-10000-body-tasks", () => {
      for (let n = 0; n < 500; n++) {
        lists.push(create("todo-list", `项目${n}`, `list-${n}`).id);
        calendars.push(create("calendar", `日历${n}`, `calendar-${n}`).id);
        expected.add(`todo-list:${lists[n]}`);
        expected.add(`calendar:${calendars[n]}`);
      }
      db.transaction(() => {
        for (let n = 0; n < 5000; n++) {
          const todo = db
            .prepare(
              "INSERT INTO todo_item(group_id,title,create_time,update_time) VALUES(?,'原待办',200,200)"
            )
            .run(lists[n % 500]);
          expected.add(`todo:todo:${todo.lastInsertRowid}:200`);
          const event = db
            .prepare(
              "INSERT INTO calendar_event(calendar_id,title,start_date,create_time,update_time) VALUES(?,'原日程',1,200,200)"
            )
            .run(calendars[n % 500]);
          expected.add(`event:${event.lastInsertRowid}:200`);
        }
        for (let n = 0; n < 100; n++) {
          const nodes = [
            {
              type: "check-list",
              children: Array.from({ length: 100 }, (_, task) => ({
                type: "check-list-item",
                taskId: `task-${task}`,
                checked: false,
                children: [
                  {
                    type: "paragraph",
                    children: [{ type: "formatted", text: `正文任务${task} #项目${n}` }],
                  },
                ],
              })),
            },
          ];
          db.prepare(
            "INSERT INTO contents(id,create_time,update_time,content,ref_count) VALUES(?,300,300,?,1)"
          ).run(1000 + n, JSON.stringify(nodes));
          db.prepare(
            "INSERT INTO articles(title,content_id,create_time,update_time) VALUES('原文',?,300,300)"
          ).run(1000 + n);
          for (let task = 0; task < 100; task++)
            expected.add(`todo:document:${1000 + n}:300:task-${task}`);
        }
      })();
      return {
        directories: lists.length + calendars.length,
        items: count("todo_item") + count("calendar_event"),
        bodyTasks: count("document_task_identities"),
      };
    });
    const originalBodies = bodies(),
      originalEvents = events(),
      originalTodos = todoRows();
    let checkpoint = "";
    let objectCursor = ObjectEvents.read(db, null).cursor;
    const notifications = () => {
      let page = ObjectEvents.read(db, objectCursor, 0);
      const ids = new Set<string>();
      let pages = 0;
      do {
        if (page.reset) throw new Error("对象通知历史断档");
        for (const event of page.events) {
          expect(typeof event.id).toBe("string");
          ids.add(`${event.type}:${event.id}`);
        }
        objectCursor = page.cursor;
        pages++;
        if (!page.hasMore) break;
        page = ObjectEvents.read(db, objectCursor, 0);
      } while (true);
      return { ids, pages };
    };
    await measure("snapshot-with-directory-changes", async () => {
      const result = await drain(
        { domains: ["todo", "event", "todo-list", "calendar"], todoSource: "all", limit: 73 },
        page => {
          if (page === 5) {
            patch("todo-list", lists[0], { title: "评审准备" });
            calendars.push(create("calendar", "期间新增", "during-scan").id);
            expected.add(`calendar:${calendars.at(-1)}`);
          }
        }
      );
      checkpoint = result.checkpoint;
      expect(result.seen).toEqual(expected);
      const notices = notifications();
      const wanted = new Set<string>([
        `todo-list.updated:${lists[0]}`,
        `calendar.created:${calendars.at(-1)}`,
      ]);
      for (let n = 0; n < 100; n++)
        for (let task = 0; task < 100; task++)
          wanted.add(`todo.updated:document:${1000 + n}:300:task-${task}`);
      for (let n = 0; n < 5000; n += 500) wanted.add(`todo.updated:todo:${n + 1}:200`);
      expect(notices.ids).toEqual(wanted);
      return { pages: result.pages, identities: result.seen.size };
    });
    await measure("four-connections-compete-with-host-color-updates", async () => {
      const stale = calendars.slice(0, 4).map(id => readDirectory(db, "calendar", Number(id))!);
      const driver = createRequire(
        resolve(__dirname, "../../collaboration-server/package.json")
      ).resolve("better-sqlite3");
      const workers = calendars.slice(0, 4).map(
        (id, worker) =>
          new Promise<void>((resolve, reject) => {
            const thread = new Worker(
              `const {workerData}=require('node:worker_threads');const Database=require(workerData.driver);const db=new Database(workerData.filename);db.pragma('busy_timeout=15000');for(let i=0;i<300;i++){db.transaction(()=>{db.prepare('UPDATE calendar SET title=?,update_time=? WHERE id=?').run('writer-'+workerData.worker+'-'+i,i,workerData.id)})();}db.close();`,
              { eval: true, workerData: { filename, driver, id, worker } }
            );
            thread.on("error", reject);
            thread.on("exit", code =>
              code === 0 ? resolve() : reject(new Error(`writer ${code}`))
            );
          })
      );
      const before = head();
      for (let n = 0; n < lists.length; n++) patch("todo-list", lists[n], { color: "red" });
      expect(
        db
          .prepare(
            "SELECT entity_id FROM data_change_log WHERE seq>? AND domain='todo' AND entity_id LIKE 'document:%'"
          )
          .all(before)
      ).toEqual([]);
      await Promise.all(workers);
      for (let n = 0; n < 4; n++) {
        expect(readDirectory(db, "calendar", Number(calendars[n]))?.title).toBe(`writer-${n}-299`);
        expect(() =>
          writePluginDirectory(db, "stress", {
            entity: "calendar",
            action: "update",
            id: stale[n].id,
            patch: { title: "过期修改" },
            expectedRevision: stale[n].revision,
          })
        ).toThrow(/PLUGIN_CONFLICT/);
      }
      const notices = notifications();
      const wanted = new Set<string>();
      for (let n = 0; n < 500; n++) wanted.add(`todo-list.updated:${lists[n]}`);
      for (let n = 0; n < 5000; n++) wanted.add(`todo.updated:todo:${n + 1}:200`);
      for (let n = 0; n < 4; n++) {
        wanted.add(`calendar.updated:${calendars[n]}`);
        for (let event = n; event < 5000; event += 500)
          wanted.add(`event.updated:${event + 1}:200`);
      }
      expect(notices.ids).toEqual(wanted);
      return {
        connections: 4,
        competingTransactions: 1200,
        colorUpdates: 500,
        objectNotifications: notices.ids.size,
      };
    });
    await measure("no-op-and-create-replay-have-no-extra-log", () => {
      const before = head();
      for (let n = 0; n < 500; n++) {
        expect(create("todo-list", `项目${n}`, `list-${n}`).id).toBe(lists[n]);
        expect(create("calendar", `日历${n}`, `calendar-${n}`).id).toBe(calendars[n]);
        patch("todo-list", lists[n], { color: "red" });
      }
      expect(head()).toBe(before);
      expect(notifications().ids.size).toBe(0);
      return { retries: 1000, noOpUpdates: 500 };
    });
    await measure("receipt-failures-roll-back-all-effects", () => {
      const before = head(),
        directories = count("calendar"),
        receipts = count("plugin_create_receipts");
      db.exec(
        "CREATE TRIGGER injected_receipt BEFORE INSERT ON plugin_create_receipts BEGIN SELECT RAISE(ABORT,'injected'); END"
      );
      for (let n = 0; n < 100; n++)
        expect(() => create("calendar", "失败", `fail-${n}`)).toThrow(/injected/);
      db.exec("DROP TRIGGER injected_receipt");
      expect(count("calendar")).toBe(directories);
      expect(count("plugin_create_receipts")).toBe(receipts);
      expect(head()).toBe(before);
      expect(notifications().ids.size).toBe(0);
      return { rollbacks: 100 };
    });
    await measure("rename-fanout-requires-reset-and-reconciles", async () => {
      for (let n = 0; n < 20; n++) patch("todo-list", lists[n], { title: `同步项目${n}` });
      await expect(
        query({
          domains: ["todo", "event", "todo-list", "calendar"],
          todoSource: "all",
          cursor: checkpoint,
          limit: 73,
        })
      ).rejects.toBeInstanceOf(PluginSyncResetRequiredError);
      expect(count("data_change_log")).toBeLessThanOrEqual(100000);
      const reset = ObjectEvents.read(db, objectCursor);
      expect(reset).toMatchObject({ reset: true, events: [] });
      objectCursor = reset.cursor;
      const full = await drain({
        domains: ["todo", "event", "todo-list", "calendar"],
        todoSource: "all",
        limit: 100,
      });
      expect(full.seen).toEqual(expected);
      checkpoint = full.checkpoint;
      return {
        renames: 20,
        identities: full.seen.size,
        retainedLog: count("data_change_log"),
        pages: full.pages,
      };
    });
    await measure("reopen-resume-and-verify-data", async () => {
      db.close();
      db = new Database(filename);
      db.pragma("busy_timeout=15000");
      ensureMainSchema(db);
      const empty = await drain({
        domains: ["todo", "event", "todo-list", "calendar"],
        todoSource: "all",
        cursor: checkpoint,
        limit: 100,
      });
      expect(empty.seen.size).toBe(0);
      for (let n = 0; n < 500; n++) {
        const list = create("todo-list", `项目${n}`, `list-${n}`);
        expect(list).toMatchObject({ title: n < 20 ? `同步项目${n}` : `项目${n}`, color: "red" });
      }
      expect(bodies()).toBe(originalBodies);
      expect(events()).toBe(originalEvents);
      expect(todoRows()).toBe(originalTodos);
      expect(db.pragma("integrity_check")).toEqual([{ integrity_check: "ok" }]);
      expect(db.pragma("foreign_key_check")).toEqual([]);
      return {
        directories: count("todo_group") + count("calendar"),
        unchangedBodies: true,
        unchangedItems: true,
      };
    });
    process.stdout.write(JSON.stringify({ report, directory }) + "\n");
  } finally {
    if (db.open) db.close();
  }
}, 180000);
