// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import * as Y from "yjs";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import schema from "@tau/db-schema/schema/main.sql?raw";
import { prepareWhiteboardContract } from "@tau/db-schema/content-contracts";
import { WhiteboardModel } from "@tau/collaboration";
import { ContentIdentityTable } from "../../tables/content-identity";
import { WhiteboardJournal, journalKey } from "../journal";
import { WhiteboardDocumentSessions } from "../sessions";
import { WhiteboardDocumentRepository } from "../repository";
import {
  assertLegacyWhiteboard,
  assertLegacyWhiteboardPage,
} from "../../whiteboard-document-guard";
import { must } from "../../../test-support";

const cleanups: (() => void)[] = [];
afterEach(() =>
  cleanups
    .splice(0)
    .reverse()
    .forEach(fn => fn())
);
function database(filename = ":memory:") {
  const db = new Database(filename);
  db.exec(schema);
  ContentIdentityTable.establishBaseline(db);
  cleanups.push(() => {
    if (db.open) db.close();
  });
  return db;
}
function document(state?: Uint8Array) {
  const doc = new Y.Doc({ gc: false });
  if (state) Y.applyUpdate(doc, state);
  cleanups.push(() => doc.destroy());
  return new WhiteboardModel(doc);
}
async function fixture(file = false) {
  const dir = mkdtempSync(join(tmpdir(), "whiteboard-w4-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  let db = database(file ? join(dir, "main.db") : ":memory:");
  const journal = new WhiteboardJournal(file ? join(dir, "journal.db") : ":memory:");
  cleanups.push(() => {
    if (journal.db.open) journal.close();
  });
  const counts = vi.fn(
    (
      db: Database.Database,
      kind: "whiteboard-content" | "data-table",
      id: number,
      delta: number
    ) => {
      db.prepare(
        `UPDATE ${kind === "data-table" ? "data_tables" : "white_board_contents"} SET ref_count=MAX(0,COALESCE(ref_count,0)+?) WHERE id=?`
      ).run(delta, id);
    }
  );
  const events: unknown[] = [];
  const sessions = new WhiteboardDocumentSessions(
    journal,
    () => db,
    (owner, event) => events.push({ owner, event }),
    counts
  );
  cleanups.push(() => sessions.dispose());
  const model = document();
  const shape = await prepareWhiteboardContract("example", {
    type: "example.shape",
    dataVersion: 1,
    collaboration: { textFields: ["source"] },
    structure: { reference: "entity" },
  });
  await model.installContracts({ [shape.id]: shape.contract });
  const [p1, p2] = model.submit(
    [
      { type: "create_page", title: "甲" },
      { type: "create_page", title: "乙" },
    ],
    null
  ).createdIds;
  const id = model.submit(
    [
      {
        type: "create",
        contractId: shape.id,
        data: {},
        geometry: { x: 0, y: 0, width: 20, height: 20, rotation: 0 },
        parent: { kind: "page", id: p1 },
      },
    ],
    null
  ).createdIds[0];
  const created = await sessions.create("A", "doc", Y.encodeStateAsUpdate(model.doc), "board");
  return {
    db,
    swap: (next: Database.Database) => {
      db = next;
    },
    dir,
    journal,
    sessions,
    model,
    created,
    p1,
    p2,
    id,
    events,
    counts,
  };
}
/** 会话备份丢弃的日志（内存日志落在系统临时目录，每个用例前清空） */
const backups = join(tmpdir(), "tau-whiteboard-documents");
beforeEach(() => rmSync(backups, { recursive: true, force: true }));
function discarded(_fixture?: unknown) {
  const directory = join(backups, "discarded");
  if (!existsSync(directory)) return [];
  return readdirSync(directory).map(file =>
    JSON.parse(readFileSync(join(directory, file), "utf8"))
  ) as { reason: string; document: Record<string, unknown> }[];
}
function delta(model: WhiteboardModel, fn: () => void): Uint8Array {
  const list: Uint8Array[] = [];
  const listen = (u: Uint8Array) => list.push(u);
  model.doc.on("update", listen);
  try {
    fn();
  } finally {
    model.doc.off("update", listen);
  }
  return Y.mergeUpdates(list);
}

describe("W4 主进程白板会话与耐久投影", () => {
  it("多页同文档、多窗口不同持有；一个窗口释放不关闭其他窗口", async () => {
    const f = await fixture();
    const a = await f.sessions.open("A", f.created.contentIds[0], 1, "a"),
      b = await f.sessions.open("A", f.created.contentIds[1], 2, "b");
    expect(a.identity).toEqual(b.identity);
    expect(a.leaseId).not.toBe(b.leaseId);
    expect(b.pageId).toBe(f.p2);
    expect((await f.sessions.open("A", f.created.contentIds[0], 1, "a")).leaseId).toBe(a.leaseId);
    await f.sessions.release(a.leaseId, 1);
    expect(f.sessions.holders()).toHaveLength(1);
    expect(f.sessions.snapshot(b.leaseId, 2).pageId).toBe(f.p2);
    expect(() => f.sessions.snapshot(b.leaseId, 1)).toThrow("失效");
  });
  it("增量先落日志，再更新所有页投影，重复批次不重复提交", async () => {
    const f = await fixture(),
      a = await f.sessions.open("A", f.created.contentIds[0], 1, "a"),
      client = document(a.state);
    const update = delta(client, () =>
      client.submit(
        [
          { type: "move_node", id: f.id, parent: { kind: "page", id: f.p2 } },
          {
            type: "edit_text",
            id: f.id,
            field: "source",
            edit: { offset: 0, remove: 0, text: "保存" },
          },
        ],
        {}
      )
    );
    expect(await f.sessions.append(a.leaseId, 1, "batch", update)).toEqual({
      revision: 1,
      projectedRevision: 1,
    });
    const pages = f.db
      .prepare(
        "SELECT p.page_id,c.data FROM whiteboard_document_pages p JOIN white_board_contents c ON c.id=p.content_id ORDER BY p.page_index"
      )
      .all() as { page_id: string; data: string }[];
    expect(JSON.parse(pages[0].data).children).toEqual([]);
    expect(JSON.parse(pages[1].data).children[0].data.source).toBe("保存");
    await f.sessions.append(a.leaseId, 1, "batch", update);
    expect(f.journal.db.prepare("SELECT COUNT(*) AS n FROM updates").get()).toEqual({ n: 1 });
    expect(f.journal.db.prepare("SELECT length(state) AS bytes FROM updates").get()).toEqual({
      bytes: 0,
    });
    await expect(f.sessions.append(a.leaseId, 1, "batch", new Uint8Array([0, 0]))).rejects.toThrow(
      "复用"
    );
  });
  it("日志写失败不改内存和主库、不广播；同批次可重试", async () => {
    const f = await fixture(),
      a = await f.sessions.open("A", f.created.contentIds[0], 1, "a"),
      client = document(a.state);
    const update = delta(client, () =>
      client.submit(
        [
          {
            type: "edit_text",
            id: f.id,
            field: "source",
            edit: { offset: 0, remove: 0, text: "未丢" },
          },
        ],
        {}
      )
    );
    f.journal.db.exec(
      "CREATE TRIGGER fail BEFORE INSERT ON updates BEGIN SELECT RAISE(ABORT,'disk full'); END;"
    );
    await expect(f.sessions.append(a.leaseId, 1, "one", update)).rejects.toThrow("disk full");
    expect(f.sessions.snapshot(a.leaseId, 1).state).toEqual(a.state);
    expect(f.events).toEqual([]);
    f.journal.db.exec("DROP TRIGGER fail");
    expect((await f.sessions.append(a.leaseId, 1, "one", update)).revision).toBe(1);
  });
  it("日志提交后投影失败，关页失败仍保留持有；重启幂等恢复最高耐久状态", async () => {
    const f = await fixture(true),
      a = await f.sessions.open("A", f.created.contentIds[0], 1, "a"),
      client = document(a.state);
    const update = delta(client, () =>
      client.submit(
        [
          {
            type: "edit_text",
            id: f.id,
            field: "source",
            edit: { offset: 0, remove: 0, text: "崩溃后保留" },
          },
        ],
        {}
      )
    );
    f.db.exec(
      "CREATE TRIGGER fail BEFORE UPDATE ON whiteboard_documents BEGIN SELECT RAISE(ABORT,'projection failed'); END;"
    );
    const receipt = await f.sessions.append(a.leaseId, 1, "one", update);
    expect(receipt).toMatchObject({
      revision: 1,
      projectedRevision: 0,
      error: "projection failed",
    });
    await expect(f.sessions.release(a.leaseId, 1)).rejects.toThrow();
    expect(f.sessions.holders()).toHaveLength(1);
    f.sessions.dispose();
    f.journal.close();
    f.db.close();
    const db = database(join(f.dir, "main.db"));
    db.exec("DROP TRIGGER fail");
    const journal = new WhiteboardJournal(join(f.dir, "journal.db"));
    cleanups.push(() => journal.close());
    const next = new WhiteboardDocumentSessions(
      journal,
      () => db,
      () => {},
      f.counts
    );
    cleanups.push(() => next.dispose());
    const opened = await next.open("A", f.created.contentIds[0], 3, "next");
    expect(opened).toMatchObject({ revision: 1, projectedRevision: 1 });
    expect(document(opened.state).read().pages[0].children[0].data.source).toBe("崩溃后保留");
  });
  it("主库已提交但日志完成标记失败，重开不重复关系计数", async () => {
    const f = await fixture(),
      a = await f.sessions.open("A", f.created.contentIds[0], 1, "a");
    f.db
      .prepare(
        "INSERT INTO white_board_contents(id,create_time,update_time,data,ref_count) VALUES(900,1,1,'{}',0)"
      )
      .run();
    const target = ContentIdentityTable.bind(f.db, "whiteboard-content", 900, 1);
    const client = document(a.state);
    const update = delta(client, () =>
      client.submit([{ type: "set_entity", id: f.id, entity: target }], {})
    );
    f.journal.db.exec(
      "CREATE TRIGGER fail BEFORE UPDATE OF projected_revision ON documents BEGIN SELECT RAISE(ABORT,'receipt failed'); END;"
    );
    expect((await f.sessions.append(a.leaseId, 1, "ref", update)).error).toBe("receipt failed");
    expect(f.counts).toHaveBeenCalledTimes(1);
    f.journal.db.exec("DROP TRIGGER fail");
    await f.sessions.flush(a.leaseId, 1);
    expect(f.counts).toHaveBeenCalledTimes(1);
    expect(f.db.prepare("SELECT ref_count FROM white_board_contents WHERE id=900").get()).toEqual({
      ref_count: 1,
    });
  });
  it("关系差集和页投影同事务回滚；旧引用单独进入本机历史持有", async () => {
    const f = await fixture(),
      a = await f.sessions.open("A", f.created.contentIds[0], 1, "a");
    f.db
      .prepare(
        "INSERT INTO white_board_contents(id,create_time,update_time,data,ref_count) VALUES(900,1,1,'{}',0)"
      )
      .run();
    const target = ContentIdentityTable.bind(f.db, "whiteboard-content", 900, 1),
      client = document(a.state);
    const first = delta(client, () =>
      client.submit([{ type: "set_entity", id: f.id, entity: target }], {})
    );
    await f.sessions.append(a.leaseId, 1, "ref", first);
    const second = delta(client, () =>
      client.submit([{ type: "set_entity", id: f.id, entity: null }], {})
    );
    f.db.exec(
      "CREATE TRIGGER fail BEFORE UPDATE ON whiteboard_documents BEGIN SELECT RAISE(ABORT,'rollback'); END;"
    );
    await f.sessions.append(a.leaseId, 1, "clear", second);
    expect(f.db.prepare("SELECT ref_count FROM white_board_contents WHERE id=900").get()).toEqual({
      ref_count: 1,
    });
    f.db.exec("DROP TRIGGER fail");
    await f.sessions.flush(a.leaseId, 1);
    expect(f.db.prepare("SELECT COUNT(*) AS n FROM whiteboard_entity_relations").get()).toEqual({
      n: 0,
    });
    expect(f.journal.holds("A")).toContainEqual(target);
  });
  it("库连接替换和来源基线改变拒绝旧会话写入，不覆盖新库", async () => {
    const f = await fixture(),
      a = await f.sessions.open("A", f.created.contentIds[0], 1, "a"),
      before = must(
        f.journal.load(journalKey(a.identity)),
        "f.journal.load(journalKey(a.identity))"
      ).state;
    f.swap(database());
    await expect(f.sessions.flush(a.leaseId, 1)).rejects.toThrow("代次");
    expect(
      must(f.journal.load(journalKey(a.identity)), "f.journal.load(journalKey(a.identity))").state
    ).toEqual(before);
    f.swap(f.db);
    f.db.prepare("UPDATE library_identity SET baseline_id='new'").run();
    await expect(f.sessions.flush(a.leaseId, 1)).rejects.toThrow("基线");
  });
  it("整库回退到较旧投影时按主库打开，领先的日志备份保留不自动写回", async () => {
    const f = await fixture(),
      a = await f.sessions.open("A", f.created.contentIds[0], 1, "a"),
      old = f.db.prepare("SELECT revision_hash,state FROM whiteboard_documents").get() as {
        revision_hash: string;
        state: Buffer;
      };
    const client = document(a.state),
      update = delta(client, () =>
        client.submit([{ type: "edit_title", edit: { offset: 0, remove: 0, text: "新" } }], {})
      );
    await f.sessions.append(a.leaseId, 1, "new", update);
    await f.sessions.release(a.leaseId, 1);
    f.db
      .prepare("UPDATE whiteboard_documents SET revision=0,revision_hash=?,state=?")
      .run(old.revision_hash, old.state);
    const reopened = await f.sessions.open("A", f.created.contentIds[0], 1, "again");
    expect(document(reopened.state).title.toString()).not.toContain("新");
    expect(discarded(f).some(entry => entry.reason.includes("分叉"))).toBe(true);
    expect(
      must(
        discarded(f).find(entry => entry.reason.includes("分叉")),
        "discarded(f).find(entry => entry.reason.inclu..."
      ).document.revision
    ).toBe(1);
  });
  it("整库被另一台设备的较新版本替换：释放旧日志后按新库打开", async () => {
    const f = await fixture(),
      a = await f.sessions.open("A", f.created.contentIds[0], 1, "a");
    const edit = (state: Uint8Array, text: string) => {
      const client = document(state);
      return delta(client, () =>
        client.submit([{ type: "edit_title", edit: { offset: 0, remove: 0, text } }], {})
      );
    };
    await f.sessions.append(a.leaseId, 1, "a1", edit(a.state, "甲"));
    await f.sessions.release(a.leaseId, 1);
    // 另一台设备在同一份白板上又编辑了两次，并把整库上传；本机下载后主库领先于本机日志
    const local = must(
      f.journal.load(journalKey(a.identity)),
      "f.journal.load(journalKey(a.identity))"
    );
    const remote = document(local.state);
    remote.submit([{ type: "edit_title", edit: { offset: 0, remove: 0, text: "乙" } }], {});
    const remoteState = Y.encodeStateAsUpdate(remote.doc);
    const remoteHash = createHash("sha256").update(remoteState).digest("hex");
    f.db
      .prepare("UPDATE whiteboard_documents SET revision=3,revision_hash=?,state=?")
      .run(remoteHash, Buffer.from(remoteState));
    // 不再需要先释放日志：打开时备份分叉的旧日志，直接按新库打开
    const reopened = await f.sessions.open("A", f.created.contentIds[0], 1, "fresh");
    expect(document(reopened.state).title.toString()).toBe("乙甲");
    expect(
      must(f.journal.load(journalKey(a.identity)), "f.journal.load(journalKey(a.identity))")
        .revision
    ).toBe(3);
    expect(discarded(f)).toHaveLength(1);
  });
  it("资料库替换前仍有未投影或在编的白板时拒绝释放日志", async () => {
    const f = await fixture(),
      a = await f.sessions.open("A", f.created.contentIds[0], 1, "a");
    expect(() => f.sessions.releaseLibrary("A")).toThrow("仍在编辑");
    await f.sessions.release(a.leaseId, 1);
    // 模拟日志已提交但尚未投影进主库的改动
    f.journal.db.prepare("UPDATE documents SET projected_hash='pending'").run();
    expect(() => f.sessions.releaseLibrary("A")).toThrow("未保存进资料库");
    expect(f.journal.load(journalKey(a.identity))).not.toBeNull();
  });
  it("损坏日志备份原字节后按主库重建，白板照常打开", async () => {
    const f = await fixture(),
      a = await f.sessions.open("A", f.created.contentIds[0], 1, "a");
    await f.sessions.release(a.leaseId, 1);
    f.journal.db.prepare("UPDATE documents SET state=?").run(Buffer.from([1, 2, 3]));
    const reopened = await f.sessions.open("A", f.created.contentIds[0], 1, "again");
    expect(document(reopened.state).pages.size).toBe(2);
    const [entry] = discarded(f);
    expect(entry.reason).toContain("摘要损坏");
    expect(Buffer.from(entry.document.state as string, "base64")).toEqual(Buffer.from([1, 2, 3]));
  });
  describe("主库检查点自愈", () => {
    const edited = async (f: Awaited<ReturnType<typeof fixture>>) => {
      const a = await f.sessions.open("A", f.created.contentIds[0], 1, "a"),
        client = document(a.state);
      await f.sessions.append(
        a.leaseId,
        1,
        "t",
        delta(client, () =>
          client.submit([{ type: "edit_title", edit: { offset: 0, remove: 0, text: "标题" } }], {})
        )
      );
      await f.sessions.release(a.leaseId, 1);
      // 模拟重启：内存会话与日志都不在，只剩主库
      f.sessions.dispose();
      f.journal.db.exec("DELETE FROM holds; DELETE FROM updates; DELETE FROM documents;");
      return new WhiteboardDocumentSessions(f.journal, () => f.db);
    };
    const repairs = () =>
      existsSync(join(backups, "repairs")) ? readdirSync(join(backups, "repairs")) : [];
    for (const [name, corrupt] of [
      [
        "摘要不符",
        (db: Database.Database) =>
          db.prepare("UPDATE whiteboard_documents SET revision_hash='x'").run(),
      ],
      [
        "检查点字节损坏",
        (db: Database.Database) =>
          db.prepare("UPDATE whiteboard_documents SET state=?,revision_hash=?").run(
            Buffer.from([1, 2, 3]),
            createHash("sha256")
              .update(Buffer.from([1, 2, 3]))
              .digest("hex")
          ),
      ],
    ] as const)
      it(`${name}：按主库快照修复后打开，元素与标题不丢，原记录有备份`, async () => {
        const f = await fixture(),
          sessions = await edited(f);
        cleanups.push(() => sessions.dispose());
        corrupt(f.db);
        const opened = await sessions.open("A", f.created.contentIds[0], 1, "b"),
          model = document(opened.state);
        expect(model.title.toString()).toBe("标题");
        expect(model.read().pages[0].children.map(node => node.id)).toEqual([f.id]);
        expect(repairs()).toHaveLength(1);
        // 修复后的检查点合格，再次打开不再修复
        await sessions.release(opened.leaseId, 1);
        sessions.dispose();
        await new WhiteboardDocumentSessions(f.journal, () => f.db).open(
          "A",
          f.created.contentIds[0],
          1,
          "c"
        );
        expect(repairs()).toHaveLength(1);
      });
  });
  it("来源基线错位不改写，保持报错且检查点不动", async () => {
    const f = await fixture();
    f.db.prepare("UPDATE whiteboard_documents SET baseline_id='old'").run();
    const before = f.db.prepare("SELECT revision_hash FROM whiteboard_documents").get();
    await expect(f.sessions.open("A", f.created.contentIds[0], 1, "x")).rejects.toThrow("基线");
    expect(
      f.db.prepare("SELECT revision_hash,baseline_id FROM whiteboard_documents").get()
    ).toEqual({
      ...(before as object),
      baseline_id: "old",
    });
  });
  it.each(["先删", "交错", "后删"])(
    "%s时各窗口的迟到保存和重试不会恢复已删页",
    async order => {
      const f = await fixture(true);
      const first = await f.sessions.open("A", f.created.contentIds[0], 1, "delete");
      const deleting = document(first.state);
      const remove = delta(deleting, () =>
        deleting.submit([{ type: "remove_page", id: f.p1, observedElementIds: [f.id] }], null)
      );
      const stress = process.env.TAU_WHITEBOARD_DELETE_STRESS === "1";
      const saves: (() => Promise<unknown>)[] = [];
      const markers: string[] = [];
      for (let writer = 0; writer < (stress ? 32 : 2); writer++) {
        const owner = writer + 2;
        const view = await f.sessions.open("A", f.created.contentIds[0], owner, "edit");
        const client = document(view.state);
        for (let edit = 0; edit < (stress ? 8 : 1); edit++) {
          const batch = `[${writer}-${edit}]`;
          markers.push(batch);
          const update = delta(client, () =>
            client.submit(
              [
                { type: "edit_page_title", id: f.p1, edit: { offset: 0, remove: 0, text: "旧" } },
                { type: "edit_page_title", id: f.p2, edit: { offset: 0, remove: 0, text: batch } },
              ],
              null
            )
          );
          saves.push(() => f.sessions.append(view.leaseId, owner, batch, update));
        }
      }
      const writes = [...saves];
      const at =
        order === "先删" ? 0 : order === "后删" ? writes.length : Math.floor(writes.length / 2);
      writes.splice(at, 0, () => f.sessions.append(first.leaseId, 1, "delete", remove));
      const deliver = async (requests: typeof writes) => {
        let pending = requests;
        while (pending.length) {
          const results = await Promise.allSettled(pending.map(write => write()));
          const retry = pending.filter((_, index) => {
            const result = results[index];
            if (result.status === "fulfilled") return false;
            if (result.reason?.code !== "CAPACITY") throw result.reason;
            return true;
          });
          if (retry.length === pending.length) throw new Error("没有写入获得回执");
          pending = retry;
        }
      };
      await deliver(writes);
      await deliver(writes);

      f.sessions.dispose();
      f.journal.close();
      f.db.close();
      const disk = new Database(join(f.dir, "main.db"));
      const journal = new WhiteboardJournal(join(f.dir, "journal.db"));
      const reopened = new WhiteboardDocumentSessions(journal, () => disk);
      try {
        const saved = disk
          .prepare(
            "SELECT white_board_content_ids AS ids, active_white_board_content_id AS active FROM white_boards WHERE id=?"
          )
          .get(f.created.boardId) as { ids: string; active: number };
        expect(JSON.parse(saved.ids)).toEqual([f.created.contentIds[1]]);
        expect(saved.active).toBe(f.created.contentIds[1]);
        const view = await reopened.open("A", saved.active, 1, "reopen");
        expect(view.revision).toBe(first.revision + saves.length + 1);
        const pages = document(view.state).read().pages;
        expect(pages.map(page => page.id)).toEqual([f.p2]);
        expect((pages[0].title.match(/\[\d+-\d+\]/g) ?? []).sort()).toEqual(markers.sort());
      } finally {
        reopened.dispose();
        journal.close();
        disk.close();
      }
    },
    90_000
  );

  it("新格式页拒绝旧快照写入口，页映射不因删除/撤销而重分配", async () => {
    const f = await fixture(),
      a = await f.sessions.open("A", f.created.contentIds[0], 1, "a"),
      client = document(a.state),
      origin = {};
    const history = client.createUndoManager({ trackedOrigins: new Set([origin]) });
    expect(() => assertLegacyWhiteboardPage(f.db, f.created.contentIds[0])).toThrow(
      "WRITE_REQUIRED"
    );
    expect(() =>
      assertLegacyWhiteboard(f.db, must(f.created.boardId, "f.created.boardId"))
    ).toThrow("WRITE_REQUIRED");
    const update = delta(client, () =>
      client.submit([{ type: "remove_page", id: f.p1, observedElementIds: [f.id] }], origin)
    );
    await f.sessions.append(a.leaseId, 1, "delete", update);
    const undo = delta(client, () => history.undo());
    await f.sessions.append(a.leaseId, 1, "undo", undo);
    history.destroy();
    expect(
      must(new WhiteboardDocumentRepository(f.db, "A").byPage(f.created.contentIds[0]), "byPage")
        .pageId
    ).toBe(f.p1);
  });
  it("创建回执丢失后重试不会覆盖后来编辑，也不会再分配页面", async () => {
    const f = await fixture(),
      initial = Y.encodeStateAsUpdate(f.model.doc),
      opened = await f.sessions.open("A", f.created.contentIds[0], 1, "a"),
      client = document(opened.state);
    const update = delta(client, () =>
      client.submit([{ type: "edit_title", edit: { offset: 0, remove: 0, text: "之后编辑" } }], {})
    );
    await f.sessions.append(opened.leaseId, 1, "title", update);
    const retry = await f.sessions.create("A", "doc", initial, "board");
    expect(retry).toEqual(f.created);
    expect(f.db.prepare("SELECT title FROM white_boards").get()).toEqual({ title: "之后编辑" });
  });
  it("同文档 ID 在两个本机库中使用独立日志槽，不串写", async () => {
    const f = await fixture(),
      second = new Database(f.db.serialize());
    cleanups.push(() => second.close());
    const sessions = new WhiteboardDocumentSessions(f.journal, name =>
      name === "A" ? f.db : second
    );
    cleanups.push(() => sessions.dispose());
    const a = await sessions.open("A", f.created.contentIds[0], 1, "a"),
      b = await sessions.open("B", f.created.contentIds[0], 2, "b"),
      client = document(a.state);
    const update = delta(client, () =>
      client.submit([{ type: "edit_title", edit: { offset: 0, remove: 0, text: "只改 A" } }], {})
    );
    await sessions.append(a.leaseId, 1, "one", update);
    expect(journalKey(a.identity)).not.toBe(journalKey(b.identity));
    expect(sessions.snapshot(b.leaseId, 2).revision).toBe(0);
    expect(second.prepare("SELECT title FROM white_boards").get()).toEqual({ title: "" });
  });
  it("窗口在接收校验期间崩溃，已进入主进程的合法更新仍可完成耐久保存", async () => {
    const f = await fixture(),
      a = await f.sessions.open("A", f.created.contentIds[0], 1, "a"),
      client = document(a.state);
    const update = delta(client, () =>
      client.submit(
        [{ type: "edit_title", edit: { offset: 0, remove: 0, text: "收到即保全" } }],
        {}
      )
    );
    let resume!: () => void;
    const gate = new Promise<void>(resolve => {
      resume = resolve;
    });
    const receive = WhiteboardModel.prototype.receive;
    const spy = vi.spyOn(WhiteboardModel.prototype, "receive").mockImplementation(async function (
      this: WhiteboardModel,
      input
    ) {
      await gate;
      return receive.call(this, input);
    });
    try {
      const saving = f.sessions.append(a.leaseId, 1, "flight", update);
      await Promise.resolve();
      f.sessions.abandon(1);
      resume();
      expect(await saving).toMatchObject({ revision: 1, projectedRevision: 1 });
    } finally {
      spy.mockRestore();
    }
    const reopened = await f.sessions.open("A", f.created.contentIds[0], 2, "b");
    expect(document(reopened.state).read().title).toBe("收到即保全");
  });
  it("无窗口持有的待投影日志也参与切库排空", async () => {
    const f = await fixture(),
      a = await f.sessions.open("A", f.created.contentIds[0], 1, "a"),
      client = document(a.state);
    f.db.exec(
      "CREATE TRIGGER fail BEFORE UPDATE ON whiteboard_documents BEGIN SELECT RAISE(ABORT,'pending'); END;"
    );
    await f.sessions.append(
      a.leaseId,
      1,
      "pending",
      delta(client, () =>
        client.submit([{ type: "edit_title", edit: { offset: 0, remove: 0, text: "后台" } }], {})
      )
    );
    f.sessions.abandon(1);
    await expect(f.sessions.flushDatabase("A")).rejects.toThrow("pending");
    f.db.exec("DROP TRIGGER fail");
    await f.sessions.flushDatabase("A");
    expect(f.db.prepare("SELECT title FROM white_boards").get()).toEqual({ title: "后台" });
  });
  it("WAL 提交后进程被终止，重开仍能恢复尚未投影的更新", async () => {
    const f = await fixture(true),
      a = await f.sessions.open("A", f.created.contentIds[0], 1, "a"),
      client = document(a.state);
    const update = delta(client, () =>
      client.submit([{ type: "edit_title", edit: { offset: 0, remove: 0, text: "硬退出" } }], {})
    );
    const state = Y.encodeStateAsUpdate(client.doc),
      hash = createHash("sha256").update(state).digest("hex"),
      key = journalKey(a.identity);
    f.sessions.dispose();
    f.journal.close();
    const sqlite = createRequire(
      join(process.cwd(), "../collaboration-server/package.json")
    ).resolve("better-sqlite3");
    const script = `const D=require(process.argv[1]);const db=new D(process.argv[2]);db.pragma('journal_mode=WAL');db.pragma('synchronous=FULL');const p=JSON.parse(process.argv[3]);db.transaction(()=>{db.prepare('INSERT INTO updates VALUES(?,?,?,?,?,?)').run(p.key,'crash',1,p.updateHash,Buffer.from(p.update,'base64'),p.hash);db.prepare('UPDATE documents SET state=?,revision=1,hash=? WHERE document_id=?').run(Buffer.from(p.state,'base64'),p.hash,p.key);})();process.stdout.write('committed');setInterval(()=>{},1000);`;
    const child = spawn(
      process.execPath,
      [
        "-e",
        script,
        sqlite,
        join(f.dir, "journal.db"),
        JSON.stringify({
          key,
          hash,
          state: Buffer.from(state).toString("base64"),
          update: Buffer.from(update).toString("base64"),
          updateHash: createHash("sha256").update(update).digest("hex"),
        }),
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    );
    await new Promise<void>((resolve, reject) => {
      let committed = false;
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("崩溃夹具超时"));
      }, 5000);
      child.on("error", reject);
      child.stdout.on("data", data => {
        if (String(data).includes("committed")) {
          committed = true;
          child.kill("SIGKILL");
        }
      });
      child.on("exit", () => {
        clearTimeout(timer);
        committed ? resolve() : reject(new Error("日志提交未完成"));
      });
    });
    const journal = new WhiteboardJournal(join(f.dir, "journal.db"));
    cleanups.push(() => journal.close());
    const next = new WhiteboardDocumentSessions(journal, () => f.db);
    cleanups.push(() => next.dispose());
    const opened = await next.open("A", f.created.contentIds[0], 2, "recovered");
    expect(opened).toMatchObject({ revision: 1, projectedRevision: 1 });
    expect(document(opened.state).read().title).toBe("硬退出");
  });
});

