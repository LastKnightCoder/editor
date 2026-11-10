// @vitest-environment node
import Database from "better-sqlite3";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { createEditor, Transforms } from "slate";
import { WebSocket } from "ws";
import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import {
  NodeTree,
  readNodeDocument,
  validateNodeDocument,
  captureScopedTextEdit,
  type ContentSessionSnapshot,
  type CollaborationSession,
  type ContentNode,
  type SharedDocumentInfo,
} from "@tau/collaboration";
import { prepareContentContract } from "@tau/db-schema/content-contracts";
import { applyNodeTreeContent, withNodeTree } from "@tau/editor-collab";
import schema from "@tau/db-schema/schema/main.sql?raw";
import type { IpcMainInvokeEvent } from "electron";
import { createServer } from "../../../../../../collaboration-server/src/server";
import { CollaborationManager } from "../index";
import { registerAgentEditExecution } from "../../agent-run-events";
import { CollaborationLocalStore } from "../local-store";
import { ContentLocalState } from "../content-local-state";
import { NodeSessionUpdates } from "../node-session-updates";
import { CollaborationAssetService } from "../asset-service";
import type { CollaborationClient } from "../client";
import type { RuntimeSession } from "../types";
import ContentTable from "../../tables/content";
import CardTable from "../../tables/card";
import ArticleTable from "../../tables/article";
import ProjectTable from "../../tables/project";
import { ContentDocumentTable } from "../../tables/content-document";
import { ContentDocumentBlocks } from "../../tables/content-document-blocks";
import { ContentIdentityTable } from "../../tables/content-identity";
import { unregisterContentSession } from "../content-sessions";
import { collaborationImageStorage } from "../../../services/collaboration-image-storage";
import type { DocumentDrain, DocumentDrainScope } from "../../durable-document-lifecycle";
import { TaskAssistantEngine, readTask } from "../../task-assistant/engine";

const host = vi.hoisted(() => ({
  dir: "",
  serverUrl: "http://test",
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
vi.mock("../dev-server", () => ({ getDevelopmentServerUrl: () => host.serverUrl }));
const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const run of cleanup.splice(0).reverse()) await run();
  host.databases.clear();
  host.serverUrl = "http://test";
});
type Runtime = Pick<
  CollaborationManager,
  "readEditSnapshot" | "applyScopedEdit" | "suggestions"
