// @vitest-environment node
import Database from "better-sqlite3";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { expect, it, vi } from "vitest";
import schema from "@tau/db-schema/schema/collaboration.sql?raw";
import {
  buildScopedContentUpdate,
  captureScopedTextEdit,
  DocumentWriteQueue,
  NodeTree,
  ScopedContentConflictError,
  type ScopedContentResult,
} from "@tau/collaboration";
import { createTestDocument } from "@tau/collaboration/src/testing/node-document";
import { agentEditSignal, registerAgentEditExecution } from "../../agent-run-events";
import { AgentPermissionStore } from "../agent-permissions";
import { ContentSuggestionStore } from "../content-suggestions";
import { ContentSuggestionService } from "../suggestion-service";
import { typingChunks, type TypingHost } from "../agent-typing";

vi.mock("../../database-notifications", () => ({ broadcastDatabaseChange: vi.fn() }));
const base = { documentId: "doc", baselineId: "base", epoch: 0 };
const rounds = process.env.TAU_COEDIT_STRESS === "1" ? 64 : 1;
const original = "原文保留";
const replacement = "甲乙丙丁戊己庚辛";
const prefix = typingChunks(replacement)[0];

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
};

async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "tau-coedit-recovery-"));
  const file = join(directory, "library.db");
  let db = new Database(file);
  db.exec(schema);
  const doc = await createTestDocument(
    {
      title: "",
      bannerBg: "",
      bannerPosition: "center",
      content: [
        { type: "paragraph", collabId: "p1", children: [{ text: original }] },
        { type: "paragraph", collabId: "p2", children: [{ text: "用户段落" }] },
      ],
    },
    base
  );
  let current = doc;
  let tree = new NodeTree(current);
  let awareness = new Awareness(current);
  awareness.setLocalState(null);
  let queue = new DocumentWriteQueue(1024 * 1024);
  const receipt = (operationId: string) => {
    const row = db.prepare("SELECT value FROM settings WHERE key=?").get(operationId) as
      | { value: string }
      | undefined;
    return row
      ? (JSON.parse(row.value) as Extract<ScopedContentResult, { status: "committed" }>)
      : undefined;
  };
  const submit: TypingHost["submit"] = (request, assertCanWrite) =>
    queue.run("doc", 1, async () => {
      assertCanWrite?.();
      const prior = receipt(request.operationId);
      if (prior) return prior;
      try {
        const { update, inverse } = await buildScopedContentUpdate(current, request.scope);
        assertCanWrite?.();
        const next = new Y.Doc();
        try {
          Y.applyUpdate(next, Y.encodeStateAsUpdate(current));
          Y.applyUpdate(next, update);
          const result = { status: "committed" as const, inverse };
          db.transaction(() => {
            db.prepare("INSERT OR REPLACE INTO settings VALUES (?,?)").run(
              request.operationId,
              JSON.stringify(result)
            );
            db.prepare("INSERT OR REPLACE INTO settings VALUES (?,?)").run(
              "snapshot",
              Buffer.from(Y.encodeStateAsUpdate(next)).toString("base64")
            );
          })();
          Y.applyUpdate(current, update);
          return result;
        } finally {
          next.destroy();
        }
      } catch (error) {
        if (error instanceof ScopedContentConflictError)
          return { status: "conflict", conflicts: error.conflicts };
        throw error;
      }
    });
  const edit = captureScopedTextEdit(tree, "e", "p1", 0, 2, replacement);
  const batch = {
    proposalId: "proposal",
    conversationKey: "chat",
    baseline: base,
    mode: "direct" as const,
    items: [{ edit, beforeText: "原文", afterText: replacement }],
  };
  const store = () => new ContentSuggestionStore(db);
  const host = (overrides?: Partial<TypingHost>): TypingHost => ({
    local: true,
    session: () => ({ doc: current, awareness }),
    submit,
    receipt,
    moved: () => undefined,
    delay: async () => undefined,
    ...overrides,
  });
  const service = (overrides?: Partial<TypingHost>) =>
    new ContentSuggestionService(
      store(),
      (_db, _id, request, options) => submit(request, options?.assertCanWrite),
      async () => host(overrides)
    );
  const text = (id: string) => tree.nodeSnapshot(id).children?.[0].text;
  const human = (id: string, offset: number, value: string) =>
    tree.insertText(id, offset, value, null);
  const focus = () => {
    const point = Buffer.from(Y.encodeRelativePosition(tree.capturePosition("p1", 0))).toString(
      "base64"
    );
    awareness.setLocalState({
      user: { id: "human" },
      activity: "editing",
      nodeTreeSelection: { range: { focus: point } },
    });
  };
  const closeDocument = () => {
    awareness.destroy();
    tree.dispose();
    current.destroy();
  };
  const reopen = () => {
    closeDocument();
    db.close();
    db = new Database(file);
    const { value } = db.prepare("SELECT value FROM settings WHERE key='snapshot'").get() as {
      value: string;
    };
    current = new Y.Doc();
    Y.applyUpdate(current, Buffer.from(value, "base64"));
    tree = new NodeTree(current);
    awareness = new Awareness(current);
    awareness.setLocalState(null);
    queue = new DocumentWriteQueue(1024 * 1024);
  };
  const close = () => {
    closeDocument();
    db.close();
    rmSync(directory, { recursive: true, force: true });
  };
  return {
    get db() {
      return db;
    },
    batch,
    edit,
    store,
    submit,
    service,
    text,
    human,
    focus,
    reopen,
    close,
  };
}