it("外部实体删除后即便数值 ID 与创建时间同时复用，旧引用也不能指向新实体", () => {
  const db = database();
  db.prepare(
    "INSERT INTO articles(id,title,create_time,update_time) VALUES(81,'原文',100,100)"
  ).run();
  const previous = ContentIdentityTable.reference(db, "article", 81);
  db.prepare("DELETE FROM articles WHERE id=81").run();
  db.prepare(
    "INSERT INTO articles(id,title,create_time,update_time) VALUES(81,'新文',100,100)"
  ).run();
  expect(ContentIdentityTable.resolve(db, previous)).toBeNull();
  const current = ContentIdentityTable.reference(db, "article", 81);
  expect(current.entityId).not.toBe(previous.entityId);
  expect(ContentIdentityTable.resolve(db, current)).toBe(81);
});

it.runIf(process.env.TAU_BOARD_AGENT_STRESS === "recovery")(
  "Agent 四个提交切点硬杀后按原请求恢复",
  async () => {
    const { build } = await import("esbuild");
    const { spawnSync } = await import("node:child_process");
    const f = await fixture(true),
      worker = join(f.dir, "worker.cjs");
    const sqlite = createRequire(
      join(process.cwd(), "../collaboration-server/package.json")
    ).resolve("better-sqlite3");
    await build({
      entryPoints: [join(__dirname, "fixtures/kill-agent-write.ts")],
      bundle: true,
      platform: "node",
      format: "cjs",
      outfile: worker,
      alias: { "better-sqlite3": sqlite },
      external: [sqlite],
      logLevel: "silent",
    });
    const base = await f.sessions.open("A", f.created.contentIds[0], 1, "initial");
    f.sessions.dispose();
    let revision = base.revision;
    const started = performance.now();
    for (const point of [
      "journal-transaction",
      "journal-committed",
      "projection-transaction",
      "before-reply",
    ]) {
      for (let i = 0; i < 20; i++) {
        const request = {
          owner: "main-chat:recovery",
          pageId: f.p1,
          requestId: point + "-" + i,
          operations: [
            {
              kind: "shape",
              id: "step",
              geometry: { x: i, y: 1, width: 12, height: 12, rotation: 0 },
              text: point,
            },
          ],
        };
        const child = spawnSync(
          process.execPath,
          [worker, f.dir, String(f.created.contentIds[0]), point, JSON.stringify(request)],
          { encoding: "utf8", timeout: 20000 }
        );
        expect(child.stderr).toBe("");
        expect([child.signal, child.stdout]).toEqual(["SIGKILL", point]);
        expect(f.journal.load(journalKey(base.identity))?.revision).toBe(
          revision + Number(point !== "journal-transaction")
        );
        expect(
          f.db.prepare("SELECT revision FROM whiteboard_documents WHERE document_id='doc'").get()
        ).toEqual({ revision: revision + Number(point === "before-reply") });
        const recovered = new WhiteboardDocumentSessions(f.journal, () => f.db);
        try {
          const lease = await recovered.open("A", f.created.contentIds[0], 2, "recovered");
          const result = await recovered.applyAgent(lease.leaseId, 2, request);
          const replay = await recovered.applyAgent(lease.leaseId, 2, request);
          expect(result).toEqual(replay);
          expect(result.operationRevision).toBe(++revision);
          const row = f.db
            .prepare("SELECT snapshot FROM whiteboard_documents WHERE document_id='doc'")
            .get() as { snapshot: string };
          const nodes = JSON.parse(row.snapshot).pages[0].children as {
            id: string;
            geometry: { x: number };
          }[];
          expect(nodes.filter(n => n.id === result.ids.step).map(n => n.geometry.x)).toEqual([i]);
        } finally {
          recovered.dispose();
        }
      }
      console.info("Agent SIGKILL", point, 20, "revision", revision);
    }
    console.info("Agent SIGKILL elapsedMs", Math.round(performance.now() - started));
  },
  240000
);

