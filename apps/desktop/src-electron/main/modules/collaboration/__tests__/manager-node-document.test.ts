// @vitest-environment node
import Database from "better-sqlite3";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import {
  NodeTree,
  readNodeDocument,
  validateNodeDocument,
  type ContentSessionSnapshot,
  type CollaborationSession,
  type ContentNode,
} from "@tau/collaboration";
import { prepareContentContract } from "@tau/db-schema/content-contracts";
import { applyNodeTreeContent } from "@tau/editor-collab";
import schema from "@tau/db-schema/schema/main.sql?raw";
import type { IpcMainInvokeEvent } from "electron";
import { createServer } from "../../../../../../collaboration-server/src/server";
import { CollaborationManager } from "../index";
import { CollaborationLocalStore } from "../local-store";
import { ContentLocalState } from "../content-local-state";
import { CollaborationAssetService } from "../asset-service";
import type { CollaborationClient } from "../client";
import type { RuntimeSession } from "../types";
import ContentTable from "../../tables/content";
import { ContentDocumentTable } from "../../tables/content-document";
import { ContentIdentityTable } from "../../tables/content-identity";
import { unregisterContentSession } from "../content-sessions";
import type { DocumentDrain, DocumentDrainScope } from "../../durable-document-lifecycle";
import { TaskAssistantEngine, readTask } from "../../task-assistant/engine";