> & {
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
  transports: Map<string, HocuspocusProviderWebsocket>;
  startAutoFlush(): void;
  shutdown(): void;
  syncRemoteDocument(url: string, info: SharedDocumentInfo): Promise<void>;
};
async function setup(realtime = false, paragraphs?: readonly string[]) {
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
  if (realtime) {
    host.serverUrl = await server.app.listen({ host: "127.0.0.1", port: 0 });
  }
  const owner = server.store.register("作者");
  let losePublish = false;
  let loseCommit = false;
  let serverDate: number | undefined;
  const client = {
    identities: new Map([[host.serverUrl, owner]]),
    identity: async () => owner,
    serverTime: () => {
      if (serverDate === undefined) throw new Error("缺少服务端时间");
      return serverDate;
    },
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
      serverDate = Date.parse(String(response.headers.date));
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
  if (!realtime) vi.spyOn(runtime, "attach").mockImplementation(() => {});
  cleanup.push(async () => {
    runtime.shutdown();
    for (const session of runtime.sessions.values()) {
      session.provider?.destroy();
      unregisterContentSession(session);
      session.awareness.destroy();
      session.doc.destroy();
    }
    for (const transport of runtime.transports.values()) transport.destroy();
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
      content: paragraphs
        ? paragraphs.map((text, index) => ({
            type: "paragraph",
            collabId: index === 0 ? "paragraph" : `paragraph-${index}`,
            tauContract: paragraph.id,
            children: [{ type: "formatted", text }],
          }))
        : [
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
    {
      installDocument: true,
      count: paragraphs?.reduce((total, text) => total + text.length, 0) ?? 2,
    }
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
  it("并发保存调用等待同一在途提交，不能在正文落库前返回完成", async () => {
    const { runtime, db, localId } = await setup();
    const session = runtime.sessions.get(localId)!;
    await runtime.project(session);
    const tree = new NodeTree(session.doc);
    const localize = runtime.assets.localizeDocument.bind(runtime.assets);
    let release!: () => void;
    const paused = new Promise<void>(resolve => {
      release = resolve;
    });
    vi.spyOn(runtime.assets, "localizeDocument").mockImplementationOnce(async (...args) => {
      await paused;
      return localize(...args);
    });
    try {
      tree.insertText("paragraph", 0, "等待", {});
      const first = runtime.project(session);
      let finished = false;
      const second = runtime.project(session).then(() => {
        finished = true;
      });
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(finished).toBe(false);
      release();
      await Promise.all([first, second]);
      expect(ContentDocumentTable.read(db, 7)!.content[0].children![0].text).toBe("等待正文");
      expect(session.projectionDirty).toBe(false);
    } finally {
      release();
      tree.dispose();
    }
  });

  it("缓存增量写入失败后保留变更代次，未达压缩阈值也先补存再投影", async () => {
    const { runtime, db, localId, store } = await setup();
    const session = runtime.sessions.get(localId)!;
    await runtime.project(session);
    const tree = new NodeTree(session.doc);
    const append = vi.spyOn(store, "append").mockImplementationOnce(() => {
      throw new Error("模拟缓存写入失败");
    });
    try {
      expect(() => tree.insertText("paragraph", 0, "保留", {})).toThrow("模拟缓存写入失败");
      expect(session.cacheWriteFailed).toBe(true);
      expect(session.projectionVersion).not.toEqual(session.projectedVersion);
      append.mockRestore();
      const compact = vi.spyOn(store, "compact");
      await runtime.project(session);
      expect(compact).toHaveBeenCalledOnce();
      expect(session.cacheWriteFailed).toBe(false);
      expect(ContentDocumentTable.read(db, 7)!.content[0].children![0].text).toBe("保留正文");
      const recovered = store.load(localId);
      try {
        expect(readNodeDocument(recovered.doc).content[0].children![0].text).toBe("保留正文");
      } finally {
        recovered.doc.destroy();
      }
    } finally {
      tree.dispose();
    }
  });

  it("拆分、合并后的共享文字片段按可见归属块保存，撤销重做不漏字", async () => {
    const { runtime, db, localId } = await setup();
    const session = runtime.sessions.get(localId)!;
    await runtime.project(session);
    const tree = new NodeTree(session.doc);
    const editor = withNodeTree(createEditor(), tree, {}, { normalizeOnConnect: false });
    try {
      editor.connectNodeTree();
      Transforms.select(editor, { path: [0, 0], offset: 1 });
      Transforms.splitNodes(editor, { always: true });
      editor.undoManager.stopCapturing();
      await runtime.project(session);
      Transforms.select(editor, { path: [1, 0], offset: 0 });
      Transforms.insertText(editor, "后半");
      editor.undoManager.stopCapturing();
      await runtime.project(session);
      const texts = () =>
        ContentDocumentTable.read(db, 7)!.content.map(node =>
          node.children!.map(child => child.text).join("")
        );
      expect(texts()).toEqual(["正", "后半文"]);
      editor.undoManager.undo();
      await runtime.project(session);
      expect(texts()).toEqual(["正", "文"]);
      editor.undoManager.redo();
      await runtime.project(session);
      expect(texts()).toEqual(["正", "后半文"]);
      Transforms.mergeNodes(editor, { at: [1] });
      await runtime.project(session);
      expect(texts()).toEqual(["正后半文"]);
      Transforms.insertText(editor, "合并", { at: { path: [0, 0], offset: 1 } });
      await runtime.project(session);
      expect(texts()).toEqual(["正合并后半文"]);
    } finally {
      editor.disposeNodeTree();
      tree.dispose();
    }
  });

  it("打开、选区移动和补充契约不计编辑，实际修改正文才更新时间", async () => {
    const { runtime, db, localId } = await setup();
    const session = runtime.sessions.get(localId)!;
    const before = ContentDocumentTable.read(db, 7)!;
    db.prepare("UPDATE contents SET update_time=100 WHERE id=7").run();
    db.exec(`
      INSERT INTO cards(id,create_time,update_time,content_id) VALUES (1,1,50,7);
      INSERT INTO articles(id,title,create_time,update_time,content_id) VALUES (1,'',1,50,7);
      INSERT INTO project_item(id,title,create_time,update_time,content_id) VALUES (1,'',1,50,7);
    `);
    const updateTimes = () => [
      ContentTable.getContentById(db, 7)!.updateTime,
      CardTable.getCardById(db, 1)!.update_time,
      ArticleTable.getArticleById(db, 1).update_time,
      ProjectTable.getProjectItem(db, 1)!.updateTime,
    ];
    const operationCount = () =>
      db.prepare("SELECT * FROM operation WHERE operation_content_type='content'").all().length;
    const initialOperations = operationCount();
    const tree = new NodeTree(session.doc);
    const editor = withNodeTree(createEditor(), tree, {}, { normalizeOnConnect: false });
    try {
      editor.connectNodeTree();
      Transforms.select(editor, { path: [0, 0], offset: 0 });
      Transforms.move(editor, { distance: 1 });
      await runtime.project(session);
      expect(ContentDocumentTable.read(db, 7)).toEqual(before);
      expect(updateTimes()).toEqual([100, 100, 100, 100]);
      expect(operationCount()).toBe(initialOperations);

      const read = vi.spyOn(ContentDocumentTable, "read");
      const localize = vi.spyOn(runtime.assets, "localizeDocument");
      tree.setProperties("paragraph", { isFold: true, svg: "用户业务内容" }, {});
      await runtime.project(session);
      expect(read).not.toHaveBeenCalled();
      expect(localize).not.toHaveBeenCalled();
      read.mockRestore();

      const extra = await prepareContentContract("tau.heading", {
        type: "header",
        dataVersion: 1,
        kind: "block",
      });
      await tree.installContracts({ [extra.id]: extra.contract }, {});
      await runtime.project(session);
      const prepared = ContentDocumentTable.read(db, 7)!;
      expect(prepared.contracts[extra.id]).toEqual(extra.contract);
      expect(updateTimes()).toEqual([100, 100, 100, 100]);
      expect(operationCount()).toBe(initialOperations);
      expect(prepared.content).toEqual(before.content);
      expect(localize).not.toHaveBeenCalled();

      Transforms.insertText(editor, "修改");
      await runtime.project(session);
      for (const time of updateTimes()) expect(time).toBeGreaterThan(100);
      expect(operationCount()).toBe(initialOperations + 1);
      expect(JSON.stringify(ContentDocumentTable.read(db, 7)!.content)).toContain("正修改文");
      expect(session.projectedVersion).toEqual(session.projectionVersion);
    } finally {
      editor.disposeNodeTree();
      tree.dispose();
    }
  });

  it("只改标题不读取或转换正文，正常更新文章和项目标题", async () => {
    const { runtime, db, localId } = await setup();
    const session = runtime.sessions.get(localId)!;
    await runtime.project(session);
    db.exec(`
      INSERT INTO articles(id,title,create_time,update_time,content_id) VALUES (1,'',1,50,7);
      INSERT INTO project_item(id,title,create_time,update_time,content_id) VALUES (1,'',1,50,7);
    `);
    const before = ContentTable.getContentById(db, 7)!.updateTime;
    const read = vi.spyOn(ContentDocumentTable, "read");
    const localize = vi.spyOn(runtime.assets, "localizeDocument");
    session.doc.getText("title").insert(0, "修改标题");
    await runtime.project(session);
    expect(read).not.toHaveBeenCalled();
    expect(localize).not.toHaveBeenCalled();
    expect(ArticleTable.getArticleById(db, 1).title).toBe("修改标题");
    expect(ProjectTable.getProjectItem(db, 1)!.title).toBe("修改标题");
    expect(ContentTable.getContentById(db, 7)!.updateTime).toBe(before);
  });

  it("投影期间的新输入与落库失败不会被当成本轮已保存", async () => {
    const { runtime, db, localId } = await setup();
    const session = runtime.sessions.get(localId)!;
    await runtime.project(session);
    const tree = new NodeTree(session.doc);
    const localize = runtime.assets.localizeDocument.bind(runtime.assets);
    try {
      tree.insertText("paragraph", 0, "先", {});
      vi.spyOn(runtime.assets, "localizeDocument").mockImplementationOnce(async (...args) => {
        const value = await localize(...args);
        tree.insertText("paragraph", 0, "后", {});
        return value;
      });
      await runtime.project(session);
      expect(JSON.stringify(ContentDocumentTable.read(db, 7)!.content)).toContain("先正文");
      expect(session.projectedVersion).not.toEqual(session.projectionVersion);
      expect(session.projectionDirty).toBe(true);
      await runtime.project(session);
      expect(JSON.stringify(ContentDocumentTable.read(db, 7)!.content)).toContain("后先正文");
      expect(session.projectedVersion).toEqual(session.projectionVersion);

      tree.insertText("paragraph", 0, "重试", {});
      vi.spyOn(ContentDocumentBlocks, "commit").mockImplementationOnce(() => {
        throw new Error("模拟落库失败");
      });
      await expect(runtime.project(session)).rejects.toThrow("模拟落库失败");
      expect(session.projectedVersion).not.toEqual(session.projectionVersion);
      expect(session.projectionDirty).toBe(true);
      await runtime.project(session);
      expect(JSON.stringify(ContentDocumentTable.read(db, 7)!.content)).toContain("重试后先正文");
      expect(session.projectedVersion).toEqual(session.projectionVersion);
    } finally {
      tree.dispose();
    }
  });

  it.each([false, true])(
    "作者离线期间的成员图片在上线后自动补存，无需打开正文（冷缓存=%s）",
    async cold => {
      const { runtime, event, db, server, owner, store } = await setup(true);
      const url = host.serverUrl;
      const shared = await runtime.createContent(event, 7);
      let session = runtime.sessions.get(shared.documentId)!;
      await vi.waitFor(() => expect(session.provider?.synced).toBe(true), { timeout: 5000 });
      runtime.startAutoFlush();
      await vi.waitFor(() => expect(session.projectionDirty).toBe(false), { timeout: 3000 });
      const save = vi
        .spyOn(collaborationImageStorage, "save")
        .mockRejectedValue(new Error("作者存储宿主尚未就绪"));
      session.provider!.detach();
      for (const transport of runtime.transports.values()) transport.disconnect();
      store.compact(shared.documentId, session.doc);
      if (cold) {
        session.provider!.destroy();
        unregisterContentSession(session);
        session.awareness.destroy();
        session.doc.destroy();
        runtime.sessions.delete(shared.documentId);
        for (const transport of runtime.transports.values()) transport.destroy();
        runtime.transports.clear();
      }

      const member = server.store.register("离线期间的成员");
      const request = server.store.requestJoin(
        server.store.rotateCode(shared.documentId, owner.id).code,
        member.id
      );
      if (request.status !== "pending") throw new Error("未创建成员申请");
      server.store.decide(request.id, owner.id, true);
      const memberDoc = new Y.Doc({ gc: false });
      const memberSocket = new HocuspocusProviderWebsocket({
        url: url.replace(/^http/, "ws") + "/ws",
        WebSocketPolyfill: WebSocket,
      });
      const memberProvider = new HocuspocusProvider({
        name: shared.documentId,
        document: memberDoc,
        websocketProvider: memberSocket,
        token: () => server.store.ticket(member.id, shared.documentId, 2),
      });
      cleanup.push(() => {
        memberProvider.destroy();
        memberSocket.destroy();
        memberDoc.destroy();
      });
      memberProvider.attach();
      await vi.waitFor(() => expect(memberProvider.synced).toBe(true), { timeout: 5000 });
      const bytes = new TextEncoder().encode("IMAGE_UPLOADED_WHILE_OWNER_OFFLINE");
      const assetId = crypto.randomUUID();
      const form = new FormData();
      form.append("file", new Blob([bytes], { type: "image/png" }), "offline-member.png");
      const uploaded = await fetch(`${url}/v1/documents/${shared.documentId}/assets`, {
        method: "POST",
        headers: { Authorization: `Bearer ${member.id}:${member.secret}`, "X-Asset-Id": assetId },
        body: form,
      });
      expect(uploaded.ok).toBe(true);
      const reference = `tau-collab-asset:${assetId}`;
      const image = await prepareContentContract("tau.image", {
        type: "image",
        dataVersion: 1,
        kind: "block",
        isVoid: true,
        resources: [{ path: "url", kind: "image" }],
      });
      const tree = new NodeTree(memberDoc);
      try {
        await tree.installContracts({ [image.id]: image.contract }, null);
        tree.insertNode(
          {
            type: "image",
            collabId: "offline-image",
            tauContract: image.id,
            url: reference,
            children: [{ text: "" }],
          },
          null,
          1,
          null,
          true
        );
        await vi.waitFor(
          () => {
            const remote = server.store.loadDocument(shared.documentId);
            try {
              expect(readNodeDocument(remote).content[1]).toMatchObject({ url: reference });
            } finally {
              remote.destroy();
            }
          },
          { timeout: 5000 }
        );
      } finally {
        tree.dispose();
      }
      expect(save).not.toHaveBeenCalled();
      expect(ContentDocumentTable.read(db, 7)!.content).toHaveLength(1);

      if (cold) {
        const attach = vi.spyOn(runtime, "attach").mockImplementation(() => {});
        const { documents } = await runtime.client.request<{ documents: SharedDocumentInfo[] }>(
          url,
          "/v1/documents"
        );
        await runtime.syncRemoteDocument(
          url,
          documents.find(info => info.id === shared.documentId)!
        );
        session = runtime.sessions.get(shared.documentId)!;
        await vi.waitFor(() => expect(session.projectionDirty).toBe(false), { timeout: 3000 });
        expect(readNodeDocument(session.doc).content).toHaveLength(1);
        attach.mockRestore();
        host.databases.delete("library");
        runtime.attach(session);
      } else {
        session.provider!.attach();
        for (const transport of runtime.transports.values()) await transport.connect();
      }
      await vi.waitFor(() => expect(save).toHaveBeenCalled(), { timeout: 5000 });
      expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ mime: "image/png", bytes }));
      await vi.waitFor(() => expect(session.info.error).toContain("作者存储宿主尚未就绪"));
      expect(session.projectionDirty).toBe(true);
      mkdirSync(join(host.dir, "resources"), { recursive: true });
      const owned = cold
        ? "https://owner.test/after-restart.webp"
        : join(host.dir, "resources", "after-reconnect.webp");
      if (!cold) writeFileSync(owned, "OWNER_COMPRESSED_IMAGE");
      save.mockResolvedValue(owned);
      await vi.waitFor(
        () => expect(runtime.assets.ownerImageReference(shared.documentId, reference)).toBe(owned),
        { timeout: 5000 }
      );
      if (cold) {
        expect(ContentDocumentTable.read(db, 7)!.content).toHaveLength(1);
        host.databases.set("library", db);
      }
      await vi.waitFor(
        () => expect(ContentDocumentTable.read(db, 7)!.content[1]).toMatchObject({ url: owned }),
        { timeout: 5000 }
      );
      expect(session.info.error).toBeUndefined();
      expect(runtime.views.size).toBe(0);
      expect(server.store.document(shared.documentId).status).toBe("active");
    },
    20_000
  );

  it("远端图片先按作者配置保存，失败不关闭共享，成功后本机正文使用作者图床地址", async () => {
    const { runtime, event, db, server, owner } = await setup();
    const shared = await runtime.createContent(event, 7);
    const session = runtime.sessions.get(shared.documentId)!;
    session.provider = {
      attach: vi.fn(),
      detach: vi.fn(),
      destroy: vi.fn(),
    } as unknown as RuntimeSession["provider"];
    const image = await prepareContentContract("tau.image", {
      type: "image",
      dataVersion: 1,
      kind: "block",
      isVoid: true,
      resources: [{ path: "url", kind: "image" }],
    });
    const assetId = crypto.randomUUID();
    const bytes = Buffer.from("REMOTE_MEMBER_IMAGE");
    const hash = createHash("sha256").update(bytes).digest("hex");
    writeFileSync(join(host.dir, "server", "assets", hash), bytes);
    server.store.insertAsset(
      shared.documentId,
      assetId,
      hash,
      "member.png",
      "image/png",
      bytes.length
    );
    const remote = server.store.loadDocument(shared.documentId);
    const fork = new Y.Doc({ gc: false });
    Y.applyUpdate(fork, Y.encodeStateAsUpdate(remote));
    const vector = Y.encodeStateVector(fork);
    const tree = new NodeTree(fork);
    try {
      await tree.installContracts({ [image.id]: image.contract }, null);
      tree.insertNode(
        {
          type: "image",
          collabId: "member-image",
          tauContract: image.id,
          url: `tau-collab-asset:${assetId}`,
          children: [{ text: "" }],
        },
        null,
        1,
        null,
        true
      );
      await server.store.appendUpdate(
        shared.documentId,
        owner.id,
        Y.encodeStateAsUpdate(fork, vector),
        remote
      );
    } finally {
      tree.dispose();
      fork.destroy();
      remote.destroy();
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        const result = await server.app.inject({
          method: "GET",
          url: new URL(url).pathname,
          headers: init.headers as Record<string, string>,
        });
        return new Response(new Uint8Array(result.rawPayload), {
          status: result.statusCode,
          headers: {
            "content-type": String(result.headers["content-type"]),
            "content-disposition": String(result.headers["content-disposition"]),
          },
        });
      })
    );
    const save = vi
      .spyOn(collaborationImageStorage, "save")
      .mockRejectedValue(new Error("作者图床连接失败"));
    await expect(runtime.prepareLeave(session)).rejects.toThrow("作者图床连接失败");
    expect(session.info.frozen).toBe(false);
    expect(server.store.document(shared.documentId).status).toBe("active");
    const owned = "https://owner.test/compressed.webp";
    save.mockResolvedValue(owned);
    await runtime.prepareLeave(session);
    expect(server.store.document(shared.documentId).status).toBe("active");
    expect(ContentDocumentTable.read(db, 7)!.content[1]).toMatchObject({ url: owned });
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({ mime: "image/png", bytes: new Uint8Array(bytes) })
    );
    expect((await ContentTable.readContent(db, 7))!.content[1]).toMatchObject({ url: owned });
    session.info.leaving = true;
    await runtime.finishLeave(session);
    expect(server.store.document(shared.documentId).status).toBe("closed");
    expect((await ContentTable.readContent(db, 7))!.content[1]).toMatchObject({ url: owned });
    expect((await runtime.openContent(event, { contentId: 7 })).mode).toBe("local");
    expect((await ContentTable.readContent(db, 7))!.content[1]).toMatchObject({ url: owned });
  });
  it("本机图片保存保留路径和图床 URL，存量编号转存后缓存重建仍能读取", async () => {
    const { runtime, localId, event, db, store } = await setup();
    const image = await prepareContentContract("tau.image", {
      type: "image",
      dataVersion: 1,
      kind: "block",
      isVoid: true,
      resources: [
        { path: "url", kind: "image" },
        { path: "previewUrl", kind: "image" },
      ],
    });
    const legacy = await runtime.assets.keepLocalFile(localId, {
      name: "legacy.png",
      mime: "image/png",
      bytes: new TextEncoder().encode("LEGACY_IMAGE"),
    });
    const local = "~/.editor/resources/new.webp";
    const remote = "https://images.test/compressed.webp";
    const before = (await ContentTable.readContent(db, 7))!;
    await ContentTable.writeContent(db, 7, {
      expectedRevision: before.revision,
      contracts: { ...before.contracts, [image.id]: image.contract },
      content: [
        ...before.content,
        ...[legacy, local, remote].map((url, index) => ({
          type: "image",
          collabId: `image-${index}`,
          tauContract: image.id,
          url,
          previewUrl: url,
          children: [{ text: "" }],
        })),
      ] as never,
    });
    const saved = ContentDocumentTable.read(db, 7)!;
    const path = String(saved.content[1].url);
    expect(path).toContain(join("resources", "collaboration"));
    expect(readFileSync(path, "utf8")).toBe("LEGACY_IMAGE");
    expect(saved.content[1].previewUrl).toBe(path);
    expect(saved.content.slice(2).map(node => node.url)).toEqual([local, remote]);
    expect(readNodeDocument(runtime.sessions.get(localId)!.doc).content).toEqual(saved.content);

    const session = runtime.sessions.get(localId)!;
    unregisterContentSession(session);
    session.awareness.destroy();
    session.doc.destroy();
    runtime.sessions.delete(localId);
    store.discard(localId, "验证按主库重建本机会话");
    await runtime.openContent(event, { contentId: 7 });
    expect(readNodeDocument(runtime.sessions.get(localId)!.doc).content).toEqual(saved.content);
    expect(readFileSync(path, "utf8")).toBe("LEGACY_IMAGE");
  });

  it.each([false, true])("附件仅在其他设备上时仍能打开、编辑和保存（共享=%s）", async shared => {
    const { runtime, localId, event, db } = await setup();
    let session = runtime.sessions.get(localId)!;
    const image = await prepareContentContract("tau.image", {
      type: "image",
      dataVersion: 1,
      kind: "block",
      isVoid: true,
      resources: [{ path: "url", kind: "image" }],
    });
    const reference = `tau-collab-local:${crypto.randomUUID()}`;
    const tree = new NodeTree(session.doc);
    await tree.installContracts({ [image.id]: image.contract }, null);
    tree.insertNode(
      {
        type: "image",
        collabId: "missing-image",
        tauContract: image.id,
        url: reference,
        children: [{ text: "" }],
      },
      null,
      1,
      null,
      true
    );
    tree.dispose();
    await runtime.project(session);
    if (shared) session = runtime.sessions.get((await runtime.createContent(event, 7)).documentId)!;

    await expect(runtime.openContent(event, { contentId: 7 })).resolves.toMatchObject({
      documentId: session.info.id,
      frozen: false,
    });
    const before = (await ContentTable.readContent(db, 7))!;
    expect(before.content[1]).toMatchObject({ url: reference });
    const content = structuredClone(before.content) as ContentNode[];
    content[0].children = [{ text: "附件不可用时仍可编辑" }];
    await ContentTable.writeContent(db, 7, {
      content: content as never,
      contracts: before.contracts,
      expectedRevision: before.revision,
    });
    const saved = ContentDocumentTable.read(db, 7)!;
    expect(saved.content[0].children).toMatchObject([{ text: "附件不可用时仍可编辑" }]);
    expect(saved.content[1]).toMatchObject({ collabId: "missing-image", url: reference });
    expect(readNodeDocument(session.doc).content[1]).toMatchObject({ url: reference });
    await expect(runtime.openContent(event, { contentId: 7 })).resolves.toMatchObject({
      frozen: false,
    });
  });

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
    for (const workspace of ["library", "library.db", "other.db"]) {
      store.db
        .prepare("INSERT INTO input_drafts VALUES (?,?,?,?,?,?,?,?,?,?,0,?)")
        .run(workspace, "old-body", "old-base", 0, workspace, "node", "text", "旧草稿", "r", 1, 1);
      store.db
        .prepare("INSERT INTO document_drafts VALUES (?,?,?,?,?,?,?,?,0)")
        .run(workspace, workspace, "old-body", "old-base", 0, Buffer.from([1]), "digest", 1);
      store.db
        .prepare("INSERT INTO node_views VALUES (?,?,?,?,?,?)")
        .run(workspace, "old-body", "node", "host", '{"expanded":true}', "r");
      store.db
        .prepare("INSERT INTO entity_holds VALUES (?,?,?,?,?,?)")
        .run(workspace, "old-holder", "undo", "source", "content", "old-entity");
      store.db
        .prepare("INSERT INTO migrations VALUES (?,?,?,?)")
        .run(workspace, workspace, "old-body", '{"phase":"PREPARED"}');
    }
    for (const name of ["library", "library.db"]) {
      await runtime.releaseLibrary(name);
      for (const table of [
        "input_drafts",
        "document_drafts",
        "node_views",
        "entity_holds",
        "migrations",
      ])
        expect(store.db.prepare(`SELECT DISTINCT workspace_id FROM ${table}`).all()).toEqual([
          { workspace_id: "other.db" },
        ]);
    }
    expect(runtime.sessions.has(localId)).toBe(false);
    expect(store.list().some(session => session.id === localId)).toBe(false);
    const opened = await runtime.openContent(event, { contentId: 7 });
    expect(opened.frozen).toBe(false);
  });

  it("同步替换释放未加载的冷缓存，之后按新库重新打开", async () => {
    const { runtime, event, store, localId } = await setup();
    const session = runtime.sessions.get(localId)!;
    const image = await prepareContentContract("tau.image", {
      type: "image",
      kind: "block",
      dataVersion: 1,
      isVoid: true,
      resources: [{ path: "url", kind: "image" }],
    });
    const reference = await runtime.assets.keepLocalFile(localId, {
      name: "unprojected.png",
      mime: "image/png",
      bytes: new TextEncoder().encode("待保全的图片"),
    });
    const path = runtime.assets.resolveLocalFile(reference, localId)!;
    const tree = new NodeTree(session.doc);
    await tree.installContracts({ [image.id]: image.contract }, null);
    tree.insertNode(
      {
        type: "image",
        collabId: "pending-image",
        tauContract: image.id,
        url: reference,
        children: [{ text: "" }],
      },
      null,
      1,
      null,
      true
    );
    tree.dispose();
    store.compact(localId, session.doc);
    unregisterContentSession(session);
    session.awareness.destroy();
    session.doc.destroy();
    runtime.sessions.delete(localId);
    await runtime.releaseLibrary("library");
    expect(store.list().some(info => info.id === localId)).toBe(false);
    expect(readFileSync(path, "utf8")).toBe("待保全的图片");
    const discarded = join(host.dir, "collaboration", "discarded");
    expect(
      readdirSync(discarded).some(name =>
        readFileSync(join(discarded, name), "utf8").includes(path)
      )
    ).toBe(true);
    expect((await runtime.openContent(event, { contentId: 7 })).frozen).toBe(false);
    runtime.assets.removeDocumentCache(localId);
    expect(readFileSync(path, "utf8")).toBe("待保全的图片");
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
    session.provider = {
      synced: true,
      hasUnsyncedChanges: false,
      attach: vi.fn(),
      detach: vi.fn(),
      destroy: vi.fn(),
    } as unknown as RuntimeSession["provider"];
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
    host.databases.delete("library");
    await expect(runtime.prepareLeave(session)).rejects.toThrow("原内容所在数据库");
    expect(server.store.document(shared.documentId).status).toBe("active");
    expect(session.info.frozen).toBe(false);
    host.databases.set("library", db);
    const project = vi.spyOn(runtime, "project").mockRejectedValueOnce(new Error("正文落库失败"));
    await expect(runtime.prepareLeave(session)).rejects.toThrow("正文落库失败");
    expect(server.store.document(shared.documentId).status).toBe("active");
    project.mockRestore();
    await runtime.prepareLeave(session);
    expect(JSON.stringify(ContentDocumentTable.read(db, 7)!.content)).toContain("远端输入正文");
    session.info.leaving = true;
    const request = runtime.client.request.bind(runtime.client);
    let loseClose = true;
    const closeRequests = vi
      .spyOn(runtime.client, "request")
      .mockImplementation(async (...args) => {
        const result = await request(...args);
        if (String(args[1]).endsWith("/close") && loseClose) {
          loseClose = false;
          throw new Error("关闭回执丢失");
        }
        return result;
      });
    await runtime.finishLeave(session);
    expect(server.store.document(shared.documentId).status).toBe("closed");
    expect(session.info.leaving).toBe(true);
    expect(runtime.sessions.has(shared.documentId)).toBe(true);
    await runtime.finishLeave(session);
    expect(
      closeRequests.mock.calls.filter(args => String(args[1]).endsWith("/close"))
    ).toHaveLength(2);
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

const stressResults: Record<string, unknown>[] = [];

async function measureStress(name: string, run: () => Promise<Record<string, unknown>>) {
  const started = performance.now();
  const before = process.memoryUsage();
  let result: Record<string, unknown> = { name, status: "running" };
  try {
    result = { name, status: "passed", ...(await run()) };
  } catch (error) {
    result = {
      name,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
    throw error;
  } finally {
    const after = process.memoryUsage();
    result = {
      ...result,
      elapsedMs: Math.round(performance.now() - started),
      heapUsedMiB: Math.round(after.heapUsed / 1024 / 1024),
      rssMiB: Math.round(after.rss / 1024 / 1024),
      rssChangeMiB: Math.round((after.rss - before.rss) / 1024 / 1024),
    };
    stressResults.push(result);
    console.info("[content-projection-stress]", JSON.stringify(result));
    const report = process.env.TAU_CONTENT_STRESS_REPORT;
    if (report) {
      mkdirSync(dirname(report), { recursive: true });
      writeFileSync(
        report,
        JSON.stringify(
          { recordedAt: new Date().toISOString(), node: process.version, scenarios: stressResults },
          null,
          2
        )
      );
    }
  }
}

function stressLatency(samples: number[]) {
  const sorted = [...samples].sort((left, right) => left - right);
  return {
    samples: samples.length,
    p50Ms: +sorted[Math.floor(sorted.length * 0.5)].toFixed(3),
    p95Ms: +sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))].toFixed(3),
    maxMs: +sorted[sorted.length - 1].toFixed(3),
  };
}