it("双窗口并发接续只留一条剩余建议，二次并发接续也只写一次", async () => {
  for (let i = 0; i < rounds; i++) {
    const f = await fixture();
    try {
      const first = deferred(),
        release = deferred();
      const service = f.service({ moved: first.resolve, delay: () => release.promise });
      const [item] = service.create(f.db, 7, f.batch);
      const a = service.accept(f.db, 7, [item.id], { typing: true });
      await first.promise;
      expect(await service.accept(f.db, 7, [item.id], { typing: true })).toEqual([]);
      f.focus();
      f.human("p2", 0, "旁边");
      release.resolve();
      await a;
      const items = service.list(f.db, { proposalId: "proposal" });
      expect(items.map(row => row.status)).toEqual(["accepted", "pending"]);
      expect(f.text("p1")).toBe(prefix + "保留");
      service.dispose();
      // 模拟另一视图的人已移出目标段落，两个窗口再同时点击接续。
      const next = f.service({ session: () => undefined, local: false });
      await Promise.all([next.accept(f.db, 7, [items[1].id]), next.accept(f.db, 7, [items[1].id])]);
      expect(f.text("p1")).toBe(replacement + "保留");
      expect(f.text("p2")).toBe("旁边用户段落");
      next.dispose();
    } finally {
      f.close();
    }
  }
  console.info("双窗口接续回归轮数", rounds);
});

it("首段落盘后重开 SQLite 与正文，从原回执接续并能撤销", async () => {
  for (let i = 0; i < rounds; i++) {
    const f = await fixture();
    try {
      const service = f.service();
      const [item] = service.create(f.db, 7, f.batch);
      f.store().claim("library", [item.id], 7);
      await f.submit({
        ...base,
        operationId: item.id + ".t0",
        scope: { edits: [{ ...f.edit, text: prefix }] },
      });
      service.dispose();
      f.reopen();
      const resumed = f.service();
      expect((await resumed.accept(f.db, 7, [item.id]))[0].status).toBe("accepted");
      expect(f.text("p1")).toBe(replacement + "保留");
      f.human("p2", 0, "旁边");
      expect((await resumed.undo(f.db, 7, [item.id]))[0].status).toBe("undone");
      expect(f.text("p1")).toBe(original);
      expect(f.text("p2")).toBe("旁边用户段落");
      resumed.dispose();
    } finally {
      f.close();
    }
  }
  console.info("逐段故障恢复与撤销轮数", rounds);
});