const host = vi.hoisted(() => ({
  dir: "",
  databases: new Map<string, Database.Database>(),
  windowToDatabase: new Map([[1, "library"]]),
}));
vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => ({ id: 1 }) },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));
vi.mock("../../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));
vi.mock("../../database", () => ({
  default: { ...host, getDatabase: (name: string) => host.databases.get(name) },
}));
vi.mock("../../../utils/PathUtil", () => ({ default: { getAppDir: () => host.dir } }));
vi.mock("../dev-server", () => ({ getDevelopmentServerUrl: () => "http://test" }));
const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const run of cleanup.splice(0).reverse()) await run();
  host.databases.clear();
});
type Runtime = {
  store: CollaborationLocalStore;
  contentState: ContentLocalState;
  assets: CollaborationAssetService;
  client: CollaborationClient;
  directory: string;
  stopped: boolean;
  sessions: Map<string, RuntimeSession>;
  views: Map<string, { documentId: string; windowId: number }>;
  acknowledgeFreeze(viewId: string, requestId?: string): void;
  freezeWaiters: Map<string, { id: string }>;
  attach(session: RuntimeSession): void;
  openContent(
    event: IpcMainInvokeEvent,
    target: { contentId: number }
  ): Promise<ContentSessionSnapshot>;
  createContent(event: IpcMainInvokeEvent, contentId: number): Promise<{ documentId: string }>;
  prepareLeave(session: RuntimeSession): Promise<void>;
  discardLocal(session: RuntimeSession): Promise<void>;
  finishLeave(session: RuntimeSession): Promise<void>;
  drainDatabase(scope: DocumentDrainScope): Promise<DocumentDrain>;
  releaseLibrary(name: string): Promise<void>;
  project(session: RuntimeSession): Promise<void>;
  restore(info: CollaborationSession, doc: Y.Doc): RuntimeSession;
};
async function setup() {
  const root = mkdtempSync(join(tmpdir(), "tau-manager-flow-"));
  host.dir = root;
  const db = new Database(join(root, "library.db"));
  db.exec(schema);
  host.databases.set("library", db);
  db.prepare(
    "INSERT INTO contents(id,create_time,update_time,content,count,ref_count) VALUES (7,1,1,?,2,1)"
  ).run(
    JSON.stringify([
      { type: "paragraph", svg: "用户业务内容", isFold: true, children: [{ text: "正文" }] },
    ])
  );
  const server = await createServer({ dataDir: join(root, "server"), logger: false });
  await server.app.ready();
  const owner = server.store.register("作者");
  let losePublish = false;
  let loseCommit = false;
  const client = {
    identities: new Map([["http://test", owner]]),
    identity: async () => owner,
    request: async (
      _url: string,
      path: string,
      method = "GET",
      body?: unknown,
      version?: number
    ) => {
      const response = await server.app.inject({
        method: method as "GET" | "POST",
        url: path,
        headers: {
          authorization: `Bearer ${owner.id}:${owner.secret}`,
          ...(version ? { "x-tau-document-version": String(version) } : {}),
        },
        payload: body as Record<string, unknown>,
      });
      const value = response.json();
      if (response.statusCode >= 400)
        throw Object.assign(new Error(value.message), {
          code: value.code,
          status: response.statusCode,
        });
      if (path.endsWith("/publish") && losePublish) {
        losePublish = false;
        throw new Error("模拟响应丢失");
      }
      if (path.endsWith("/commit") && loseCommit) {
        loseCommit = false;
        throw new Error("模拟提交响应丢失");
      }
      return value;
    },
  } as unknown as CollaborationClient;
  const directory = join(root, "collaboration");
  const store = new CollaborationLocalStore(directory),
    state = new ContentLocalState(store.db);
  const runtime = new CollaborationManager() as unknown as Runtime;
  Object.assign(runtime, {
    store,
    contentState: state,
    directory,
    client,
    stopped: true,
    assets: new CollaborationAssetService(store, root, async () => owner),
  });
  vi.spyOn(runtime, "attach").mockImplementation(() => {});
  cleanup.push(async () => {
    for (const session of runtime.sessions.values()) {
      unregisterContentSession(session);
      session.awareness.destroy();
      session.doc.destroy();
    }
    store.db.close();
    db.close();
    await server.app.close();
    rmSync(root, { recursive: true, force: true });
  });
  const event = { sender: {} } as IpcMainInvokeEvent;
  const paragraph = await prepareContentContract("tau.paragraph", {
    type: "paragraph",
    dataVersion: 1,
    kind: "block",
  });
  ContentIdentityTable.establishBaseline(db);
  ContentDocumentTable.commit(
    db,
    7,
    {
      documentId: "test-content",
      contracts: { [paragraph.id]: paragraph.contract },
      content: [
        {
          type: "paragraph",
          collabId: "paragraph",
          tauContract: paragraph.id,
          svg: "用户业务内容",
          isFold: true,
          children: [{ text: "正文" }],
        },
      ],
    },
    { installDocument: true, count: 2 }
  );
  const opened = await runtime.openContent(event, { contentId: 7 });
  return {
    runtime,
    db,
    state,
    store,
    server,
    owner,
    event,
    localId: opened.documentId,
    loseResponse: () => {
      losePublish = true;
    },
    loseCommit: () => {
      loseCommit = true;
    },
  };
}