function stressRandom(seed: number) {
  let state = seed;
  return (limit: number) => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) % limit;
  };
}

// 显式开启压力场景，避免常规回归承担长文构建与持续保存的成本。
describe.runIf(process.env.TAU_CONTENT_STRESS === "1")("正文投影压力", () => {
  it("单个大块的大增量先按大小压缩，主库和缓存恢复保持一致", async () => {
    await measureStress("large-single-block", async () => {
      const original = "大段正文".repeat(60 * 1024);
      const addition = "新增".repeat(120 * 1024);
      const { runtime, db, localId, store } = await setup(false, [original]);
      const session = runtime.sessions.get(localId)!;
      await runtime.project(session);
      const tree = new NodeTree(session.doc);
      const compact = vi.spyOn(store, "compact");
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
      runtime.startAutoFlush();
      const started = performance.now();
      try {
        tree.insertText("paragraph", 0, addition, {});
        const pending = store.db
          .prepare(
            "SELECT count(*) AS count,sum(length(state)) AS bytes FROM updates WHERE document_id=?"
          )
          .get(localId) as { count: number; bytes: number };
        expect(pending.count).toBe(1);
        expect(pending.bytes).toBeGreaterThan(512 * 1024);
        await vi.advanceTimersByTimeAsync(1000);
        expect(compact).toHaveBeenCalledOnce();
        expect(ContentDocumentTable.read(db, 7)!.content[0].children![0].text).toBe(
          addition + original
        );
        const restored = store.load(localId);
        try {
          expect(readNodeDocument(restored.doc).content[0].children![0].text).toBe(
            addition + original
          );
        } finally {
          restored.doc.destroy();
        }
        return {
          singleBlockCharacters: original.length + addition.length,
          inputBytes: pending.bytes,
          editAndCheckpointMs: +(performance.now() - started).toFixed(3),
          checkpoints: compact.mock.calls.length,
        };
      } finally {
        tree.dispose();
        vi.useRealTimers();
      }
    });
  }, 120000);

  it("自动保存二十轮：增量日志有界压缩，恢复后与主库一致", async () => {
    await measureStress("auto-flush-incremental", async () => {
      const { runtime, db, localId, store } = await setup(
        false,
        Array.from({ length: 128 }, () => "正文压力".repeat(64))
      );
      const session = runtime.sessions.get(localId)!;
      await runtime.project(session);
      const tree = new NodeTree(session.doc);
      const compact = vi.spyOn(store, "compact");
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
      runtime.startAutoFlush();
      let expected = "正文压力".repeat(64);
      try {
        for (let round = 0; round < 20; round++) {
          for (let input = 0; input < 16; input++) {
            const token = `[${round}:${input}]`;
            tree.insertText("paragraph", 0, token, {});
            expected = token + expected;
          }
          await vi.advanceTimersByTimeAsync(1000);
          expect(session.projectedVersion).toEqual(session.projectionVersion);
          expect(
            ContentDocumentTable.read(db, 7)!
              .content[0].children!.map(leaf => leaf.text)
              .join("")
          ).toBe(expected);
        }
        expect(compact).toHaveBeenCalledTimes(2);
        const pending = store.db
          .prepare("SELECT count(*) AS count FROM updates WHERE document_id=?")
          .get(localId) as { count: number };
        expect(pending.count).toBe(64);
        const loaded = store.load(localId);
        try {
          expect(readNodeDocument(loaded.doc).content).toEqual(
            readNodeDocument(session.doc).content
          );
        } finally {
          loaded.doc.destroy();
        }
        return {
          autoFlushRounds: 20,
          inputs: 320,
          fullCheckpoints: compact.mock.calls.length,
          retainedUpdates: pending.count,
        };
      } finally {
        tree.dispose();
        vi.useRealTimers();
      }
    });
  }, 120000);

  it.each([
    [32, 256],
    [256, 512],
    [1024, 1024],
  ])(
    "长文 %i 段 × %i 字：空保存、契约与连续编辑",
    async (paragraphCount, paragraphLength) => {
      await measureStress(`long-${paragraphCount}-${paragraphLength}`, async () => {
        const text = "长文压力验证"
          .repeat(Math.ceil(paragraphLength / 6))
          .slice(0, paragraphLength);
        const expected = Array.from({ length: paragraphCount }, () => text);
        const { runtime, db, localId } = await setup(false, expected);
        const session = runtime.sessions.get(localId)!;
        await runtime.project(session);
        db.prepare("UPDATE contents SET update_time=100 WHERE id=7").run();
        const tree = new NodeTree(session.doc);
        const read = vi.spyOn(ContentDocumentTable, "read");
        const localize = vi.spyOn(runtime.assets, "localizeDocument");
        const idle: number[] = [],
          saves: number[] = [];
        try {
          for (let iteration = 0; iteration < 500; iteration++) {
            const started = performance.now();
            await runtime.project(session);
            idle.push(performance.now() - started);
          }
          expect(read).not.toHaveBeenCalled();
          expect(localize).not.toHaveBeenCalled();
          read.mockRestore();
          for (let iteration = 0; iteration < 5; iteration++) {
            const definition = await prepareContentContract("stress.extra", {
              type: `stress.extra-${iteration}`,
              dataVersion: 1,
              kind: "block",
            });
            await tree.installContracts({ [definition.id]: definition.contract }, {});
            await runtime.project(session);
          }
          expect(localize).not.toHaveBeenCalled();
          expect(ContentTable.getContentById(db, 7)!.updateTime).toBe(100);
          for (let iteration = 0; iteration < 36; iteration++) {
            const index = iteration % 2 ? paragraphCount - 1 : 0;
            const id = index ? `paragraph-${index}` : "paragraph";
            const addition = `改${iteration}`;
            const started = performance.now();
            tree.insertText(id, 0, addition, {});
            expected[index] = addition + expected[index];
            await runtime.project(session);
            saves.push(performance.now() - started);
            expect(
              ContentDocumentTable.read(db, 7)!.content.map(node =>
                node.children!.map(leaf => leaf.text).join("")
              )
            ).toEqual(expected);
            expect(session.projectedVersion).toEqual(session.projectionVersion);
          }
          const operations = db
            .prepare(
              "SELECT count(*) AS count FROM operation WHERE operation_content_type='content'"
            )
            .get() as { count: number };
          expect(operations.count).toBe(36);
          expect(ContentTable.getContentById(db, 7)!.updateTime).toBeGreaterThan(100);
          return {
            characters: paragraphCount * paragraphLength,
            paragraphCount,
            idle: stressLatency(idle),
            editAndSave: stressLatency(saves),
            contractWrites: 5,
            operations: operations.count,
          };
        } finally {
          tree.dispose();
        }
      });
    },
    120000
  );

  it("同值属性与重复确认：不能产生编辑时间或编辑记录", async () => {
    await measureStress("idempotent-properties", async () => {
      const { runtime, db, localId } = await setup();
      const session = runtime.sessions.get(localId)!;
      await runtime.project(session);
      db.prepare("UPDATE contents SET update_time=100 WHERE id=7").run();
      const tree = new NodeTree(session.doc);
      const before = ContentDocumentTable.read(db, 7)!;
      try {
        for (let iteration = 0; iteration < 100; iteration++) {
          tree.setProperties("paragraph", { isFold: true, svg: "用户业务内容" }, {});
          await runtime.project(session);
        }
        expect(ContentTable.getContentById(db, 7)!.updateTime).toBe(100);
        expect(ContentDocumentTable.read(db, 7)).toEqual(before);
        expect(
          db.prepare("SELECT * FROM operation WHERE operation_content_type='content'").all()
        ).toHaveLength(0);
        return { sameValueTransactions: 100 };
      } finally {
        tree.dispose();
      }
    });
  }, 60000);

  it.each([7, 43, 137, 20261102])(
    "随机编辑种子 %i：增删改移与未投影冷缓存恢复",
    async seed => {
      await measureStress(`random-${seed}`, async () => {
        const { runtime, db, localId, event, store } = await setup(false, [
          "起点甲",
          "起点乙",
          "起点丙",
          "起点丁",
        ]);
        let session = runtime.sessions.get(localId)!;
        let tree = new NodeTree(session.doc);
        const contract = String(tree.nodeSnapshot("paragraph").tauContract);
        const expected = ["起点甲", "起点乙", "起点丙", "起点丁"].map((text, index) => ({
          id: index ? `paragraph-${index}` : "paragraph",
          text,
          level: undefined as number | undefined,
        }));
        const random = stressRandom(seed);
        const verify = () => {
          const actual = ContentDocumentTable.read(db, 7)!.content;
          expect(
            actual.map(node => ({
              id: node.collabId,
              text: node.children!.map(leaf => leaf.text).join(""),
              level: node.level,
            }))
          ).toEqual(expected);
          expect(session.projectedVersion).toEqual(session.projectionVersion);
        };
        let recoveries = 0,
          saves = 0;
        try {
          for (let step = 0; step < 256; step++) {
            const index = random(expected.length);
            const target = expected[index];
            const action = random(6);
            if (action === 0 && Array.from(target.text).length > 1) {
              const letters = Array.from(target.text);
              const point = random(letters.length);
              tree.deleteText(
                target.id,
                letters.slice(0, point).join("").length,
                letters[point].length,
                {}
              );
              letters.splice(point, 1);
              target.text = letters.join("");
            } else if (action === 1) {
              const level = random(7);
              tree.setProperties(target.id, { level }, {});
              target.level = level;
            } else if (action === 2 && expected.length > 1) {
              const destination = random(expected.length);
              tree.moveNode(target.id, null, destination, {});
              expected.splice(index, 1);
              expected.splice(destination, 0, target);
            } else if (action === 3 && expected.length < 12) {
              const created = { id: `new-${seed}-${step}`, text: `新增${step}`, level: undefined };
              tree.insertNode(
                {
                  type: "paragraph",
                  collabId: created.id,
                  tauContract: contract,
                  children: [{ type: "formatted", text: created.text }],
                },
                null,
                index,
                {},
                true
              );
              expected.splice(index, 0, created);
            } else if (action === 4 && expected.length > 1) {
              tree.removeNodes([target.id], {});
              expected.splice(index, 1);
            } else {
              const letters = Array.from(target.text);
              const point = random(letters.length + 1);
              const addition = ["中", "ab", "🙂", "é"][random(4)];
              tree.insertText(target.id, letters.slice(0, point).join("").length, addition, {});
              letters.splice(point, 0, addition);
              target.text = letters.join("");
            }
            if (step % 64 === 63) {
              tree.dispose();
              store.compact(localId, session.doc);
              unregisterContentSession(session);
              session.awareness.destroy();
              session.doc.destroy();
              runtime.sessions.delete(localId);
              await runtime.openContent(event, { contentId: 7 });
              session = runtime.sessions.get(localId)!;
              tree = new NodeTree(session.doc);
              recoveries++;
            }
            if (step % 8 === 7) {
              await runtime.project(session);
              verify();
              saves++;
            }
          }
          return {
            seed,
            mutations: 256,
            saves,
            coldRecoveries: recoveries,
            finalNodes: expected.length,
          };
        } finally {
          tree.dispose();
        }
      });
    },
    120000
  );

  it("源码、格式、撤销重做：各类正文事务都正常推进保存", async () => {
    await measureStress("source-format-history", async () => {
      const { runtime, db, localId } = await setup();
      const session = runtime.sessions.get(localId)!;
      const tree = new NodeTree(session.doc);
      const source = await prepareContentContract("stress.source", {
        type: "stress.source",
        dataVersion: 1,
        kind: "block",
        isVoid: true,
        collaboration: { textFields: ["code"] },
      });
      await tree.installContracts({ [source.id]: source.contract }, {});
      tree.insertNode(
        {
          type: "stress.source",
          collabId: "source",
          tauContract: source.id,
          code: "初始源码",
          children: [{ text: "" }],
        },
        null,
        1,
        {},
        true
      );
      await runtime.project(session);
      const origin = {};
      const history = tree.createUndoManager({
        trackedOrigins: new Set([origin]),
        captureTimeout: 0,
      });
      let expected = "初始源码";
      try {
        for (let step = 0; step < 80; step++) {
          const before = expected;
          const addition = `片段${step}🙂`;
          tree.doc.transact(
            () => tree.textField("source", "code").insert(expected.length, addition),
            origin
          );
          history.stopCapturing();
          expected += addition;
          await runtime.project(session);
          expect(ContentDocumentTable.read(db, 7)!.content[1].code).toBe(expected);
          history.undo();
          await runtime.project(session);
          expect(ContentDocumentTable.read(db, 7)!.content[1].code).toBe(before);
          history.redo();
          await runtime.project(session);
          expect(ContentDocumentTable.read(db, 7)!.content[1].code).toBe(expected);
          tree.formatText("paragraph", 0, 2, { bold: step % 2 === 0 ? true : null }, {});
          await runtime.project(session);
          expect(ContentDocumentTable.read(db, 7)!.content[0].children![0].bold).toBe(
            step % 2 === 0 ? true : undefined
          );
        }
        expect(session.projectedVersion).toEqual(session.projectionVersion);
        return { sourceEdits: 80, undos: 80, redos: 80, formatChanges: 80, saves: 320 };
      } finally {
        history.destroy();
        tree.dispose();
      }
    });
  }, 120000);

  it("投影重叠、写入后回滚与切库竞态：新输入始终可重试", async () => {
    await measureStress("overlap-rollback-database-switch", async () => {
      const { runtime, db, localId } = await setup();
      const session = runtime.sessions.get(localId)!;
      await runtime.project(session);
      const tree = new NodeTree(session.doc);
      const originalLocalize = runtime.assets.localizeDocument.bind(runtime.assets);
      const originalCommit = ContentDocumentBlocks.commit.bind(ContentDocumentBlocks);
      let expected = "正文";
      try {
        for (let step = 0; step < 30; step++) {
          const addition = `前${step}`;
          tree.insertText("paragraph", 0, addition, {});
          expected = addition + expected;
          vi.spyOn(runtime.assets, "localizeDocument").mockImplementationOnce(async (...args) => {
            const value = await originalLocalize(...args);
            tree.insertText("paragraph", 0, "晚到", {});
            expected = "晚到" + expected;
            return value;
          });
          await Promise.all(Array.from({ length: 8 }, () => runtime.project(session)));
          expect(session.projectedVersion).not.toEqual(session.projectionVersion);
          const before = ContentDocumentTable.read(db, 7)!;
          vi.spyOn(ContentDocumentBlocks, "commit").mockImplementationOnce((...args) => {
            originalCommit(...args);
            throw new Error("写入后模拟故障，事务必须回滚");
          });
          await expect(runtime.project(session)).rejects.toThrow("事务必须回滚");
          expect(ContentDocumentTable.read(db, 7)).toEqual(before);
          expect(session.projectedVersion).not.toEqual(session.projectionVersion);
          vi.spyOn(runtime.assets, "localizeDocument").mockImplementationOnce(async (...args) => {
            const value = await originalLocalize(...args);
            host.databases.delete("library");
            return value;
          });
          await runtime.project(session);
          expect(ContentDocumentTable.read(db, 7)).toEqual(before);
          expect(session.projectionDirty).toBe(true);
          host.databases.set("library", db);
          await runtime.project(session);
          expect(
            ContentDocumentTable.read(db, 7)!
              .content[0].children!.map(leaf => leaf.text)
              .join("")
          ).toBe(expected);
          expect(session.projectedVersion).toEqual(session.projectionVersion);
        }
        return {
          rounds: 30,
          overlappingRequests: 240,
          lateInputs: 30,
          rollbacks: 30,
          databaseSwitches: 30,
        };
      } finally {
        host.databases.set("library", db);
        tree.dispose();
      }
    });
  }, 120000);

  it("双视图并发输入与重复增量：接纳后收敛且不重复文字", async () => {
    await measureStress("two-view-increments", async () => {
      const { runtime, db, localId, store, state } = await setup();
      const session = runtime.sessions.get(localId)!;
      await runtime.project(session);
      const queue = new NodeSessionUpdates(store, state);
      const peers = [
        new NodeTree(new Y.Doc({ gc: false })),
        new NodeTree(new Y.Doc({ gc: false })),
      ];
      const updates: Uint8Array[][] = [[], []];
      try {
        peers.forEach((peer, index) => {
          Y.applyUpdate(peer.doc, Y.encodeStateAsUpdate(session.doc));
          peer.doc.on("update", update => updates[index].push(new Uint8Array(update)));
        });
        for (let step = 0; step < 120; step++)
          peers.forEach((peer, index) => peer.insertText("paragraph", 0, `[${index}:${step}]`, {}));
        const delivered = updates[0].flatMap((update, index) => [
          update,
          updates[1][index],
          ...(index % 4 === 0 ? [update, updates[1][index]] : []),
        ]);
        for (let offset = 0; offset < delivered.length; offset += 8) {
          await Promise.all(
            delivered
              .slice(offset, offset + 8)
              .map(update => queue.apply(session, update, () => {}))
          );
          await runtime.project(session);
        }
        const actual = ContentDocumentTable.read(db, 7)!
          .content[0].children!.map(leaf => leaf.text)
          .join("");
        for (let step = 0; step < 120; step++)
          for (let peer = 0; peer < 2; peer++)
            expect(actual.split(`[${peer}:${step}]`)).toHaveLength(2);
        const converged = Y.encodeStateAsUpdate(session.doc);
        for (const peer of peers) {
          Y.applyUpdate(peer.doc, converged);
          expect(peer.read()).toEqual(readNodeDocument(session.doc).content);
        }
        const loaded = store.load(localId);
        try {
          expect(readNodeDocument(loaded.doc).content).toEqual(
            readNodeDocument(session.doc).content
          );
        } finally {
          loaded.doc.destroy();
        }
        return {
          writers: 2,
          edits: 240,
          duplicateUpdates: delivered.length - 240,
          deliveredUpdates: delivered.length,
          parallelBatch: 8,
        };
      } finally {
        for (const peer of peers) {
          peer.dispose();
          peer.doc.destroy();
        }
      }
    });
  }, 120000);

  it("真实 WebSocket 六轮断线重连：离线编辑最终进入服务端", async () => {
    await measureStress("websocket-reconnect", async () => {
      const { runtime, db, event, server } = await setup(true);
      const shared = await runtime.createContent(event, 7);
      const session = runtime.sessions.get(shared.documentId)!;
      await vi.waitFor(() => expect(session.provider?.synced).toBe(true), { timeout: 10000 });
      await runtime.project(session);
      const tree = new NodeTree(session.doc);
      let expected = "正文";
      try {
        for (let round = 0; round < 6; round++) {
          for (const transport of runtime.transports.values()) transport.disconnect();
          await vi.waitFor(
            () =>
              expect(
                [...runtime.transports.values()].every(
                  transport => transport.status === "disconnected"
                )
              ).toBe(true),
            { timeout: 10000 }
          );
          for (let edit = 0; edit < 40; edit++) {
            const token = `[${round}:${edit}]`;
            tree.insertText("paragraph", 0, token, {});
            expected = token + expected;
          }
          await runtime.project(session);
          expect(
            ContentDocumentTable.read(db, 7)!
              .content[0].children!.map(leaf => leaf.text)
              .join("")
          ).toBe(expected);
          await Promise.all([...runtime.transports.values()].map(transport => transport.connect()));
          await vi.waitFor(
            () => {
              const remote = server.store.loadDocument(shared.documentId);
              try {
                expect(
                  readNodeDocument(remote)
                    .content[0].children!.map(leaf => leaf.text)
                    .join("")
                ).toBe(expected);
              } finally {
                remote.destroy();
              }
            },
            { timeout: 10000 }
          );
        }
        return { reconnects: 6, offlineEdits: 240 };
      } finally {
        tree.dispose();
      }
    });
  }, 120000);
});

