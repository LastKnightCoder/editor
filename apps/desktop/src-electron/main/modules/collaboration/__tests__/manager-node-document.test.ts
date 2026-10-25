import { createSharedDocument } from "@tau/collaboration/src/testing/legacy-document";
import { WhiteboardJournal } from "../../whiteboard-documents/journal";
import { WhiteboardDocumentRepository } from "../../whiteboard-documents/repository";
import { WhiteboardModel } from "@tau/collaboration";
import { prepareWhiteboardContract } from "@tau/db-schema/content-contracts";
// @vitest-environment node
import Database from "better-sqlite3";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
import {
  prepareContentContract,
  type ContentContractDictionary,
} from "@tau/db-schema/content-contracts";
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
import { ContentRecoveryStore } from "../content-recovery";
import { ContentPluginRegistry } from "@tau/plugins/content";
import { contentRevision } from "../content-sessions";
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
  prepareContentUpgrade(
    event: IpcMainInvokeEvent,
    id: string,
    contracts: ContentContractDictionary,
    upgrade?: import("@tau/collaboration").ContentVersionUpgrade
  ): Promise<{ operationId: string; error?: string }>;
  finishContentUpgrade(
    event: IpcMainInvokeEvent,
    operationId: string,
    cancel: boolean
  ): Promise<void>;
  createContent(event: IpcMainInvokeEvent, contentId: number): Promise<{ documentId: string }>;
  prepareLeave(session: RuntimeSession): Promise<void>;
  finishLeave(session: RuntimeSession): Promise<void>;
  drainDatabase(scope: DocumentDrainScope): Promise<DocumentDrain>;
  preserveLibrary(name: string): Promise<void>;
  preserveSession(
    session: RuntimeSession
  ): Promise<import("../content-local-state").LocalRecoveryReceipt>;
  project(session: RuntimeSession): Promise<void>;
  restore(info: CollaborationSession, doc: Y.Doc): RuntimeSession;
  adoptRemoteVersion(event: IpcMainInvokeEvent, id: string): Promise<void>;
};
function seedLegacyPrivateNodes(
  store: CollaborationLocalStore,
  id: string,
  values: Map<string, ContentNode>
) {
  if (
    !(store.db.prepare("PRAGMA table_info(sessions)").all() as { name: string }[]).some(
      column => column.name === "private_nodes"
    )
  )
    store.db.exec("ALTER TABLE sessions ADD COLUMN private_nodes TEXT NOT NULL DEFAULT '[]'");
  store.db
    .prepare("UPDATE sessions SET private_nodes=? WHERE id=?")
    .run(JSON.stringify([...values]), id);
}
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
    canonicalUrl: (url: string) => url,
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
  const opened = await runtime.openContent(event, { contentId: 7 });
  const paragraph = await prepareContentContract("tau.paragraph", {
    type: "paragraph",
    dataVersion: 1,
    kind: "block",
  });
  const prepared = await runtime.prepareContentUpgrade(event, opened.documentId, {
    [paragraph.id]: paragraph.contract,
  });
  await runtime.finishContentUpgrade(event, prepared.operationId, false);
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
  it("正文投影失败不放行退出，已冻结会话回滚后仍可编辑", async () => {
    const { runtime, localId } = await setup();
    const session = runtime.sessions.get(localId)!;
    vi.spyOn(runtime, "project").mockRejectedValueOnce(new Error("disk full"));
    await expect(runtime.drainDatabase({ reason: "quit" })).rejects.toThrow("disk full");
    expect(session.info.frozen).toBe(false);
  });
  it("带来源会话重复保全复用副本，附件原位变化必须另存原始材料", async () => {
    const { runtime, state, store, localId } = await setup();
    const session = runtime.sessions.get(localId)!;
    const path = join(runtime.directory, "kept.png");
    writeFileSync(path, "one");
    store.db
      .prepare("INSERT INTO resources VALUES (?,?,?,?,?,?)")
      .run("image", localId, "kept.png", "image/png", path, 1);
    const recovery = new ContentRecoveryStore(runtime.directory, state);
    const first = await runtime.preserveSession(session);
    expect(await runtime.preserveSession(session)).toEqual(first);
    writeFileSync(path, "two");
    const changed = await runtime.preserveSession(session);
    expect(changed.id).not.toBe(first.id);
    const resource = JSON.parse(recovery.readFile(first, "resources.json").toString())[0];
    expect(recovery.readFile(first, resource.file).toString()).toBe("one");
    expect(await runtime.preserveSession(session)).toEqual(changed);
  });

  it("单篇会话副本不包含同库其他正文、草稿、视图和附件", async () => {
    const { runtime, db, state, localId } = await setup();
    const session = runtime.sessions.get(localId)!;
    db.prepare(
      "INSERT INTO contents(id,create_time,update_time,content,count,ref_count) VALUES (999,2,2,?,0,1)"
    ).run(
      JSON.stringify([{ type: "image", url: "/其他附件.png", children: [{ text: "无关正文" }] }])
    );
    state.replaceHolds("library", "document:other", "recovery", [
      ContentIdentityTable.reference(db, "content", 999),
    ]);
    for (const documentId of [localId, "other"]) {
      const identity = { workspaceId: "library", documentId, baselineId: "base", epoch: 0 };
      state.saveInputDraft(identity, documentId, {
        nodeId: "node",
        field: "code",
        value: documentId,
        revision: "r",
        sequence: 1,
      });
      state.saveDocumentDraft(identity, documentId, {
        state: Y.encodeStateAsUpdate(session.doc),
        sequence: 1,
      });
      state.writeView(
        {
          workspaceId: "library",
          documentId: documentId === localId ? session.info.source!.contentDocumentId! : documentId,
          nodeId: "node",
          owner: "tau.paragraph",
        },
        { title: documentId },
        null
      );
    }
    const receipt = await runtime.preserveSession(session);
    const recovery = new ContentRecoveryStore(runtime.directory, state);
    const manifest = recovery.verify(receipt);
    expect(manifest.files.some(file => file.name.endsWith(".db"))).toBe(false);
    const projection = JSON.parse(recovery.readFile(receipt, "source-projection.json").toString());
    expect(projection.source.contentId).toBe(7);
    expect(projection.contracts).toEqual(ContentDocumentTable.read(db, 7)!.contracts);
    expect(JSON.stringify(projection)).not.toContain("无关正文");
    const drafts = JSON.parse(recovery.readFile(receipt, "input-drafts.json").toString());
    expect(drafts).toHaveLength(1);
    expect(drafts[0].documentId).toBe(localId);
    expect(JSON.parse(recovery.readFile(receipt, "node-views.json").toString())).toHaveLength(1);
    expect(manifest.files.filter(file => /^view-.*\.bin$/.test(file.name))).toHaveLength(1);
    expect(manifest.missing).not.toContain("/其他附件.png");
    expect(recovery.readFile(receipt, "resources.json").toString()).not.toContain("其他附件");
  });

  it("无来源会话不打包当前主库，视图变化后重新保全", async () => {
    const { runtime, db, state, localId } = await setup();
    const session = runtime.sessions.get(localId)!;
    session.info.source = undefined;
    host.databases.set("application", db);
    const recovery = new ContentRecoveryStore(runtime.directory, state);
    const first = await runtime.preserveSession(session);
    expect(
      recovery
        .verify(first)
        .files.some(file => file.name.endsWith(".db") || file.name === "source-projection.json")
    ).toBe(false);
    state.writeView(
      { workspaceId: "application", documentId: localId, nodeId: "node", owner: "tau.paragraph" },
      { isFold: true },
      null
    );
    const next = await runtime.preserveSession(session);
    expect(next.id).not.toBe(first.id);
    expect(JSON.parse(recovery.readFile(next, "node-views.json").toString())).toHaveLength(1);
  });

  it("单篇保全拒绝来源已变化的同号正文", async () => {
    const { runtime, db, localId } = await setup();
    db.prepare("UPDATE library_identity SET source_id='different'").run();
    await expect(runtime.preserveSession(runtime.sessions.get(localId)!)).rejects.toThrow(
      "来源已变化"
    );
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
    await expect(runtime.project(session)).rejects.toThrow("修订已变化");
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
  for (const shared of [false, true])
    it(`${shared ? "共享" : "本机"}正文通过作者 migrations 从 v1 转为 v2，并保留未知属性与节点身份`, async () => {
      const { runtime, event, db, localId } = await setup();
      const v1 = {
        type: "example.diagram",
        dataVersion: 1,
        kind: "block" as const,
        isVoid: true,
        collaboration: { textFields: ["source"] },
        render: () => null,
      };
      const catalog = await new ContentPluginRegistry().prepareEditorContracts([
        {
          apiVersion: 1,
          id: "example",
          elements: [
            {
              ...v1,
              dataVersion: 2,
              collaboration: { textFields: ["code"] },
              previousVersions: [{ element: v1, access: "read" }],
              migrations: [
                {
                  from: 1,
                  migrate: data => {
                    const { source, ...rest } = data;
                    return { ...rest, code: source };
                  },
                },
              ],
            },
          ],
        },
      ]);
      const old = Object.entries(catalog.dictionary).find(
        ([, contract]) => contract.dataVersion === 1
      )!;
      let session = runtime.sessions.get(localId)!;
      const tree = new NodeTree(session.doc);
      await tree.installContracts({ [old[0]]: old[1] }, null);
      tree.insertNode(
        {
          type: v1.type,
          collabId: "diagram",
          tauContract: old[0],
          source: "原源码",
          custom: "保留",
          children: [{ text: "" }],
        },
        null,
        1,
        null,
        true
      );
      tree.dispose();
      await runtime.project(session);
      if (shared) {
        const published = await runtime.createContent(event, 7);
        session = runtime.sessions.get(published.documentId)!;
      }
      const before = readNodeDocument(session.doc);
      const content = before.content.map(node =>
        node.type === v1.type ? (catalog.migrate(node) as ContentNode) : node
      );
      const contracts = {
        ...session.doc.getMap("node-tree:contracts").toJSON(),
        ...catalog.dictionary,
      } as ContentContractDictionary;
      const prepared = await runtime.prepareContentUpgrade(event, session.info.id, contracts, {
        expectedRevision: contentRevision(session),
        content,
      });
      expect(prepared.error).toBeUndefined();
      await runtime.finishContentUpgrade(event, prepared.operationId, false);
      const saved = ContentDocumentTable.read(db, 7)!;
      expect(saved.content[1]).toMatchObject({
        collabId: "diagram",
        tauContract: catalog.current(v1.type)!.id,
        code: "原源码",
        custom: "保留",
      });
      expect(saved.content[1]).not.toHaveProperty("source");
    });
  it("准备阶段已冻结但响应丢失时仍能取消，并保持原文和原格式", async () => {
    const { runtime, server, owner, event, store, state } = await setup();
    const room = server.store.create(owner.id, "cancel-preparing");
    const doc = createSharedDocument({
      title: "旧文档",
      content: [{ type: "paragraph", children: [{ text: "保留原文" }] }],
      bannerBg: "",
      bannerPosition: "center",
    });
    server.store.publish(room.id, owner.id, Y.encodeStateAsUpdate(doc));
    const info = {
      ...runtime.sessions.values().next().value!.info,
      id: room.id,
      mode: "shared",
      serverUrl: "http://test",
      ownerId: owner.id,
      source: undefined,
    } as CollaborationSession;
    store.create(info, doc);
    runtime.restore(info, doc);
    const original = runtime.client.request.bind(runtime.client);
    const request = vi.spyOn(runtime.client, "request").mockImplementation(async (...args) => {
      const result = await original(...args);
      if (args[1].endsWith("/freeze")) throw new Error("模拟冻结响应丢失");
      return result;
    });
    const result = await runtime.prepareContentUpgrade(event, room.id, {});
    expect(state.preparation(room.id)?.operationId).toBe(result.operationId);
    expect(runtime.sessions.get(room.id)!.info.frozen).toBe(true);
    request.mockRestore();
    await runtime.finishContentUpgrade(event, result.operationId, true);
    expect(state.preparation(room.id)).toBeNull();
    expect(runtime.sessions.get(room.id)!.info.frozen).toBe(false);
    const current = server.store.loadDocument(room.id);
    try {
      expect(current.getMap("meta").get("version")).toBe(1);
    } finally {
      current.destroy();
    }
  });
  for (const cancel of [false, true])
    it(`旧共享正文转换${cancel ? "取消保持原文" : "提交丢响应后按回执恢复"}，私有真身不自动公开`, async () => {
      const { runtime, store, server, owner, event, state, loseCommit } = await setup();
      const room = server.store.create(owner.id, `legacy-${cancel}`),
        privateNodes = new Map<string, ContentNode>();
      const doc = createSharedDocument(
        {
          title: "旧共享",
          bannerBg: "",
          bannerPosition: "center",
          content: [
            { type: "paragraph", children: [{ text: "公开正文" }] },
            {
              type: "whiteboard",
              whiteBoardContentId: 42,
              secret: "私有真身",
              children: [{ text: "" }],
            },
          ],
        },
        privateNodes
      );
      server.store.publish(room.id, owner.id, Y.encodeStateAsUpdate(doc));
      const info = {
        ...runtime.sessions.values().next().value!.info,
        id: room.id,
        mode: "shared",
        serverUrl: "http://test",
        ownerId: owner.id,
        source: undefined,
        frozen: false,
      } as CollaborationSession;
      store.create(info, doc);
      expect(
        (store.db.prepare("PRAGMA table_info(sessions)").all() as { name: string }[]).some(
          column => column.name === "private_nodes"
        )
      ).toBe(false);
      seedLegacyPrivateNodes(store, info.id, privateNodes);
      runtime.restore(info, doc);
      const offline = new Y.Doc({ gc: false });
      Y.applyUpdate(offline, Y.encodeStateAsUpdate(doc));
      offline.getText("title").insert(0, "未确认输入");
      const paragraph = await prepareContentContract("tau.paragraph", {
        type: "paragraph",
        dataVersion: 1,
        kind: "block",
      });
      const prepared = await runtime.prepareContentUpgrade(event, room.id, {
        [paragraph.id]: paragraph.contract,
      });
      if (!cancel) {
        loseCommit();
        await expect(
          runtime.finishContentUpgrade(event, prepared.operationId, false)
        ).rejects.toThrow("响应丢失");
        expect(runtime.sessions.get(room.id)!.info.frozen).toBe(true);
      }
      await runtime.finishContentUpgrade(event, prepared.operationId, cancel);
      const current = server.store.loadDocument(room.id);
      try {
        expect(current.getMap("meta").get("version")).toBe(cancel ? 1 : 2);
        expect(state.migration(prepared.operationId)?.phase).toBe(cancel ? "ABORTED" : "COMPLETE");
        if (!cancel) {
          expect(JSON.stringify(readNodeDocument(current))).not.toContain("私有真身");
          expect(store.legacyPrivateNodes(room.id).size).toBe(0);
          expect(
            (store.db.prepare("PRAGMA table_info(sessions)").all() as { name: string }[]).some(
              column => column.name === "private_nodes"
            )
          ).toBe(false);
        }
        const record = state.migration(prepared.operationId)!;
        if (record.plan.kind === "whiteboard") throw new Error("正文迁移种类错误");
        const recovery = new ContentRecoveryStore(runtime.directory, state);
        expect(recovery.readFile(record.plan.recovery, "private-before.json").toString()).toContain(
          "私有真身"
        );
        if (!cancel) {
          const installed = runtime.sessions.get(room.id)!;
          installed.awareness.destroy();
          installed.doc.destroy();
          runtime.sessions.delete(room.id);
          store.compact(room.id, offline);
          seedLegacyPrivateNodes(store, room.id, privateNodes);
          runtime.restore({ ...info, role: "editor", remoteVersionAvailable: true }, offline);
          await runtime.adoptRemoteVersion(event, room.id);
          expect(runtime.sessions.get(room.id)!.doc.getMap("meta").get("version")).toBe(2);
          expect(runtime.sessions.get(room.id)!.doc.getText("title").toString()).not.toContain(
            "未确认输入"
          );
          const latest = state.db
            .prepare("SELECT record FROM migrations ORDER BY rowid DESC LIMIT 1")
            .get() as { record: string };
          const retained = new Y.Doc();
          try {
            Y.applyUpdate(
              retained,
              recovery.readFile(JSON.parse(latest.record).plan.recovery, "document-before.bin")
            );
            expect(retained.getText("title").toString()).toContain("未确认输入");
          } finally {
            retained.destroy();
          }
        } else offline.destroy();
      } finally {
        current.destroy();
      }
    });
  it("已结束旧共享在原库转换为本机正文，旧真身只进入本机和恢复包", async () => {
    const { runtime, event, db, store, state } = await setup();
    const original: ContentNode[] = [
      { type: "whiteboard", whiteBoardContentId: 42, secret: "本机真身", children: [{ text: "" }] },
    ];
    db.prepare(
      "INSERT INTO white_board_contents(id,create_time,update_time,data,ref_count) VALUES (42,1,1,'{}',1)"
    ).run();
    db.prepare(
      "INSERT INTO contents(id,create_time,update_time,content,ref_count) VALUES (8,2,2,?,1)"
    ).run(JSON.stringify(original));
    db.prepare(
      "INSERT INTO collaboration_bindings VALUES (8,2,'http://test','closed-room',NULL,NULL,NULL)"
    ).run();
    const privateNodes = new Map<string, ContentNode>();
    const doc = createSharedDocument(
      { title: "旧共享", content: original, bannerBg: "", bannerPosition: "center" },
      privateNodes
    );
    const info = {
      ...runtime.sessions.values().next().value!.info,
      id: "closed-room",
      mode: "shared",
      serverUrl: "http://test",
      status: "closed",
      source: { databaseName: "library", contentId: 8, contentCreatedAt: 2 },
    } as CollaborationSession;
    store.create(info, doc);
    seedLegacyPrivateNodes(store, info.id, privateNodes);
    runtime.restore(info, doc);
    const whiteboard = await prepareContentContract("host.whiteboard", {
      type: "whiteboard",
      dataVersion: 1,
      kind: "block",
      isVoid: true,
    });
    const prepared = await runtime.prepareContentUpgrade(event, info.id, {
      [whiteboard.id]: whiteboard.contract,
    });
    expect(prepared.error).toBeUndefined();
    await runtime.finishContentUpgrade(event, prepared.operationId, false);
    const opened = await runtime.openContent(event, { contentId: 8 });
    expect(opened.mode).toBe("local");
    expect(JSON.stringify(ContentDocumentTable.read(db, 8)!.content)).toContain("本机真身");
    expect(store.legacyPrivateNodes(opened.documentId).size).toBe(0);
    const record = state.migration(prepared.operationId)!;
    if (record.plan.kind === "whiteboard") throw new Error("正文迁移种类错误");
    expect(
      new ContentRecoveryStore(runtime.directory, state)
        .readFile(record.plan.recovery, "private-before.json")
        .toString()
    ).toContain("本机真身");
  });
  it("普通切换不备份，真正覆盖保全主库与本机库，换库不回写同号正文", async () => {
    const { runtime, event, db, store, state, localId } = await setup();
    const session = runtime.sessions.get(localId)!;
    const cancelled = await runtime.drainDatabase({
      databaseName: "library",
      reason: "database-change",
    });
    expect(session.info.frozen).toBe(true);
    expect(store.get("library-recovery:library", null)).toBeNull();
    cancelled.rollback();
    expect(session.info.frozen).toBe(false);
    expect(store.get(`library-detached:${localId}`, null)).toBeNull();
    const replaced = await runtime.drainDatabase({
      databaseName: "library",
      reason: "database-change",
    });
    await runtime.preserveLibrary("library");
    const receipt = store.get<any>("library-recovery:library", null);
    expect(
      new ContentRecoveryStore(runtime.directory, state)
        .verify(receipt)
        .files.map(file => file.name)
    ).toEqual(expect.arrayContaining(["main.db", "collaboration.db", "resources.json"]));
    db.prepare("UPDATE library_identity SET source_id='another-library'").run();
    replaced.commit();
    await expect(runtime.openContent(event, { contentId: 7 })).rejects.toThrow("快照已替换");
    expect(new ContentRecoveryStore(runtime.directory, state).verify(receipt).files.length).toBe(3);
    expect(session.info.frozen).toBe(true);
  });

  it("未处理前一次替库副本时拒绝再次覆盖，原回执和缓存不变", async () => {
    const { runtime, db, store, state, localId } = await setup();
    const drain = await runtime.drainDatabase({
      databaseName: "library",
      reason: "database-change",
    });
    await runtime.preserveLibrary("library");
    const receipt = store.get<any>("library-recovery:library", null);
    const detached = store.get(`library-detached:${localId}`, null);
    db.prepare("UPDATE library_identity SET source_id='replacement-library'").run();
    drain.commit();
    await expect(runtime.preserveLibrary("library")).rejects.toThrow("再次覆盖已停止");
    expect(store.get("library-recovery:library", null)).toEqual(receipt);
    expect(store.get(`library-detached:${localId}`, null)).toEqual(detached);
    expect(new ContentRecoveryStore(runtime.directory, state).verify(receipt).files.length).toBe(3);
  });

  it("保全后安装失败且原库未变，重开原文恢复编辑并保留恢复包", async () => {
    const { runtime, event, store, state, localId } = await setup();
    const drain = await runtime.drainDatabase({
      databaseName: "library",
      reason: "database-change",
    });
    await runtime.preserveLibrary("library");
    const receipt = store.get<any>("library-recovery:library", null);
    drain.rollback();
    const opened = await runtime.openContent(event, { contentId: 7 });
    expect(opened.documentId).toBe(localId);
    expect(opened.frozen).toBe(false);
    expect(store.get(`library-detached:${localId}`, null)).toBeNull();
    expect(new ContentRecoveryStore(runtime.directory, state).verify(receipt).files.length).toBe(3);
  });

  it("覆盖前引用文件缺失只告警，仍保存可验证的数据库恢复包", async () => {
    const { runtime, db, store, state } = await setup();
    const warningLog = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    db.prepare(
      "INSERT INTO contents(id,create_time,update_time,content,ref_count) VALUES (99,1,1,?,1)"
    ).run(
      JSON.stringify([
        { type: "image", url: "/unavailable/tau-test-image.png", children: [{ text: "" }] },
      ])
    );
    const drain = await runtime.drainDatabase({
      databaseName: "library",
      reason: "database-change",
    });
    await runtime.preserveLibrary("library");
    expect(warningLog).toHaveBeenCalledWith(
      "[library-replacement:missing-resource]",
      expect.objectContaining({
        databaseName: "library",
        documentId: null,
        reference: "/unavailable/tau-test-image.png",
        resolvedPath: "/unavailable/tau-test-image.png",
        reason: "本地文件不存在或不可访问",
      })
    );
    const receipt = store.get<any>("library-recovery:library", null);
    const recovery = new ContentRecoveryStore(runtime.directory, state);
    const manifest = recovery.verify(receipt);
    expect(manifest.missing).toEqual(["/unavailable/tau-test-image.png"]);
    expect(manifest.files.map(file => file.name)).toEqual(
      expect.arrayContaining(["main.db", "collaboration.db", "resources.json"])
    );
    drain.rollback();
    expect(db.prepare("SELECT id FROM contents WHERE id=99").get()).toEqual({ id: 99 });
  });
  it("整库替换时网络资源和历史 Notion 记录只保留引用，不产生缺失告警", async () => {
    const { runtime, db, store, state, localId } = await setup();
    const warningLog = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const remote = "https://example.com/image.png";
    const notion = "notion://page/unused";
    db.prepare(
      "INSERT INTO contents(id,create_time,update_time,content,ref_count) VALUES (99,1,1,?,1)"
    ).run(JSON.stringify([{ type: "image", url: remote, children: [{ text: "" }] }]));
    store.db
      .prepare("INSERT INTO resources VALUES (?,?,?,?,?,?)")
      .run("unused-notion", localId, "", "", notion, 2);
    const drain = await runtime.drainDatabase({
      databaseName: "library",
      reason: "database-change",
    });
    await runtime.preserveLibrary("library");
    const receipt = store.get<any>("library-recovery:library", null);
    const recovery = new ContentRecoveryStore(runtime.directory, state);
    expect(recovery.verify(receipt).missing).toEqual([]);
    const resources = JSON.parse(recovery.readFile(receipt, "resources.json").toString());
    expect(resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          documentId: localId,
          resources: expect.arrayContaining([
            { reference: "tau-collab-local:unused-notion", original: notion },
          ]),
        }),
        { documentId: null, resources: [{ reference: remote, original: remote }] },
      ])
    );
    expect(warningLog).not.toHaveBeenCalled();
    drain.rollback();
  });
  it("库覆盖前备份失败不生成成功回执，回滚后原会话仍可编辑", async () => {
    const { runtime, db, store, localId } = await setup();
    const drain = await runtime.drainDatabase({
      databaseName: "library",
      reason: "database-change",
    });
    vi.spyOn(db, "backup").mockRejectedValueOnce(new Error("磁盘已满"));
    await expect(runtime.preserveLibrary("library")).rejects.toThrow("磁盘已满");
    expect(store.get("library-recovery:library", null)).toBeNull();
    drain.rollback();
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

it("公共恢复副本包含白板日志与历史资源，普通冲刷不会分离正文会话", async () => {
  const { runtime, db, store, state, localId } = await setup();
  const journal = new WhiteboardJournal(join(host.dir, "whiteboard-documents", "journal.db"));
  const doc = new Y.Doc(),
    model = new WhiteboardModel(doc);
  cleanup.push(() => {
    journal.close();
    model.dispose();
    doc.destroy();
  });
  const [page] = model.submit([{ type: "create_page", title: "白板" }], null).createdIds;
  const contract = await prepareWhiteboardContract("host.whiteboard", {
    type: "image",
    dataVersion: 1,
    resources: [{ path: "src", kind: "image" }],
  });
  const reference = await runtime.assets.keepLocalFile("preserved-board", {
    name: "cover.png",
    mime: "image/png",
    bytes: new Uint8Array([1, 3, 5]),
  });
  model.submit(
    [
      {
        type: "create",
        contractId: contract.id,
        data: { src: reference },
        geometry: { x: 0, y: 0, width: 1, height: 1, rotation: 0 },
        parent: { kind: "page", id: page },
      },
    ],
    null,
    [contract]
  );
  const stored = new WhiteboardDocumentRepository(db, "library").create(
    "preserved-board",
    model,
    "board"
  );
  journal.seed({ ...stored, projectedRevision: stored.revision, projectedHash: stored.hash }, []);
  const drain = await runtime.drainDatabase({ databaseName: "library", reason: "database-change" });
  expect(store.get("library-recovery:library", null)).toBeNull();
  await runtime.preserveLibrary("library");
  const receipt = store.get<any>("library-recovery:library", null);
  const manifest = new ContentRecoveryStore(runtime.directory, state).verify(receipt);
  expect(manifest.files.map(file => file.name)).toContain("whiteboard-journal.db");
  expect(manifest.files.some(file => file.name.startsWith("assets-") && file.bytes === 3)).toBe(
    true
  );
  expect(manifest.missing).toEqual([]);
  drain.rollback();
  expect(runtime.sessions.get(localId)!.info.frozen).toBe(true);
});

it("后台升级无需窗口事件，结束后释放会话并能重新打开同一份正文", async () => {
  const f = await setup();
  f.runtime.stopped = false;
  f.db
    .prepare(
      "INSERT INTO contents(id,create_time,update_time,content,count,ref_count) VALUES(8,10,20,?,2,1)"
    )
    .run(JSON.stringify([{ type: "paragraph", children: [{ text: "后台正文" }] }]));
  const paragraph = await prepareContentContract("tau.paragraph", {
    type: "paragraph",
    dataVersion: 1,
    kind: "block",
  });
  const manager = f.runtime as unknown as CollaborationManager;
  await manager.upgradeLegacyContent("library", 8, { [paragraph.id]: paragraph.contract });
  const installed = ContentDocumentTable.read(f.db, 8)!;
  expect(JSON.stringify(installed.content)).toContain("后台正文");
  expect(f.db.prepare("SELECT update_time FROM contents WHERE id=8").get()).toEqual({
    update_time: 20,
  });
  expect(
    [...f.runtime.sessions.values()].some(session => session.info.source?.contentId === 8)
  ).toBe(false);
  const reopened = await f.runtime.openContent(f.event, { contentId: 8 });
  const session = f.runtime.sessions.get(reopened.documentId)!;
  expect(session.doc.getMap("meta").get("version")).toBe(2);
  expect(JSON.stringify(readNodeDocument(session.doc).content)).toContain("后台正文");
  expect(session.info.source?.contentDocumentId).toBe(installed.documentId);
});

it("正文远程附件没有本地副本时保留引用与恢复清单，不记录升级失败", async () => {
  const f = await setup();
  f.runtime.stopped = false;
  const url = "https://example.com/not-cached.png";
  f.db
    .prepare(
      "INSERT INTO contents(id,create_time,update_time,content,count,ref_count) VALUES(8,10,20,?,0,1)"
    )
    .run(JSON.stringify([{ type: "image", url, children: [{ text: "" }] }]));
  const image = await prepareContentContract("tau.image", {
    type: "image",
    dataVersion: 1,
    kind: "block",
    isVoid: true,
    resources: [{ path: "url", kind: "image" }],
  });
  const opened = await f.runtime.openContent(f.event, { contentId: 8 });
  await (f.runtime as unknown as CollaborationManager).upgradeLegacyContent("library", 8, {
    [image.id]: image.contract,
  });
  expect(JSON.stringify(ContentDocumentTable.read(f.db, 8)!.content)).toContain(url);
  expect(
    f.runtime.store.get(`legacy-upgrade-issues:library:${opened.documentId}`, null)
  ).toBeNull();
  const row = f.runtime.store.db
    .prepare("SELECT record FROM migrations WHERE document_id=?")
    .get(opened.documentId) as { record: string };
  const record = JSON.parse(row.record);
  expect(record.phase).toBe("COMPLETE");
  const manifest = new ContentRecoveryStore(f.runtime.directory, f.runtime.contentState).verify(
    record.plan.recovery
  );
  expect(manifest.missing).toContain(url);
});

it("已有本机候选的共享会话中断续做不依赖再次联网", async () => {
  const f = await setup();
  f.runtime.stopped = false;
  f.db
    .prepare(
      "INSERT INTO contents(id,create_time,update_time,content,count,ref_count) VALUES(8,10,20,?,2,1)"
    )
    .run(JSON.stringify([{ type: "paragraph", children: [{ text: "待续做" }] }]));
  const opened = await f.runtime.openContent(f.event, { contentId: 8 });
  const paragraph = await prepareContentContract("tau.paragraph", {
    type: "paragraph",
    dataVersion: 1,
    kind: "block",
  });
  const prepared = await f.runtime.prepareContentUpgrade(f.event, opened.documentId, {
    [paragraph.id]: paragraph.contract,
  });
  const session = f.runtime.sessions.get(opened.documentId)!;
  session.info.mode = "shared";
  const request = vi.spyOn(f.runtime.client, "request").mockRejectedValue(new Error("离线"));
  await (f.runtime as unknown as CollaborationManager).upgradeLegacySession(
    "library",
    opened.documentId,
    {}
  );
  expect(request).not.toHaveBeenCalled();
  expect(f.state.migration(prepared.operationId)?.phase).toBe("COMPLETE");
  expect(JSON.stringify(ContentDocumentTable.read(f.db, 8)?.content)).toContain("待续做");
});

it("主库已升级也不能掩盖未能恢复的损坏缓存", async () => {
  const f = await setup();
  f.runtime.stopped = false;
  const session = f.runtime.sessions.get(f.localId)!;
  unregisterContentSession(session);
  session.awareness.destroy();
  session.doc.destroy();
  f.runtime.sessions.delete(f.localId);
  const current = ContentDocumentTable.read(f.db, 7);
  f.store.db.prepare("UPDATE sessions SET state_hash='损坏摘要' WHERE id=?").run(f.localId);
  await expect(
    (f.runtime as unknown as CollaborationManager).upgradeLegacyContent("library", 7, {})
  ).rejects.toThrow("摘要");
  expect(ContentDocumentTable.read(f.db, 7)).toEqual(current);
  expect(f.store.db.prepare("SELECT state_hash FROM sessions WHERE id=?").get(f.localId)).toEqual({
    state_hash: "损坏摘要",
  });
});