describe("桌面生产会话与真实服务贯通", () => {
  it("正文退出屏障必须收到保存确认，超时恢复编辑，重试成功才保持冻结", async () => {
    const { runtime, localId } = await setup();
    const session = runtime.sessions.get(localId)!;
    runtime.views.set("unsaved-view", { documentId: localId, windowId: 1 });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const waiting = runtime.drainDatabase({ reason: "quit" });
    const oldRequest = runtime.freezeWaiters.get(localId)!.id;
    const rejected = expect(waiting).rejects.toThrow("未完成保存");
    await vi.advanceTimersByTimeAsync(10_000);
    await rejected;
    expect(session.info.frozen).toBe(false);
    const next = runtime.drainDatabase({ reason: "quit" });
    runtime.acknowledgeFreeze("unsaved-view", oldRequest);
    expect(session.drainingViews?.has("unsaved-view")).toBe(true);
    runtime.acknowledgeFreeze("unsaved-view", runtime.freezeWaiters.get(localId)!.id);
    const drain = await next;
    drain.commit();
    expect(session.info.frozen).toBe(true);
  });
  it("丢弃本机会话等待保存确认超时后恢复编辑，视图与缓存保留", async () => {
    const { runtime, store, localId } = await setup();
    const session = runtime.sessions.get(localId)!;
    runtime.views.set("unsaved-view", { documentId: localId, windowId: 1 });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const discarding = expect(runtime.discardLocal(session)).rejects.toThrow("未完成保存");
    await vi.advanceTimersByTimeAsync(10_000);
    await discarding;
    expect(session.info.frozen).toBe(false);
    expect(runtime.views.has("unsaved-view")).toBe(true);
    expect(store.list().some(info => info.id === localId)).toBe(true);
  });
  it("正文投影失败不放行退出，已冻结会话回滚后仍可编辑", async () => {
    const { runtime, localId } = await setup();
    const session = runtime.sessions.get(localId)!;
    vi.spyOn(runtime, "project").mockRejectedValueOnce(new Error("disk full"));
    await expect(runtime.drainDatabase({ reason: "quit" })).rejects.toThrow("disk full");
    expect(session.info.frozen).toBe(false);
  });

  it("缓存缺失重建使用新协作基线，稳定正文身份不变", async () => {
    const { runtime, db, store, localId, event } = await setup();
    const previous = runtime.sessions.get(localId)!;
    const identity = ContentDocumentTable.read(db, 7)!.documentId;
    const baseline = previous.doc.getMap("meta").get("baselineId");
    unregisterContentSession(previous);
    previous.awareness.destroy();
    previous.doc.destroy();
    runtime.sessions.delete(localId);
    store.remove(localId);
    const opened = await runtime.openContent(event, { contentId: 7 });
    const current = runtime.sessions.get(opened.documentId)!;
    expect(current.doc.getMap("meta").get("baselineId")).not.toBe(baseline);
    expect(ContentDocumentTable.read(db, 7)!.documentId).toBe(identity);
    expect(current.info.source?.projectionRevision).toBe(
      ContentDocumentTable.read(db, 7)!.revision
    );
    await runtime.project(current);
  });

  it("冷缓存损坏时备份后丢弃，打开正文按主库重建", async () => {
    const { runtime, db, store, localId, event } = await setup();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const previous = runtime.sessions.get(localId)!;
    unregisterContentSession(previous);
    previous.awareness.destroy();
    previous.doc.destroy();
    runtime.sessions.delete(localId);
    store.db.prepare("UPDATE sessions SET state_hash='broken' WHERE id=?").run(localId);
    const opened = await runtime.openContent(event, { contentId: 7 });
    expect(opened.documentId).toBe(localId);
    expect(runtime.sessions.get(localId)!.doc.getText("title")).toBeDefined();
    expect(() => store.load(localId)).not.toThrow();
    expect(readdirSync(join(runtime.directory, "discarded"))).toHaveLength(1);
    expect(ContentDocumentTable.read(db, 7)).not.toBeNull();
  });

  it("共享冷缓存损坏不阻断刷新，按远端快照重建并清除错误", async () => {
    const { runtime, store, localId, event } = await setup();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { documentId } = await runtime.createContent(event, 7);
    expect(runtime.sessions.has(localId)).toBe(false);
    const shared = runtime.sessions.get(documentId)!;
    unregisterContentSession(shared);
    shared.awareness.destroy();
    shared.doc.destroy();
    runtime.sessions.delete(documentId);
    store.db.prepare("UPDATE sessions SET state_hash='broken' WHERE id=?").run(documentId);
    runtime.stopped = false;
    vi.spyOn(
      runtime as unknown as { connectEvents(): Promise<void> },
      "connectEvents"
    ).mockResolvedValue();
    store.set("identity:http://test", "{}");
    await (runtime as unknown as { refresh(): Promise<void> }).refresh();
    runtime.stopped = true;
    const rebuilt = runtime.sessions.get(documentId)!;
    expect(rebuilt.info.serverUrl).toBe("http://test");
    expect(rebuilt.info.source?.contentId).toBe(7);
    expect((runtime as unknown as { error?: string }).error).toBeUndefined();
    expect(readdirSync(join(runtime.directory, "discarded"))).toHaveLength(1);
  });

  it("共享会话遇到远端换代：备份旧缓存后按远端快照重建，不冻结", async () => {
    const { runtime, store, event } = await setup();
    const { documentId } = await runtime.createContent(event, 7);
    const shared = runtime.sessions.get(documentId)!;
    shared.info.pending = true;
    const client = runtime.client as unknown as {
      request: (url: string, path: string, ...rest: unknown[]) => Promise<unknown>;
    };
    const original = client.request.bind(client);
    // 服务器报告更高代次：旧会话的缓存不能再合入
    vi.spyOn(client, "request").mockImplementation(async (url, path, ...rest) => {
      const value = await original(url, path, ...rest);
      return path.endsWith("/protocol")
        ? { ...(value as Record<string, unknown>), epoch: 9 }
        : value;
    });
    const sync = runtime as unknown as {
      syncRemoteDocument(url: string, info: unknown): Promise<void>;
    };
    // 重建后第二次对齐看到的是新会话自身的代次，恢复真实协议响应
    const protocol = vi.mocked(client.request);
    const send = vi.spyOn(
      runtime as unknown as { broadcast(channel: string, value: unknown): void },
      "broadcast"
    );
    await sync
      .syncRemoteDocument("http://test", { ...shared.info })
      .finally(() => protocol.mockRestore());
    const rebuilt = runtime.sessions.get(documentId)!;
    expect(rebuilt).not.toBe(shared);
    expect(rebuilt.info.frozen).toBeFalsy();
    expect(rebuilt.info.remoteVersionAvailable).toBeFalsy();
    expect(rebuilt.info.source?.contentId).toBe(7);
    expect(readdirSync(join(runtime.directory, "discarded"))).toHaveLength(1);
    expect(
      store.db.prepare("SELECT count(*) AS count FROM sessions WHERE id=?").get(documentId)
    ).toEqual({ count: 1 });
    expect(send).toHaveBeenCalledWith("collaboration:removed", { documentId, replaced: true });
    // 重建保持静默：不再广播 collaboration:notice
    expect(send).not.toHaveBeenCalledWith("collaboration:notice", expect.anything());
  });

  it("重启后主库先被其它入口改写：打开正文显示新内容，旧缓存备份后重建，后续编辑能落库", async () => {
    const { runtime, db, store, localId, event } = await setup();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const previous = runtime.sessions.get(localId)!;
    const tree = new NodeTree(previous.doc);
    try {
      const [node] = readNodeDocument(previous.doc).content;
      applyNodeTreeContent(tree, [{ ...node, children: [{ text: "缓存里未投影的正文" }] }], {});
    } finally {
      tree.dispose();
    }
    store.compact(localId, previous.doc);
    // 模拟重启：内存会话消失，只剩冷缓存
    unregisterContentSession(previous);
    previous.awareness.destroy();
    previous.doc.destroy();
    runtime.sessions.delete(localId);
    // 打开前插件/MCP 改写了主库
    const before = ContentDocumentTable.read(db, 7)!;
    const replacement = structuredClone(before);
    replacement.content[0].children = [{ text: "外部新正文" }];
    ContentDocumentTable.commit(db, 7, replacement, {
      expectedRevision: before.revision,
      count: 5,
    });

    await runtime.openContent(event, { contentId: 7 });
    const reopened = runtime.sessions.get(localId)!;
    expect(JSON.stringify(readNodeDocument(reopened.doc).content)).toContain("外部新正文");
    expect(reopened.info.source?.projectionRevision).toBe(
      ContentDocumentTable.read(db, 7)!.revision
    );
    const [backup] = readdirSync(join(runtime.directory, "discarded"));
    expect(backup).toBeDefined();
    expect(
      JSON.stringify(
        readNodeDocument(
          (() => {
            const doc = new Y.Doc({ gc: false });
            const saved = JSON.parse(
              readFileSync(join(runtime.directory, "discarded", backup), "utf8")
            );
            Y.applyUpdate(doc, Buffer.from(saved.state, "base64"));
            for (const update of saved.updates) Y.applyUpdate(doc, Buffer.from(update, "base64"));
            return doc;
          })()
        ).content
      )
    ).toContain("缓存里未投影的");

    reopened.doc.getText("title").insert(0, "新标题");
    await expect(runtime.project(reopened)).resolves.toBeUndefined();
  });
  it("冷缓存修订落后但主库只是投影相同内容时直接写回，不重建", async () => {
    const { runtime, store, localId, event } = await setup();
    const previous = runtime.sessions.get(localId)!;
    previous.doc.getText("title").insert(0, "未投影标题");
    store.compact(localId, previous.doc);
    const baseline = previous.doc.getMap("meta").get("baselineId");
    unregisterContentSession(previous);
    previous.awareness.destroy();
    previous.doc.destroy();
    runtime.sessions.delete(localId);
    await runtime.openContent(event, { contentId: 7 });
    const reopened = runtime.sessions.get(localId)!;
    expect(reopened.doc.getMap("meta").get("baselineId")).toBe(baseline);
    expect(reopened.doc.getText("title").toString()).toContain("未投影标题");
  });
  it("外部正文已更新时旧缓存不能借最新修订覆盖，原输入仍留在缓存", async () => {
    const { runtime, db, store, localId } = await setup();
    const session = runtime.sessions.get(localId)!;
    const before = ContentDocumentTable.read(db, 7)!;
    const replacement = structuredClone(before);
    replacement.content[0].children = [{ text: "外部新正文" }];
    ContentDocumentTable.commit(db, 7, replacement, {
      expectedRevision: before.revision,
      count: 5,
    });
    await expect(runtime.project(session)).rejects.toThrow("修订冲突");
    expect(ContentDocumentTable.read(db, 7)!.content[0].children).toEqual([{ text: "外部新正文" }]);
    const retained = store.load(localId);
    try {
      expect(JSON.stringify(readNodeDocument(retained.doc))).toContain("正文");
      expect(retained.info.source?.projectionRevision).toBe(before.revision);
    } finally {
      retained.doc.destroy();
    }
  });

  it("替换引用后旧实体仍由撤销持有保护，撤销只恢复一次同步引用数", async () => {
    const { runtime, db, state, localId } = await setup();
    for (const id of [41, 42])
      db.prepare(
        "INSERT INTO white_board_contents(id,create_time,update_time,data,ref_count) VALUES (?,1,1,'{}',0)"
      ).run(id);
    const first = ContentIdentityTable.reference(db, "whiteboard-content", 41),
      second = ContentIdentityTable.reference(db, "whiteboard-content", 42);
    const session = runtime.sessions.get(localId)!,
      tree = new NodeTree(session.doc),
      origin = {};
    const definition = await prepareContentContract("host.whiteboard", {
      type: "whiteboard",
      dataVersion: 1,
      kind: "block",
      isVoid: true,
    });
    await tree.installContracts({ [definition.id]: definition.contract }, null);
    tree.insertNode(
      {
        type: "whiteboard",
        collabId: "board",
        tauContract: definition.id,
        entityRef: first,
        children: [{ text: "" }],
      },
      null,
      1,
      null,
      true
    );
    await runtime.project(session);
    const history = tree.createUndoManager({ trackedOrigins: new Set([origin]) });
    try {
      tree.setProperties("board", { entityRef: second }, origin);
      await runtime.project(session);
      expect(state.isHeld("library", first)).toBe(true);
      expect(state.isHeld("library", second)).toBe(true);
      expect(db.prepare("SELECT id,ref_count FROM white_board_contents ORDER BY id").all()).toEqual(
        [
          { id: 41, ref_count: 0 },
          { id: 42, ref_count: 1 },
        ]
      );
      history.undo();
      await runtime.project(session);
      expect(db.prepare("SELECT id,ref_count FROM white_board_contents ORDER BY id").all()).toEqual(
        [
          { id: 41, ref_count: 1 },
          { id: 42, ref_count: 0 },
        ]
      );
    } finally {
      history.destroy();
      tree.dispose();
    }
  });
  for (const shared of [false, true])
    it(`${shared ? "共享" : "本机"}快照写入复用稳定节点和源码字段，旧修订不会覆盖新正文`, async () => {
      const { runtime, localId, event, db, server, owner, state } = await setup();
      let session = runtime.sessions.get(localId)!;
      const declaration = await prepareContentContract("example", {
        type: "example.source",
        dataVersion: 1,
        kind: "block",
        isVoid: true,
        collaboration: { textFields: ["source"] },
      });
      const tree = new NodeTree(session.doc);
      await tree.installContracts({ [declaration.id]: declaration.contract }, null);
      tree.insertNode(
        {
          type: "example.source",
          collabId: "source",
          tauContract: declaration.id,
          source: "初始源码",
          children: [{ text: "" }],
        },
        null,
        1,
        null,
        true
      );
      tree.dispose();
      await runtime.project(session);
      if (shared)
        session = runtime.sessions.get((await runtime.createContent(event, 7)).documentId)!;
      const before = ContentTable.getContentById(db, 7)!;
      const content = structuredClone(before.content) as ContentNode[];
      content[1].source = "修改源码";
      await ContentTable.writeContent(db, 7, {
        content: content as never,
        contracts: before.contracts,
        expectedRevision: before.revision,
      });
      expect(readNodeDocument(session.doc).content[1]).toMatchObject({
        collabId: "source",
        source: "修改源码",
      });
      await validateNodeDocument(session.doc);
      expect(state.documentDrafts("library")).toHaveLength(0);
      await expect(
        ContentTable.writeContent(db, 7, {
          content: before.content,
          expectedRevision: before.revision,
        })
      ).rejects.toThrow("VERSION_CONFLICT");
      if (shared) {
        const remote = server.store.loadDocument(session.info.id),
          fork = new Y.Doc({ gc: false });
        try {
          Y.applyUpdate(fork, Y.encodeStateAsUpdate(remote));
          const vector = Y.encodeStateVector(fork),
            peer = new NodeTree(fork);
          peer.textField("source", "source").insert(0, "远端");
          await server.store.appendUpdate(
            session.info.id,
            owner.id,
            Y.encodeStateAsUpdate(fork, vector),
            remote
          );
          const latest = ContentTable.getContentById(db, 7)!;
          await expect(
            ContentTable.writeContent(db, 7, {
              content: before.content,
              contracts: latest.contracts,
              expectedRevision: latest.revision,
            })
          ).rejects.toThrow("VERSION_CONFLICT");
          expect(state.documentDrafts("library")).toHaveLength(1);
          expect(new NodeTree(remote).textField("source", "source").toString()).toContain("远端");
          peer.dispose();
        } finally {
          remote.destroy();
          fork.destroy();
        }
      }
    });
  it("正文助理复用稳定节点操作，回执保存在本机缓存，不污染共享文档根", async () => {
    const { runtime, localId, db, store } = await setup();
    const session = runtime.sessions.get(localId)!,
      tree = new NodeTree(session.doc);
    const list = await prepareContentContract("tau.check-list", {
      type: "check-list",
      dataVersion: 1,
      kind: "block",
    });
    const item = await prepareContentContract("tau.check-list-item", {
      type: "check-list-item",
      dataVersion: 1,
      kind: "block",
    });
    const paragraph = Object.entries(tree.contracts.toJSON()).find(
      ([, value]) => (value as { type: string }).type === "paragraph"
    )![0];
    await tree.installContracts({ [list.id]: list.contract, [item.id]: item.contract }, null);
    tree.insertNode(
      {
        type: "check-list",
        tauContract: list.id,
        collabId: "tasks",
        children: [
          {
            type: "check-list-item",
            tauContract: item.id,
            collabId: "item",
            taskId: "task",
            checked: false,
            children: [
              {
                type: "paragraph",
                tauContract: paragraph,
                collabId: "task-title",
                children: [{ text: "原任务" }],
              },
            ],
          },
        ],
      },
      null,
      1,
      null,
      true
    );
    await runtime.project(session);
    db.prepare(
      "INSERT INTO articles(title,content_id,create_time,update_time) VALUES ('正文',7,1,1)"
    ).run();
    const ref = { kind: "document" as const, contentId: 7, createdAt: 1, taskId: "task" };
    const before = readTask(db, ref);
    const result = new TaskAssistantEngine(db).execute(
      "update_todo",
      {
        requestId: "stable-task",
        taskRef: ref,
        revision: before.revision,
        patch: { title: "修改后的任务" },
      },
      "batch"
    );
    expect(result.status, JSON.stringify(result)).toBe("succeeded");
    expect(readTask(db, ref).title).toBe("修改后的任务");
    expect(tree.nodeSnapshot("task-title").children?.[0].text).toBe("修改后的任务");
    expect(session.doc.share.has("task-operation-receipts")).toBe(false);
    expect(store.get(`task-receipt:${localId}:${result.operationId}`, null)).not.toBeNull();
    await validateNodeDocument(session.doc);
    tree.dispose();
  });
  it("整库被下载替换后丢弃本库的本地缓存，重开正文读新库内容", async () => {
    const { runtime, event, store, localId } = await setup();
    const drain = await runtime.drainDatabase({
      databaseName: "library",
      reason: "database-change",
    });
    drain.commit();
    await runtime.releaseLibrary("library");
    expect(runtime.sessions.has(localId)).toBe(false);
    expect(store.list().some(session => session.id === localId)).toBe(false);
    const opened = await runtime.openContent(event, { contentId: 7 });
    expect(opened.frozen).toBe(false);
  });

  it("同步替换释放未加载的冷缓存，之后按新库重新打开", async () => {
    const { runtime, event, store, localId } = await setup();
    const session = runtime.sessions.get(localId)!;
    unregisterContentSession(session);
    session.awareness.destroy();
    session.doc.destroy();
    runtime.sessions.delete(localId);
    await runtime.releaseLibrary("library");
    expect(store.list().some(info => info.id === localId)).toBe(false);
    expect((await runtime.openContent(event, { contentId: 7 })).frozen).toBe(false);
  });

  it("旧来源冷缓存按当前主库重建，并发打开得到同一会话", async () => {
    const { runtime, event, db, localId } = await setup();
    const session = runtime.sessions.get(localId)!;
    unregisterContentSession(session);
    session.awareness.destroy();
    session.doc.destroy();
    runtime.sessions.delete(localId);
    db.prepare("UPDATE library_identity SET source_id='downloaded-library'").run();
    const original = ContentDocumentTable.read(db, 7)!;
    const opened = await Promise.all([
      runtime.openContent(event, { contentId: 7 }),
      runtime.openContent(event, { contentId: 7 }),
    ]);
    expect(opened[0].source?.librarySourceId).toBe("downloaded-library");
    expect(opened[1].documentId).toBe(opened[0].documentId);
    expect(ContentDocumentTable.read(db, 7)).toEqual(original);
    await expect(runtime.project(runtime.sessions.get(localId)!)).resolves.toBeUndefined();
  });

  it.each(["database-change", "quit"] as const)(
    "主库回退旧格式后 %s 保留新缓存且不投影",
    async reason => {
      const { runtime, db, store, localId } = await setup();
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const session = runtime.sessions.get(localId)!;
      const before = Y.encodeStateAsUpdate(session.doc);
      db.prepare("DELETE FROM content_documents WHERE content_id=7").run();
      const original = db.prepare("SELECT content FROM contents WHERE id=7").get();
      const drain = await runtime.drainDatabase({ databaseName: "library", reason });
      expect(session.info.frozen).toBe(true);
      const cached = store.load(localId);
      expect(Y.encodeStateAsUpdate(cached.doc)).toEqual(before);
      cached.doc.destroy();
      expect(db.prepare("SELECT content FROM contents WHERE id=7").get()).toEqual(original);
      expect(ContentDocumentTable.read(db, 7)).toBeNull();
      drain.rollback();
      expect(session.info.frozen).toBe(false);
    }
  );

  it("不同来源缓存未能保存时仍拒绝关库并恢复编辑", async () => {
    const { runtime, db, store, localId } = await setup();
    db.prepare("DELETE FROM content_documents WHERE content_id=7").run();
    runtime.sessions.get(localId)!.dirty = true;
    vi.spyOn(store, "compact").mockImplementation(() => {
      throw new Error("缓存磁盘写入失败");
    });
    await expect(
      runtime.drainDatabase({ databaseName: "library", reason: "quit" })
    ).rejects.toThrow("缓存磁盘写入失败");
    expect(runtime.sessions.get(localId)!.info.frozen).toBe(false);
  });

  it("资料库连接重开但身份与正文未变时恢复原会话", async () => {
    const { runtime, event, localId } = await setup();
    const drain = await runtime.drainDatabase({
      databaseName: "library",
      reason: "database-change",
    });
    drain.commit();
    const opened = await runtime.openContent(event, { contentId: 7 });
    expect(opened.documentId).toBe(localId);
    expect(opened.frozen).toBe(false);
  });
  it("转换后发布原类型及业务字段，结束共享接回最终正文且保持主库身份", async () => {
    const { runtime, db, server, owner, event } = await setup();
    const identity = ContentDocumentTable.read(db, 7)!.documentId;
    const shared = await runtime.createContent(event, 7);
    const session = runtime.sessions.get(shared.documentId)!;
    expect(readNodeDocument(session.doc).content[0]).toMatchObject({
      type: "paragraph",
      svg: "用户业务内容",
      isFold: true,
    });
    const remote = server.store.loadDocument(shared.documentId),
      current = server.store.loadDocument(shared.documentId),
      tree = new NodeTree(remote);
    try {
      const before = Y.encodeStateVector(remote);
      tree.insertText(String(tree.read()[0].collabId), 0, "远端输入", null);
      await server.store.appendUpdate(
        shared.documentId,
        owner.id,
        Y.encodeStateAsUpdate(remote, before),
        current
      );
    } finally {
      tree.dispose();
      remote.destroy();
      current.destroy();
    }
    await runtime.prepareLeave(session);
    session.info.leaving = true;
    await runtime.finishLeave(session);
    expect(server.store.document(shared.documentId).status).toBe("closed");
    const local = [...runtime.sessions.values()].find(value => value.info.mode === "local")!;
    expect(local).toBeDefined();
    expect(JSON.stringify(readNodeDocument(local.doc).content)).toContain("远端输入正文");
    expect(ContentDocumentTable.read(db, 7)!.documentId).toBe(identity);
    expect(db.prepare("SELECT * FROM collaboration_bindings").all()).toEqual([]);
  });

  it("首次发布响应丢失保持本机暂停，重试复用同一候选和房间", async () => {
    const { runtime, event, localId, server, loseResponse } = await setup();
    loseResponse();
    await expect(runtime.createContent(event, 7)).rejects.toThrow("响应丢失");
    expect(runtime.sessions.get(localId)!.info.frozen).toBe(true);
    const result = await runtime.createContent(event, 7);
    expect(runtime.sessions.has(result.documentId)).toBe(true);
    expect(server.store.db.prepare("SELECT count(*) AS count FROM documents").get()).toEqual({
      count: 1,
    });
  });
});