it.each([false, true])("正文范围提交和撤销保持其他内容完整（共享=%s）", async shared => {
  const { runtime, localId, event, db, server } = await setup(false, ["第一段", "第二段"]);
  const sessionId = shared ? (await runtime.createContent(event, 7)).documentId : localId;
  const original = await runtime.readEditSnapshot(db, 7);
  const snapshot = new Y.Doc();
  Y.applyUpdate(snapshot, original.state);
  const tree = new NodeTree(snapshot);
  try {
    const blockId = String(readNodeDocument(snapshot).content[0].collabId);
    const edit = captureScopedTextEdit(tree, "edit", blockId, 0, 1, "AI");
    const request = { ...original.identity, operationId: "scope-edit", scope: { edits: [edit] } };
    if (shared) {
      const transport = runtime.client.request.bind(runtime.client);
      let lost = 2;
      vi.spyOn(runtime.client, "request").mockImplementation(
        async (url, path, method, body, version) => {
          const result = await transport(url, path, method, body, version);
          if (path.endsWith("/operations/scope-edit") && lost > 0) {
            lost--;
            throw new Error("模拟响应丢失");
          }
          return result;
        }
      );
      expect(await runtime.applyScopedEdit(db, 7, request)).toEqual({ status: "pending" });
    } else {
      const append = vi.spyOn(runtime.store, "append").mockImplementationOnce(() => {
        throw new Error("模拟本机落盘失败");
      });
      await expect(runtime.applyScopedEdit(db, 7, request)).rejects.toThrow("模拟本机落盘失败");
      expect((await runtime.readEditSnapshot(db, 7)).content).toEqual(original.content);
      append.mockRestore();
    }
    const applied = await runtime.applyScopedEdit(db, 7, request);
    expect(applied.status).toBe("committed");
    if (applied.status !== "committed" || !applied.inverse) throw new Error("缺少撤销操作");
    expect(await runtime.applyScopedEdit(db, 7, request)).toEqual(applied);
    const updated = await runtime.readEditSnapshot(db, 7);
    expect(updated.content[0].children?.[0].text).toBe("AI一段");
    expect(updated.content[1]).toEqual(original.content[1]);
    const conflict = await runtime.applyScopedEdit(db, 7, { ...request, operationId: "stale" });
    expect(conflict).toMatchObject({ status: "conflict", conflicts: [{ opId: "edit", blockId }] });
    const reverted = await runtime.applyScopedEdit(db, 7, {
      ...original.identity,
      operationId: "scope-edit-undo",
      scope: applied.inverse,
    });
    expect(reverted.status).toBe("committed");
    expect((await runtime.readEditSnapshot(db, 7)).content).toEqual(original.content);
    if (shared) expect(server.store.operations.sequence(sessionId)).toBe(2);
  } finally {
    tree.dispose();
    snapshot.destroy();
  }
});

