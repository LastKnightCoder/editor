import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Awareness } from "y-protocols/awareness";
import {
  createNodeDocument,
  NodeTree,
  readNodeDocument,
  validateNodeDocument,
  type ContentNode,
} from "@tau/collaboration";
import {
  prepareContentContract,
  type ContentContractDictionary,
} from "@tau/db-schema/content-contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));
vi.mock("../../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));
import MAIN_SCHEMA_SQL from "../../../../../../../packages/db-schema/schema/main.sql?raw";
import {
  registerContentSession,
  unregisterContentSession,
} from "../../collaboration/content-sessions";
import { CollaborationLocalStore } from "../../collaboration/local-store";
import { ContentDocumentTable } from "../../tables/content-document";
import { ContentIdentityTable } from "../../tables/content-identity";
import type { RuntimeSession } from "../../collaboration/types";
import { TaskAssistantEngine, readTask } from "../engine";
import { readTaskContent, taskNode } from "../../content-task-patches";

const dispose: Array<() => void> = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const run of dispose.splice(0).reverse()) run();
});
async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "tau-task-session-"));
  const db = new Database(":memory:"),
    store = new CollaborationLocalStore(directory);
  db.exec(MAIN_SCHEMA_SQL);
  const contracts: Record<string, ContentContractDictionary[string]> = {},
    ids = new Map<string, string>();
  for (const type of ["paragraph", "check-list", "check-list-item"]) {
    const value = await prepareContentContract(`tau.${type}`, {
      type,
      dataVersion: 1,
      kind: "block",
    });
    contracts[value.id] = value.contract;
    ids.set(type, value.id);
  }
  const node = (
    type: string,
    collabId: string,
    children: ContentNode[],
    attributes = {}
  ): ContentNode => ({ type, collabId, tauContract: ids.get(type), children, ...attributes });
  const content = [
    node("paragraph", "untouched", [{ text: "不改这一段", bold: true }]),
    node("check-list", "list", [
      node(
        "check-list-item",
        "item",
        [
          node("paragraph", "title", [
            { text: "写", bold: true },
            { text: "方案", italic: true },
          ]),
        ],
        { taskId: "task", checked: false }
      ),
    ]),
  ];
  db.prepare(
    "INSERT INTO contents(id,create_time,update_time,content,ref_count) VALUES(1,100,100,'[]',1)"
  ).run();
  db.prepare(
    "INSERT INTO articles(title,content_id,create_time,update_time) VALUES('正文',1,100,100)"
  ).run();
  ContentIdentityTable.establishBaseline(db);
  const saved = ContentDocumentTable.commit(
    db,
    1,
    { documentId: "body", contracts, content },
    { installDocument: true, count: 10 }
  );
  const doc = await createNodeDocument(
    { documentId: "task-test", baselineId: "base", epoch: 0 },
    { title: "正文", content, bannerBg: "", bannerPosition: "center" },
    contracts
  );
  const awareness = new Awareness(doc);
  awareness.setLocalState(null);
  const session: RuntimeSession = {
    doc,
    awareness,
    store,
    dirty: false,
    info: {
      id: "task-test",
      mode: "local",
      title: "正文",
      ownerId: "device",
      role: "owner",
      status: "active",
      members: [],
      updatedAt: 1,
      serverUrl: "",
      connection: "connected",
      pending: false,
      leaving: false,
      source: {
        databaseName: "test",
        contentId: 1,
        contentCreatedAt: 100,
        librarySourceId: ContentIdentityTable.library(db)!.sourceId,
        contentDocumentId: saved.documentId,
        projectionRevision: saved.revision,
      },
    },
  };
  store.create(session.info, doc);
  registerContentSession(db, 1, session);
  dispose.push(() => {
    unregisterContentSession(session);
    awareness.destroy();
    doc.destroy();
    store.db.close();
    db.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return {
    db,
    session,
    store,
    ref: { kind: "document" as const, contentId: 1, createdAt: 100, taskId: "task" },
    engine: new TaskAssistantEngine(db),
  };
}

describe("正文助理持久化", () => {
  it("只改任务文字，保留其他节点和格式，回执与文档增量同事务落盘", async () => {
    const { db, session, store, ref, engine } = await fixture();
    const tree = new NodeTree(session.doc),
      untouched = tree.record("untouched");
    const task = readTask(db, ref);
    const result = engine.execute(
      "update_todo",
      {
        requestId: "rename",
        taskRef: ref,
        revision: task.revision,
        patch: { title: "写方案草稿" },
      },
      "b"
    );
    expect(result.status).toBe("succeeded");
    expect(tree.record("untouched")).toBe(untouched);
    expect(readTask(db, ref).title).toBe("写方案草稿");
    expect(taskNode(readTaskContent(db, 1, 100), "task")!.children![0].children![0]).toMatchObject({
      text: "写",
      bold: true,
    });
    const restored = store.load(session.info.id);
    try {
      expect(restored.doc.share.has("task-operation-receipts")).toBe(false);
      expect(
        store.get(`task-receipt:${session.info.id}:${result.operationId}`, null)
      ).not.toBeNull();
      await validateNodeDocument(restored.doc);
    } finally {
      restored.doc.destroy();
      tree.dispose();
    }
  });
  it("缓存提交后主库写入失败不返回成功，按回执恢复且不重复修改正文", async () => {
    const { db, session, ref, engine } = await fixture();
    const task = readTask(db, ref);
    const fail = vi.spyOn(ContentDocumentTable, "commit").mockImplementationOnce(() => {
      throw new Error("磁盘写入失败");
    });
    const result = engine.execute(
      "update_todo",
      { requestId: "retry", taskRef: ref, revision: task.revision, patch: { title: "只改一次" } },
      "b"
    );
    expect(result.status).toBe("pending");
    fail.mockRestore();
    engine.recoverPending();
    expect(
      db.prepare("SELECT status FROM task_assistant_operation WHERE id=?").get(result.operationId)
    ).toEqual({ status: "succeeded" });
    expect(readTask(db, ref).title).toBe("只改一次");
    expect(readNodeDocument(session.doc).content).toHaveLength(2);
    await validateNodeDocument(session.doc);
  });
});
