// @vitest-environment node
import Database from "better-sqlite3";
import * as Y from "yjs";
import { must } from "../../../test-support";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { build } from "esbuild";
import schema from "@tau/db-schema/schema/main.sql?raw";
import { WhiteboardModel, createWhiteboardDocument } from "@tau/collaboration";
import {
  fixture,
  create,
  pageParent,
  documents,
} from "../../../../../../../packages/collaboration/src/whiteboard-test-utils";
import { seedGeometryHistory } from "../../../../../e2e/whiteboard-frame/prototype/seedGeometryHistory";
import { ContentIdentityTable } from "../../tables/content-identity";
import { WhiteboardJournal, journalKey, stateHash } from "../journal";
import {
  WhiteboardDocumentClient,
  type WhiteboardDocumentBackend,
} from "../../../../../src/services/whiteboard-documents/client";
import { Outbox } from "../../../../../src/services/whiteboard-documents/__tests__/client-fixture";
import type { WhiteboardDocumentSessions } from "../sessions";

describe.runIf(process.env.TAU_WHITEBOARD_RECLAIM_STRESS === "1")("本机白板耐久回收", () => {
  let dir: string,
    initial: Uint8Array,
    expected: ReturnType<WhiteboardModel["read"]>,
    frame: string;
  let Sessions: typeof WhiteboardDocumentSessions;
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "wb-reclaim-"));
    const nodeRequire = createRequire(import.meta.url);
    const sqlite = createRequire(
      join(process.cwd(), "../collaboration-server/package.json")
    ).resolve("better-sqlite3");
    await build({
      entryPoints: {
        sessions: join(__dirname, "../sessions.ts"),
        "whiteboard-compact-worker": join(
          __dirname,
          "../../../workers/whiteboard-compact.worker.ts"
        ),
        "whiteboard-append-worker": join(__dirname, "../../../workers/whiteboard-append.worker.ts"),
        "kill-reclaim": join(__dirname, "fixtures/kill-reclaim.ts"),
      },
      bundle: true,
      platform: "node",
      format: "cjs",
      outdir: dir,
      alias: { "better-sqlite3": sqlite },
      external: [sqlite],
    });
    Sessions = nodeRequire(join(dir, "sessions.js")).WhiteboardDocumentSessions;
    const { board: seed, container, shape, page } = await fixture();
    const board = read(Y.encodeStateAsUpdate(seed.doc));
    documents.push(board.doc);
    frame = create(board, container, pageParent(page));
    board.submitChunks(
      Array.from({ length: 1000 }, (_, i) => ({
        type: "create",
        contractId: shape,
        id: "shape-" + i,
        data: { source: "第" + i + "个元素" },
        parent: { kind: "element", id: frame },
        geometry: { x: i % 50, y: Math.floor(i / 50), width: 10, height: 12, rotation: 0 },
      })),
      null
    );
    seedGeometryHistory(board, frame, 7_850_000);
    initial = Y.encodeStateAsUpdate(board.doc);
    expected = board.read();
  }, 120000);
  afterAll(() => {
    documents.splice(0).forEach(doc => doc.destroy());
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  async function setup(name: string) {
    const location = join(dir, name);
    mkdirSync(location);
    const db = new Database(join(location, "main.db"));
    db.exec(schema);
    ContentIdentityTable.establishBaseline(db);
    const journal = new WhiteboardJournal(join(location, "journal.db"));
    const sessions = new Sessions(journal, () => db);
    const { contentIds } = await sessions.create("test", "doc", initial, "board");
    const row = () =>
      db
        .prepare(
          "SELECT epoch,length(state) AS bytes,revision,revision_hash AS hash FROM whiteboard_documents"
        )
        .get() as { epoch: number; bytes: number; revision: number; hash: string };
    const open = (owner: number) => sessions.open("test", contentIds[0], owner, "view-" + owner);
    return {
      row,
      open,
      location,
      db,
      journal,
      sessions,
      contentIds,
      close() {
        sessions.dispose();
        journal.close();
        db.close();
      },
    };
  }
  function read(state: Uint8Array) {
    const model = new WhiteboardModel(new Y.Doc({ gc: false }));
    Y.applyUpdate(model.doc, state);
    return model;
  }
  it("多窗口、打开期间竞争与连续四轮近满容量回收均保留完整千元素画框", async () => {
    const f = await setup("cycles");
    try {
      const first = await f.open(1),
        second = await f.open(2);
      await f.sessions.release(first.leaseId, 1, true);
      expect(f.row().epoch).toBe(0);
      await f.sessions.release(second.leaseId, 2, false);
      expect(f.row().epoch).toBe(0);
      const closing = await f.open(1);
      await f.sessions.release(closing.leaseId, 1, true);
      // 等排在前面的清理任务启动工作线程，再从原入口打开同一白板。
      await new Promise<void>(resolve => setImmediate(resolve));
      const concurrent = await f.open(2);
      const client = read(concurrent.state);
      try {
        const vector = Y.encodeStateVector(client.doc);
        client.submit(
          [{ type: "edit_title", edit: { offset: 0, remove: 0, text: "重开时的输入" } }],
          null
        );
        await f.sessions.append(
          concurrent.leaseId,
          2,
          "racing-write",
          Y.encodeStateAsUpdate(client.doc, vector)
        );
      } finally {
        client.doc.destroy();
      }
      expect(f.row().epoch).toBe(0);
      let current = concurrent;
      for (let cycle = 0; cycle < 4; cycle++) {
        if (cycle) {
          const client = read(current.state);
          try {
            const vector = Y.encodeStateVector(client.doc);
            seedGeometryHistory(client, frame, 7_850_000);
            await f.sessions.append(
              current.leaseId,
              2,
              "refill-" + cycle,
              Y.encodeStateAsUpdate(client.doc, vector)
            );
          } finally {
            client.doc.destroy();
          }
        }
        const before = f.row();
        const start = performance.now();
        await f.sessions.release(current.leaseId, 2, true);
        const releaseMs = Math.round(performance.now() - start);
        const lag = monitorEventLoopDelay({ resolution: 2 });
        lag.enable();
        await vi.waitFor(() => expect(f.row().epoch).toBe(before.epoch + 1), { timeout: 15000 });
        lag.disable();
        const maintenanceMs = Math.round(performance.now() - start) - releaseMs;
        const after = f.row();
        expect(after.bytes).toBeLessThan(before.bytes / 2);
        expect(after.revision).toBe(before.revision);
        await expect(
          f.sessions.append(current.leaseId, 2, "late", new Uint8Array())
        ).rejects.toThrow("失效");
        expect(f.journal.db.prepare("SELECT count(*) AS n FROM documents").get()).toEqual({ n: 1 });
        current = await f.open(2);
        const reopened = read(current.state);
        try {
          expect(reopened.read()).toEqual({ ...expected, title: "重开时的输入" });
        } finally {
          reopened.doc.destroy();
        }
        console.info("回收轮次", cycle + 1, {
          before: before.bytes,
          after: after.bytes,
          releaseMs,
          maintenanceMs,
          maxTickMs: Math.round(lag.max / 1e6),
        });
      }
    } finally {
      f.close();
    }
  }, 180000);
  it("崩溃窗口的草稿补存后才回收，切换写盘失败仍可继续打开并重试", async () => {
    const f = await setup("drafts");
    const outbox = new Outbox();
    const backend = (owner: number): WhiteboardDocumentBackend => ({
      open: (target, view) => f.sessions.open(target.databaseName, target.contentId, owner, view),
      append: (lease, batch, update) => f.sessions.append(lease, owner, batch, update),
      flush: lease => f.sessions.flush(lease, owner),
      snapshot: async lease => f.sessions.snapshot(lease, owner),
      release: (lease, drained) => f.sessions.release(lease, owner, drained),
      events: () => () => undefined,
      drains: () => () => undefined,
      resumes: () => () => undefined,
      drained: async () => undefined,
    });
    const newClient = (api: WhiteboardDocumentBackend) =>
      new WhiteboardDocumentClient(
        { databaseName: "test", contentId: f.contentIds[0] },
        api,
        outbox
      );
    try {
      const primary = newClient(backend(1)),
        crashing = newClient({
          ...backend(2),
          append: async () => {
            throw new Error("连接中断");
          },
        });
      await Promise.all([primary.ready, crashing.ready]);
      crashing.model.submit(
        [{ type: "edit_title", edit: { offset: 0, remove: 0, text: "崩溃窗口草稿" } }],
        null
      );
      await expect(crashing.flush()).rejects.toThrow("连接中断");
      crashing.dispose();
      f.sessions.abandon(2);
      await primary.release();
      expect(outbox.records.size).toBeGreaterThan(0);
      expect(f.row().epoch).toBe(0);
      const recovered = newClient(backend(1));
      await recovered.ready;
      await recovered.flush();
      expect(recovered.model.read().title).toBe("崩溃窗口草稿");
      expect(outbox.records.size).toBe(0);
      const saved = f.row();
      let failed = false;
      f.db.function("fail_compact", () => {
        failed = true;
        throw new Error("写盘故障");
      });
      f.db.exec(
        "CREATE TEMP TRIGGER reject_swap AFTER UPDATE OF epoch ON whiteboard_documents BEGIN SELECT fail_compact(); END"
      );
      await recovered.release();
      await vi.waitFor(() => expect(failed).toBe(true), { timeout: 15000 });
      expect(f.row()).toEqual(saved);
      f.db.exec("DROP TRIGGER reject_swap");
      const retry = newClient(backend(1));
      await retry.ready;
      const request = {
        owner: "chat",
        pageId: must(retry.pageId),
        requestId: "original",
        operations: [
          {
            kind: "shape" as const,
            id: "node",
            text: "已保存",
            geometry: { x: 1, y: 2, width: 10, height: 10, rotation: 0 },
          },
        ],
      };
      const receipt = await f.sessions.applyAgent(must(retry.leaseId), 1, request);
      await retry.release();
      await vi.waitFor(() => expect(f.row().epoch).toBe(1), { timeout: 15000 });
      const clean = newClient(backend(1));
      await clean.ready;
      expect(clean.model.read().title).toBe("崩溃窗口草稿");
      const replay = await f.sessions.applyAgent(must(clean.leaseId), 1, request);
      expect(replay.operationRevision).toBe(receipt.operationRevision);
      expect(replay.ids).toEqual(receipt.ids);
      expect(f.row().revision).toBe(receipt.operationRevision);
      await clean.release();
    } finally {
      f.close();
    }
  }, 90000);

  it("共享桌面副本清理后与确认快照逐字节一致，远端代次和其它成员的撤销有效", async () => {
    const f = await setup("shared-copy");
    const shared = await createWhiteboardDocument(
      { documentId: "room", epoch: 0, baselineId: "first" },
      initial
    );
    const canonical = new Y.Doc();
    try {
      const state = Y.encodeStateAsUpdate(shared);
      Y.applyUpdate(canonical, state);
      const serverState = Y.encodeStateAsUpdate(canonical);
      const head = {
        id: "room",
        version: 3,
        baselineId: "first",
        epoch: 0,
        ownerId: "owner",
        revision: stateHash(serverState),
      };
      const created = await f.sessions.create("test", "shared-board", state, "board");
      const lease = await f.sessions.open("test", created.contentIds[0], 5, "shared");
      await f.sessions.release(lease.leaseId, 5, true, head);
      await vi.waitFor(
        () =>
          expect(
            f.db
              .prepare(
                "SELECT revision_hash FROM whiteboard_documents WHERE document_id='shared-board'"
              )
              .pluck()
              .get()
          ).toBe(head.revision),
        { timeout: 25000 }
      );
      const opened = await f.sessions.open("test", created.contentIds[0], 5, "shared-new");
      expect(Buffer.from(opened.state).equals(Buffer.from(serverState))).toBe(true);
      const replica = read(opened.state),
        peer = new WhiteboardModel(shared);
      try {
        const history = peer.createUndoManager({ trackedOrigins: new Set(["peer"]) });
        peer.submit([{ type: "edit_title", edit: { offset: 0, remove: 0, text: "peer" } }], "peer");
        for (const mode of ["edit", "undo", "redo"] as const) {
          if (mode !== "edit") history[mode]();
          const delta = Y.encodeStateAsUpdate(shared, Y.encodeStateVector(replica.doc));
          await f.sessions.append(opened.leaseId, 5, mode, delta);
          await replica.receive(delta);
          expect(replica.read()).toEqual(peer.read());
        }
        history.destroy();
      } finally {
        replica.doc.destroy();
      }
      console.info("共享千元素桌面副本字节", state.length, serverState.length);
    } finally {
      shared.destroy();
      canonical.destroy();
      f.close();
    }
  }, 90000);
  it.each(["prepared", "main-transaction", "main-committed", "journal-transaction"])(
    "进程在 %s 被硬杀后可直接重开并继续修改",
    async point => {
      const f = await setup(point);
      try {
        const child = spawnSync(
          process.execPath,
          [join(dir, "kill-reclaim.js"), f.location, String(f.contentIds[0]), point],
          { encoding: "utf8", timeout: 30000 }
        );
        expect([child.signal, child.stdout, child.stderr]).toEqual(["SIGKILL", point, ""]);
        expect(f.db.pragma("integrity_check", { simple: true })).toBe("ok");
        expect(f.journal.db.pragma("integrity_check", { simple: true })).toBe("ok");
        const view = await f.open(1);
        expect(view.identity.epoch).toBe(
          Number(point === "main-committed" || point === "journal-transaction")
        );
        expect(f.journal.load(journalKey(view.identity))?.hash).toBe(f.row().hash);
        expect(f.journal.db.prepare("SELECT count(*) AS n FROM checkpoint_reclaims").get()).toEqual(
          { n: 0 }
        );
        const model = read(view.state);
        try {
          expect(model.read()).toEqual(expected);
          const vector = Y.encodeStateVector(model.doc);
          model.submit([{ type: "edit_title", edit: { offset: 0, remove: 0, text: point } }], null);
          await f.sessions.append(
            view.leaseId,
            1,
            "after-crash",
            Y.encodeStateAsUpdate(model.doc, vector)
          );
          await f.sessions.release(view.leaseId, 1);
          const reopened = read((await f.open(3)).state);
          try {
            expect(reopened.read()).toEqual({ ...expected, title: point });
          } finally {
            reopened.doc.destroy();
          }
        } finally {
          model.doc.destroy();
        }
      } finally {
        f.close();
      }
    },
    60000
  );
});