it.each([false, true])("大段修改可原样撤销，超限不写入（共享=%s）", async shared => {
  const longOriginal = "原".repeat(40_000);
  const { runtime, localId, event, db, server } = await setup(false, [
    "原文",
    "第二段保留",
    longOriginal,
  ]);
  const sessionId = shared ? (await runtime.createContent(event, 7)).documentId : localId;
  const original = await runtime.readEditSnapshot(db, 7);
  const originalSequence = shared ? server.store.operations.sequence(sessionId) : 0;
  const doc = new Y.Doc();
  Y.applyUpdate(doc, original.state);
  const tree = new NodeTree(doc);
  const propose = (proposalId: string, block: number, before: string, text: string) =>
    runtime.suggestions.create(db, 7, {
      proposalId,
      conversationKey: proposalId,
      baseline: original.identity,
      items: [
        {
          edit: captureScopedTextEdit(
            tree,
            "edit",
            String(original.content[block].collabId),
            0,
            before.length,
            text
          ),
          beforeText: before,
          afterText: text,
        },
      ],
    })[0];
  const key = (id: string) =>
    `scoped-edit:${original.identity.documentId}:${original.identity.baselineId}:${original.identity.epoch}:${id}`;
  try {
    const oversized = propose("oversized", 2, longOriginal, "新句");
    expect(await runtime.suggestions.accept(db, 7, [oversized.id])).toMatchObject([
      { id: oversized.id, status: "expired", error: expect.stringContaining("可撤销容量") },
    ]);
    expect((await runtime.readEditSnapshot(db, 7)).content).toEqual(original.content);
    if (shared) {
      const ownerId = server.store.document(sessionId).owner_id;
      expect(server.store.operations.get(sessionId, oversized.id, ownerId)).toMatchObject({
        state: "ABORTED",
        reason: "UNDO_LIMIT",
      });
      expect(server.store.operations.sequence(sessionId)).toBe(originalSequence);
    } else expect(runtime.store.get(key(oversized.id), null)).toBeNull();

    // 正向回执在预算内，若额外记录重做，撤销回执会超限。
    const text = "新".repeat(12_000);
    const accepted = propose("large", 0, "原文", text);
    expect(await runtime.suggestions.accept(db, 7, [accepted.id])).toEqual([
      { id: accepted.id, status: "accepted" },
    ]);
    const changed = (await runtime.readEditSnapshot(db, 7)).content;
    expect(changed[0].children?.map(leaf => leaf.text).join("")).toBe(text);
    expect(changed.slice(1)).toEqual(original.content.slice(1));
    expect(await runtime.suggestions.undo(db, 7, [accepted.id])).toEqual([
      { id: accepted.id, status: "undone" },
    ]);
    expect((await runtime.readEditSnapshot(db, 7)).content).toEqual(original.content);
    if (shared) {
      const ownerId = server.store.document(sessionId).owner_id;
      const forward = server.store.operations.get(sessionId, accepted.id, ownerId);
      const reverse = server.store.operations.get(sessionId, `${accepted.id}-undo`, ownerId);
      expect(forward?.receipt?.inverse?.edits).toHaveLength(1);
      expect(reverse?.state).toBe("COMMITTED");
      expect(reverse?.receipt?.inverse).toBeUndefined();
      expect(server.store.operations.sequence(sessionId)).toBe(originalSequence + 2);
    } else {
      expect(runtime.store.get(key(accepted.id), null)).toMatchObject({
        inverse: { edits: [expect.anything()] },
      });
      expect(runtime.store.get(key(`${accepted.id}-undo`), null)).toMatchObject({
        hash: expect.any(String),
      });
    }
  } finally {
    tree.dispose();
    doc.destroy();
  }
});