it("停止工具后，已入队未写入的下一段被拦下，已落盘部分可撤销", async () => {
  for (let i = 0; i < rounds; i++) {
    const f = await fixture();
    const stop = registerAgentEditExecution("active-edit");
    try {
      const queued = deferred(),
        release = deferred();
      const service = f.service({
        submit: async (request, assertCanWrite) => {
          if (request.operationId.endsWith(".t1")) {
            queued.resolve();
            await release.promise;
          }
          return f.submit(request, assertCanWrite);
        },
      });
      const [item] = service.create(f.db, 7, f.batch);
      const pending = service.accept(f.db, 7, [item.id], {
        typing: true,
        executionId: "active-edit",
      });
      await queued.promise;
      stop();
      release.resolve();
      await pending;
      expect(agentEditSignal("active-edit").aborted).toBe(true);
      expect(f.text("p1")).toBe(prefix + "保留");
      expect(service.list(f.db, { proposalId: "proposal" }).map(row => row.status)).toEqual([
        "accepted",
        "pending",
      ]);
      await expect(
        service.accept(f.db, 7, [item.id], { executionId: "active-edit" })
      ).rejects.toThrow();
      expect((await service.undo(f.db, 7, [item.id]))[0].status).toBe("undone");
      expect(f.text("p1")).toBe(original);
      expect(f.text("p2")).toBe("用户段落");
      service.dispose();
    } finally {
      stop();
      f.close();
    }
  }
  console.info("停止后排队写入回归轮数", rounds);
});

it("用户改动原插入边界后，剩余建议提交冲突且保留用户内容", async () => {
  const f = await fixture();
  const stop = registerAgentEditExecution("boundary-edit");
  try {
    const service = f.service({ moved: stop });
    const [item] = service.create(f.db, 7, f.batch);
    await service.accept(f.db, 7, [item.id], { typing: true, executionId: "boundary-edit" });
    const [, remainder] = service.list(f.db, { proposalId: "proposal" });
    f.human("p1", prefix.length, "用户");
    expect((await service.accept(f.db, 7, [remainder.id]))[0].status).toBe("expired");
    expect(f.text("p1")).toBe(prefix + "用户保留");
    expect(f.text("p2")).toBe("用户段落");
    service.dispose();
  } finally {
    stop();
    f.close();
  }
});

it("替换同名资料库后，同一数字正文 ID 不继承旧直接改权限", () => {
  const directory = mkdtempSync(join(tmpdir(), "tau-coedit-permission-"));
  const cache = new Database(":memory:");
  const create = (name: string, sourceId: string, docId: string) => {
    mkdirSync(join(directory, name));
    const db = new Database(join(directory, name, "library.db"));
    db.exec(
      "CREATE TABLE library_identity (id INTEGER, source_id TEXT, baseline_id TEXT, confirmed_snapshot TEXT); CREATE TABLE content_documents(content_id INTEGER, document_id TEXT)"
    );
    db.prepare("INSERT INTO library_identity VALUES(1, ?, 'base', NULL)").run(sourceId);
    db.prepare("INSERT INTO content_documents VALUES(7, ?)").run(docId);
    return db;
  };
  const original = create("old", "source-a", "doc-a");
  const replacement = create("new", "source-b", "doc-b");
  try {
    cache.exec(schema);
    const permissions = new AgentPermissionStore(cache);
    permissions.set(original, 7, "校对", "direct");
    expect(permissions.level(original, 7, "校对")).toBe("direct");
    expect(permissions.level(replacement, 7, "校对")).toBe("suggest");
    expect(permissions.list(replacement, 7)).toEqual([]);
  } finally {
    original.close();
    replacement.close();
    cache.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