it.runIf(process.env.TAU_BOARD_AGENT_STRESS === "concurrency")(
  "两个 Agent 与画布用户同时修改时仅接纳匹配前提的整批",
  async () => {
    const samples: number[] = [];
    let conflicts = 0,
      replayed = 0,
      moves = 0,
      userChanges = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const f = await fixture(),
        leases = await Promise.all(
          [1, 2, 3].map(owner =>
            f.sessions.open("A", f.created.contentIds[0], owner, "view" + owner)
          )
        );
      const geometry = { x: 0, y: 0, width: 80, height: 40, rotation: 0 };
      const make = (owner: number, requestId: string, operations: Record<string, unknown>[]) => ({
        owner: "agent-" + owner,
        pageId: f.p1,
        requestId,
        operations,
      });
      const write = (owner: number, req: ReturnType<typeof make>) =>
        f.sessions.applyAgent(leases[owner - 1].leaseId, owner, req);
      const first = await write(
        1,
        make(
          1,
          "create",
          Array.from({ length: 20 }, (_, i) => ({
            kind: "shape",
            id: "n" + i,
            geometry,
            text: "节点" + i,
          }))
        )
      );
      const nodes = Array.from({ length: 20 }, (_, i) => first.ids["n" + i]),
        expected = nodes.map(() => 0);
      let random = seed;
      const next = () => {
        random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
        return random;
      };
      for (let round = 0; round < 50; round++) {
        const group = next() % 2,
          collision = round % 5 === 0;
        const initial = expected.slice();
        const batch = (owner: number, start: number) =>
          make(
            owner,
            "r" + round,
            nodes.slice(start, start + 10).map((id, j) => ({
              kind: "move",
              id,
              before: { ...geometry, x: initial[start + j] },
              geometry: { ...geometry, x: 1 + (next() % 999999) },
            }))
          );
        const start = group * 10,
          other = collision ? start : 10 - start;
        const one = batch(1, start),
          two = batch(2, other);
        const human = document(f.sessions.snapshot(leases[2].leaseId, 3).state);
        const update = delta(human, () =>
          human.submit(
            [{ type: "edit_page_title", id: f.p1, edit: { offset: 0, remove: 0, text: "人" } }],
            {}
          )
        );
        human.dispose();
        human.doc.destroy();
        const began = performance.now();
        const settled = await Promise.allSettled([
          write(1, one),
          write(2, two),
          f.sessions.append(leases[2].leaseId, 3, "human-" + round, update),
        ]);
        expect(settled[2].status).toBe("fulfilled");
        userChanges++;
        const won = settled.slice(0, 2).filter(x => x.status === "fulfilled");
        expect(won).toHaveLength(collision ? 1 : 2);
        for (const [index, req] of [one, two].entries()) {
          if (settled[index].status === "rejected") {
            expect(String((settled[index] as PromiseRejectedResult).reason)).toContain("位置冲突");
            conflicts++;
            continue;
          }
          for (const op of req.operations)
            expected[nodes.indexOf(String(op.id))] = (op.geometry as typeof geometry).x;
          moves += req.operations.length;
          if (round % 7 === 0) {
            const replay = await write(index + 1, req);
            expect(replay.operationRevision).toBe(
              (settled[index] as PromiseFulfilledResult<typeof replay>).value.operationRevision
            );
            replayed++;
          }
        }
        samples.push(performance.now() - began);
      }
      const snapshot = JSON.parse(
        (
          f.db
            .prepare("SELECT snapshot FROM whiteboard_documents WHERE document_id='doc'")
            .get() as { snapshot: string }
        ).snapshot
      );
      expect(snapshot.pages[0].title).toBe("人".repeat(50) + "甲");
      expect(
        nodes.map(
          id => snapshot.pages[0].children.find((n: { id: string }) => n.id === id).geometry.x
        )
      ).toEqual(expected);
    }
    samples.sort((a, b) => a - b);
    console.info(
      "AGENT_CONCURRENCY",
      JSON.stringify({
        seeds: 20,
        attemptedMoves: 20000,
        moves,
        conflicts,
        replayed,
        userChanges,
        rounds: samples.length,
        roundP95ms: samples[949],
        roundP99ms: samples[989],
      })
    );
  },
  600000
);

it("Agent 批次缺少端点或请求身份复用于另一操作时，保留上次成功修订", async () => {
  const f = await fixture(),
    view = await f.sessions.open("A", f.created.contentIds[0], 1, "author");
  const geometry = { x: 10, y: 10, width: 40, height: 30, rotation: 0 };
  const request = {
    owner: "main-chat:test",
    pageId: f.p1,
    requestId: "one",
    operations: [{ kind: "shape", id: "node", text: "任务", geometry }],
  };
  const write = (ops: Record<string, unknown>[]) =>
    f.sessions.applyAgent(view.leaseId, 1, { ...request, operations: ops });
  await expect(
    write([...request.operations, { kind: "connect", id: "line", from: "node", to: "removed" }])
  ).rejects.toThrow();
  expect(f.sessions.snapshot(view.leaseId, 1).revision).toBe(view.revision);
  const receipt = await write(request.operations);
  await expect(write([{ ...request.operations[0], text: "另一内容" }])).rejects.toThrow("同一请求");
  expect(f.sessions.snapshot(view.leaseId, 1).revision).toBe(receipt.operationRevision);
});