it("停止 Agent 后真实本机队列只保留首个已提交片段并可撤销", async () => {
  const { runtime, db, localId } = await setup(false, ["第一段原文", "第二段保留"]);
  const original = await runtime.readEditSnapshot(db, 7);
  const doc = new Y.Doc();
  Y.applyUpdate(doc, original.state);
  const tree = new NodeTree(doc);
  const stop = registerAgentEditExecution("manager-scoped-edit");
  try {
    const id = String(original.content[0].collabId);
    const text = "甲乙丙丁戊己";
    const [item] = runtime.suggestions.create(db, 7, {
      proposalId: "manager-stop",
      conversationKey: "test-chat",
      baseline: original.identity,
      mode: "direct",
      items: [
        {
          edit: captureScopedTextEdit(tree, "edit", id, 0, 2, text),
          beforeText: "第一",
          afterText: text,
        },
      ],
    });
    const append = runtime.store.append.bind(runtime.store);
    const spy = vi.spyOn(runtime.store, "append").mockImplementation((...args) => {
      append(...args);
      queueMicrotask(stop);
    });
    await runtime.suggestions.accept(db, 7, [item.id], {
      typing: true,
      executionId: "manager-scoped-edit",
    });
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
    const saved = runtime.store.load(localId)?.doc;
    if (!saved) throw new Error("缺少落盘正文");
    try {
      const content = readNodeDocument(saved).content;
      expect(content[0].children?.[0].text).toBe("甲乙段原文");
      expect(content[1]).toEqual(original.content[1]);
    } finally {
      saved.destroy();
    }
    expect(
      runtime.suggestions.list(db, { proposalId: "manager-stop" }).map(row => row.status)
    ).toEqual(["accepted", "pending"]);
    expect((await runtime.suggestions.undo(db, 7, [item.id]))[0].status).toBe("undone");
    expect((await runtime.readEditSnapshot(db, 7)).content).toEqual(original.content);
  } finally {
    stop();
    tree.dispose();
    doc.destroy();
  }
});

it("停止共享 Agent 时取消在途原操作，迟到的提交不写正文", async () => {
  const { runtime, db, event, server } = await setup(false, ["第一段原文", "第二段保留"]);
  const { documentId } = await runtime.createContent(event, 7);
  const original = await runtime.readEditSnapshot(db, 7);
  const doc = new Y.Doc();
  Y.applyUpdate(doc, original.state);
  const tree = new NodeTree(doc);
  const stop = registerAgentEditExecution("shared-stopped");
  let release!: () => void;
  let arrival!: () => void;
  let cancelled!: () => void;
  const delayed = new Promise<void>(resolve => {
    release = resolve;
  });
  const arrived = new Promise<void>(resolve => {
    arrival = resolve;
  });
  const cancelSeen = new Promise<void>(resolve => {
    cancelled = resolve;
  });
  try {
    const id = String(original.content[0].collabId);
    const [item] = runtime.suggestions.create(db, 7, {
      proposalId: "shared-stop",
      conversationKey: "test-chat",
      baseline: original.identity,
      mode: "direct",
      items: [
        {
          edit: captureScopedTextEdit(tree, "edit", id, 0, 2, "替换"),
          beforeText: "第一",
          afterText: "替换",
        },
      ],
    });
    const transport = runtime.client.request.bind(runtime.client);
    vi.spyOn(runtime.client, "request").mockImplementation(
      async (url, path, method, body, version) => {
        if (method === "POST" && path.endsWith(`/operations/${item.id}`)) {
          arrival();
          await delayed;
        }
        const result = await transport(url, path, method, body, version);
        if (path.endsWith(`/operations/${item.id}/cancel`)) cancelled();
        return result;
      }
    );
    const pending = runtime.suggestions.accept(db, 7, [item.id], {
      typing: true,
      executionId: "shared-stopped",
    });
    await arrived;
    stop();
    await cancelSeen;
    release();
    expect(await pending).toMatchObject([
      { id: item.id, status: "expired", error: "Agent 已停止，提交已取消" },
    ]);
    expect(server.store.operations.sequence(documentId)).toBe(0);
    expect((await runtime.readEditSnapshot(db, 7)).content).toEqual(original.content);
  } finally {
    release();
    stop();
    tree.dispose();
    doc.destroy();
  }
});
