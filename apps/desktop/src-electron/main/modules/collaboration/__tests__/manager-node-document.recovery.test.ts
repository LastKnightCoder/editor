// @vitest-environment node
import { cleanup, host, resetAfterEach } from "./manager-node-document.mocks";
import Database from "better-sqlite3";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import {
  NodeTree,
  readNodeDocument,
  createWhiteboardDocument,
  WhiteboardModel,
  type ContentNode,
} from "@tau/collaboration";
import { applyNodeTreeContent } from "@tau/editor-collab";
import { prepareContentContract } from "@tau/db-schema/content-contracts";
import schema from "@tau/db-schema/schema/main.sql?raw";
import { ContentDocumentTable } from "../../tables/content-document";
import { ContentIdentityTable } from "../../tables/content-identity";
import type { RuntimeSession } from "../types";
import { unregisterContentSession } from "../content-sessions";
import { sourceDraftKey } from "../content-local-state";
import { setup } from "./manager-node-document.helpers";

afterEach(resetAfterEach);

describe("冷缓存恢复与资料库切换", () => {
  it("正文退出屏障必须收到保存确认，超时恢复编辑，重试成功才保持冻结", async () => {
    const { local, localSessions, localId } = await setup();
    const session = localSessions.get(localId)!;
    local.views.set("unsaved-view", { documentId: localId, windowId: 1 });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const waiting = local.drainDatabase({ reason: "quit" });
    const oldRequest = local.freezeWaiters.get(localId)!.id;
    const rejected = expect(waiting).rejects.toThrow("未完成保存");
    await vi.advanceTimersByTimeAsync(10_000);
    await rejected;
    expect(session.info.frozen).toBe(false);
    const next = local.drainDatabase({ reason: "quit" });
    local.acknowledgeFreeze("unsaved-view", oldRequest);
    expect(session.drainingViews?.has("unsaved-view")).toBe(true);
    local.acknowledgeFreeze("unsaved-view", local.freezeWaiters.get(localId)!.id);
    const drain = await next;
    drain.commit();
    expect(session.info.frozen).toBe(true);
  });

  it("丢弃本机会话等待保存确认超时后恢复编辑，视图与缓存保留", async () => {
    const { local, localSessions, localStore: store, localId } = await setup();
    const session = localSessions.get(localId)!;
    local.views.set("unsaved-view", { documentId: localId, windowId: 1 });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const discarding = expect(local.removeSession(session)).rejects.toThrow("未完成保存");
    await vi.advanceTimersByTimeAsync(10_000);
    await discarding;
    expect(session.info.frozen).toBe(false);
    expect(local.views.has("unsaved-view")).toBe(true);
    expect(store.list().some(info => info.id === localId)).toBe(true);
  });

  it("正文投影失败不放行退出，已冻结会话回滚后仍可编辑", async () => {
    const { local, localSessions, localId } = await setup();
    const session = localSessions.get(localId)!;
    vi.spyOn(local, "project").mockRejectedValueOnce(new Error("disk full"));
    await expect(local.drainDatabase({ reason: "quit" })).rejects.toThrow("disk full");
    expect(session.info.frozen).toBe(false);
  });

  it("切库排空补投视图确认前的末批输入，主库失败后保全日志并允许重试", async () => {
    const { local, localSessions, localAssets, localStore: store, db, localId } = await setup();
    const session = localSessions.get(localId)!;
    await local.project(session);
    const tree = new NodeTree(session.doc);
    const entered = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    const localize = localAssets.localizeDocument.bind(localAssets);
    vi.spyOn(localAssets, "localizeDocument").mockImplementationOnce(async (...args) => {
      entered.resolve();
      await resume.promise;
      return localize(...args);
    });
    const scope = { databaseName: "library", windowId: 1, reason: "database-change" as const };
    const viewId = "switch-draining-view";
    const stayingViewId = "staying-view";
    const switchingView = {
      documentId: localId,
      windowId: 1,
      clientIds: [],
      inputIdentity: {
        workspaceId: "library",
        documentId: localId,
        baselineId: String(session.doc.getMap("meta").get("baselineId")),
        epoch: Number(session.doc.getMap("meta").get("epoch")),
      },
    };
    const stayingView = { ...switchingView, windowId: 2, clientIds: [] };
    const savedText = () => {
      const row = db.prepare("SELECT content FROM content_snapshots WHERE id=7").get() as {
        content: string;
      };
      const blocks = JSON.parse(row.content) as ContentNode[];
      return blocks[0].children?.map(leaf => leaf.text).join("");
    };
    db.exec(`
      CREATE TEMP TRIGGER reject_tail_projection BEFORE UPDATE OF revision ON content_documents
      WHEN EXISTS (
        SELECT 1 FROM content_document_blocks
        WHERE content_id=NEW.content_id AND instr(content, '末批输入')>0
      ) BEGIN SELECT RAISE(ABORT, '末批投影写入失败'); END;
    `);
    tree.insertText("paragraph", 0, "首批输入", {});
    const first = local.project(session);
    try {
      await entered.promise;
      local.views.set(viewId, switchingView);
      local.views.set(stayingViewId, stayingView);
      const draining = local.drainDatabase(scope);
      void draining.catch(() => undefined);
      const requestId = local.freezeWaiters.get(localId)!.id;
      {
        const peer = new Y.Doc({ gc: false });
        const peerTree = new NodeTree(peer);
        try {
          Y.applyUpdate(peer, Y.encodeStateAsUpdate(session.doc));
          const before = Y.encodeStateVector(peer);
          peerTree.insertText("paragraph", 0, "末批输入", {});
          await local.acceptUpdates(session, Y.encodeStateAsUpdate(peer, before), () => {
            if (!session.drainingViews?.has(viewId)) throw new Error("视图已完成排空");
          });
        } finally {
          peerTree.dispose();
          peer.destroy();
        }
      }
      local.acknowledgeFreeze(viewId, requestId);
      local.acknowledgeFreeze(stayingViewId, requestId);
      resume.resolve();
      await first;
      await expect(draining).rejects.toThrow("末批投影写入失败");
      expect(savedText()).toBe("首批输入正文");
      expect(session.info.frozen).toBe(false);
      expect(local.views.get(viewId)).toBe(switchingView);
      expect(local.views.get(stayingViewId)).toBe(stayingView);
      const cached = store.load(localId);
      try {
        expect(readNodeDocument(cached.doc).content[0].children?.[0].text).toBe(
          "末批输入首批输入正文"
        );
      } finally {
        cached.doc.destroy();
      }

      db.exec("DROP TRIGGER reject_tail_projection");
      const retry = local.drainDatabase(scope);
      const retryRequestId = local.freezeWaiters.get(localId)!.id;
      local.acknowledgeFreeze(viewId, retryRequestId);
      local.acknowledgeFreeze(stayingViewId, retryRequestId);
      const prepared = await retry;
      expect(savedText()).toBe("末批输入首批输入正文");
      prepared.commit();
      expect(local.views.has(viewId)).toBe(false);
      expect(local.views.get(stayingViewId)).toBe(stayingView);
      expect(session.info.frozen).toBe(false);
    } finally {
      resume.resolve();
      await first.catch(() => undefined);
      tree.dispose();
    }
  });

  it("缓存缺失重建使用新协作基线，稳定正文身份不变", async () => {
    const { local, localSessions, db, localStore: store, localId, event } = await setup();
    const previous = localSessions.get(localId)!;
    const identity = ContentDocumentTable.read(db, 7)!.documentId;
    const baseline = previous.doc.getMap("meta").get("baselineId");
    unregisterContentSession(previous);
    previous.awareness.destroy();
    previous.doc.destroy();
    localSessions.delete(localId);
    store.remove(localId);
    const opened = await local.open(event, { contentId: 7 });
    const current = localSessions.get(opened.documentId)!;
    expect(current.doc.getMap("meta").get("baselineId")).not.toBe(baseline);
    expect(ContentDocumentTable.read(db, 7)!.documentId).toBe(identity);
    expect(current.info.source?.projectionRevision).toBe(
      ContentDocumentTable.read(db, 7)!.revision
    );
    await local.project(current);
  });

  it("冷缓存损坏时备份后丢弃，打开正文按主库重建", async () => {
    const {
      local,
      localSessions,
      localDirectory,
      db,
      localStore: store,
      localId,
      event,
    } = await setup();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const previous = localSessions.get(localId)!;
    unregisterContentSession(previous);
    previous.awareness.destroy();
    previous.doc.destroy();
    localSessions.delete(localId);
    store.db.prepare("UPDATE sessions SET state_hash='broken' WHERE id=?").run(localId);
    const opened = await local.open(event, { contentId: 7 });
    expect(opened.documentId).toBe(localId);
    expect(localSessions.get(localId)!.doc.getText("title")).toBeDefined();
    expect(() => store.load(localId)).not.toThrow();
    expect(readdirSync(join(localDirectory, "discarded"))).toHaveLength(1);
    expect(ContentDocumentTable.read(db, 7)).not.toBeNull();
  });

  it("共享冷缓存损坏不阻断目录刷新，打开时并发复用远端快照重建", async () => {
    const { runtime, sharedDirectory, local, localSessions, store, localId, event, server, owner } =
      await setup();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { documentId } = await runtime.createContent(event, 7);
    const boardRoom = server.store.create(owner.id, "board");
    const boardSource = new Y.Doc();
    const board = new WhiteboardModel(boardSource);
    board.submit([{ type: "create_page", title: "页" }], {});
    const boardDoc = await createWhiteboardDocument(
      { documentId: boardRoom.id, epoch: 0, baselineId: "board-base" },
      Y.encodeStateAsUpdate(boardSource)
    );
    try {
      await server.store.publish(boardRoom.id, owner.id, Y.encodeStateAsUpdate(boardDoc));
    } finally {
      board.dispose();
      boardSource.destroy();
      boardDoc.destroy();
    }
    expect(localSessions.has(localId)).toBe(false);
    const shared = runtime.content.sessions.get(documentId)!;
    unregisterContentSession(shared);
    shared.awareness.destroy();
    shared.doc.destroy();
    runtime.content.sessions.delete(documentId);
    store.db.prepare("UPDATE sessions SET state_hash='broken' WHERE id=?").run(documentId);
    runtime.stopped = false;
    vi.spyOn(
      runtime as unknown as { connectEvents(): Promise<void> },
      "connectEvents"
    ).mockResolvedValue();
    store.set("identity:http://test", "{}");
    const request = vi.spyOn(runtime.client, "request");
    await runtime.refresh();
    expect(runtime.content.sessions.has(documentId)).toBe(false);
    expect(runtime.state().sessions).toContainEqual(
      expect.objectContaining({ id: documentId, connection: "idle" })
    );
    expect(runtime.state().whiteboards).toMatchObject([{ id: boardRoom.id }]);
    expect(
      request.mock.calls.some(([, path]) => path.endsWith("/state") || path.endsWith("/protocol"))
    ).toBe(false);
    const [rebuilt, second] = await Promise.all([
      runtime.openRoom(documentId),
      local.open(event, { contentId: 7 }),
    ]);
    expect(second.documentId).toBe(documentId);
    expect(request.mock.calls.filter(([, path]) => path.endsWith("/state"))).toHaveLength(1);
    expect(rebuilt.info.serverUrl).toBe("http://test");
    expect(rebuilt.info.source?.contentId).toBe(7);
    expect((runtime as unknown as { error?: string }).error).toBeUndefined();
    expect(readdirSync(join(sharedDirectory, "discarded"))).toHaveLength(1);
  });

  it("共享会话遇到远端换代：备份旧缓存后按远端快照重建，不冻结", async () => {
    const { runtime, sharedDirectory, store, event } = await setup();
    const { documentId } = await runtime.createContent(event, 7);
    const shared = runtime.content.sessions.get(documentId)!;
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
    const send = vi.spyOn(runtime.content, "broadcast");
    await sync
      .syncRemoteDocument("http://test", { ...shared.info })
      .finally(() => protocol.mockRestore());
    const rebuilt = runtime.content.sessions.get(documentId)!;
    expect(rebuilt).not.toBe(shared);
    expect(rebuilt.info.frozen).toBeFalsy();
    expect(rebuilt.info.remoteVersionAvailable).toBeFalsy();
    expect(rebuilt.info.source?.contentId).toBe(7);
    expect(readdirSync(join(sharedDirectory, "discarded"))).toHaveLength(1);
    expect(
      store.db.prepare("SELECT count(*) AS count FROM sessions WHERE id=?").get(documentId)
    ).toEqual({ count: 1 });
    expect(send).toHaveBeenCalledWith("collaboration:removed", { documentId, replaced: true });
    // 重建保持静默：不再广播 collaboration:notice
    expect(send).not.toHaveBeenCalledWith("collaboration:notice", expect.anything());
  });

  it("重启后主库先被其它入口改写：打开正文显示新内容，旧缓存备份后重建，后续编辑能落库", async () => {
    const {
      local,
      localSessions,
      localDirectory,
      db,
      localStore: store,
      localId,
      event,
    } = await setup();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const previous = localSessions.get(localId)!;
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
    localSessions.delete(localId);
    // 打开前插件/MCP 改写了主库
    const before = ContentDocumentTable.read(db, 7)!;
    const replacement = structuredClone(before);
    replacement.content[0].children = [{ text: "外部新正文" }];
    ContentDocumentTable.commit(db, 7, replacement, {
      expectedRevision: before.revision,
      count: 5,
    });

    await local.open(event, { contentId: 7 });
    const reopened = localSessions.get(localId)!;
    expect(JSON.stringify(readNodeDocument(reopened.doc).content)).toContain("外部新正文");
    expect(reopened.info.source?.projectionRevision).toBe(
      ContentDocumentTable.read(db, 7)!.revision
    );
    const [backup] = readdirSync(join(localDirectory, "discarded"));
    expect(backup).toBeDefined();
    expect(
      JSON.stringify(
        readNodeDocument(
          (() => {
            const doc = new Y.Doc({ gc: false });
            const saved = JSON.parse(
              readFileSync(join(localDirectory, "discarded", backup), "utf8")
            );
            Y.applyUpdate(doc, Buffer.from(saved.state, "base64"));
            for (const update of saved.updates) Y.applyUpdate(doc, Buffer.from(update, "base64"));
            return doc;
          })()
        ).content
      )
    ).toContain("缓存里未投影的");

    reopened.doc.getText("title").insert(0, "新标题");
    await expect(local.project(reopened)).resolves.toBeUndefined();
  });

  it("冷缓存修订落后但主库只是投影相同内容时直接写回，不重建", async () => {
    const { local, localSessions, localStore: store, localId, event } = await setup();
    const previous = localSessions.get(localId)!;
    previous.doc.getText("title").insert(0, "未投影标题");
    store.compact(localId, previous.doc);
    const baseline = previous.doc.getMap("meta").get("baselineId");
    unregisterContentSession(previous);
    previous.awareness.destroy();
    previous.doc.destroy();
    localSessions.delete(localId);
    await local.open(event, { contentId: 7 });
    const reopened = localSessions.get(localId)!;
    expect(reopened.doc.getMap("meta").get("baselineId")).toBe(baseline);
    expect(reopened.doc.getText("title").toString()).toContain("未投影标题");
  });

  it("外部正文已更新时旧缓存不能借最新修订覆盖，原输入仍留在缓存", async () => {
    const { local, localSessions, db, localStore: store, localId } = await setup();
    const session = localSessions.get(localId)!;
    const before = ContentDocumentTable.read(db, 7)!;
    const replacement = structuredClone(before);
    replacement.content[0].children = [{ text: "外部新正文" }];
    ContentDocumentTable.commit(db, 7, replacement, {
      expectedRevision: before.revision,
      count: 5,
    });
    await expect(local.project(session)).rejects.toThrow("修订冲突");
    expect(ContentDocumentTable.read(db, 7)!.content[0].children).toEqual([{ text: "外部新正文" }]);
    const retained = store.load(localId);
    try {
      expect(JSON.stringify(readNodeDocument(retained.doc))).toContain("正文");
      expect(retained.info.source?.projectionRevision).toBe(before.revision);
    } finally {
      retained.doc.destroy();
    }
  });

  it("整库被下载替换后丢弃本库的本地缓存，重开正文读新库内容", async () => {
    const {
      local,
      localSessions,
      localDirectory,
      event,
      localStore: store,
      localId,
    } = await setup();
    const drain = await local.drainDatabase({
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
    store.set(sourceDraftKey("library", "node", "text"), { value: "草稿基线" });
    for (const name of ["library", "library.db"]) {
      await local.releaseLibrary(name);
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
    const discarded = join(localDirectory, "discarded");
    const archives = readdirSync(discarded).filter(file => file.endsWith("-drafts.json"));
    expect(archives).toHaveLength(1);
    const archived = JSON.parse(readFileSync(join(discarded, archives[0]), "utf8"));
    expect(archived.inputDrafts).toEqual([
      expect.objectContaining({ value: "旧草稿", base: JSON.stringify({ value: "草稿基线" }) }),
      expect.objectContaining({ value: "旧草稿" }),
    ]);
    expect(archived.documentDrafts).toEqual([
      expect.objectContaining({ state: "AQ==" }),
      expect.objectContaining({ state: "AQ==" }),
    ]);
    expect(localSessions.has(localId)).toBe(false);
    expect(store.list().some(session => session.id === localId)).toBe(false);
    const opened = await local.open(event, { contentId: 7 });
    expect(opened.frozen).toBe(false);
  });

  it("整库同步不冻结共享视图，换库后保留离线编辑和未确认草稿", async () => {
    const { runtime, event, store, db } = await setup();
    const { documentId } = await runtime.createContent(event, 7);
    const session = runtime.content.sessions.get(documentId)!;
    const identity = {
      workspaceId: "library",
      documentId,
      baselineId: String(session.doc.getMap("meta").get("baselineId")),
      epoch: 0,
    };
    const source = session.info.source!;
    const freeze = vi.spyOn(runtime.content, "freeze");
    const preserve = vi
      .spyOn(
        runtime as unknown as { preserveOwnerImages(session: RuntimeSession): Promise<void> },
        "preserveOwnerImages"
      )
      .mockRejectedValueOnce(new Error("共享图片服务离线"));
    runtime.content.views.set("shared-view", { documentId, windowId: 1 });
    const tree = new NodeTree(session.doc);
    tree.insertText("paragraph", 0, "共享未同步", {});
    tree.dispose();
    store.db
      .prepare("INSERT INTO document_drafts VALUES (?,?,?,?,?,?,?,?,0)")
      .run(
        "shared-view",
        identity.workspaceId,
        identity.documentId,
        identity.baselineId,
        identity.epoch,
        Buffer.from([1, 2, 3]),
        "未确认草稿",
        1
      );
    const drain = await runtime.content.drainDatabase({
      databaseName: "library.db",
      reason: "database-sync",
      replace: true,
    });
    drain.commit();
    expect(freeze).not.toHaveBeenCalled();
    expect(preserve).not.toHaveBeenCalled();
    expect(runtime.content.views.has("shared-view")).toBe(true);
    expect(session.info.source).toBe(source);
    expect(session.info.pending).toBe(true);
    const cached = store.load(documentId);
    try {
      expect(JSON.stringify(readNodeDocument(cached.doc))).toContain("共享未同步");
    } finally {
      cached.doc.destroy();
    }
    expect(
      store.db.prepare("SELECT state FROM document_drafts WHERE view_id=?").get("shared-view")
    ).toEqual({ state: Buffer.from([1, 2, 3]) });

    const downloaded = ContentDocumentTable.read(db, 7)!;
    const content = structuredClone(downloaded.content);
    content[0].children = [{ text: "同步下载候选" }];
    ContentDocumentTable.commit(
      db,
      7,
      { ...downloaded, content },
      {
        installDocument: true,
        expectedRevision: downloaded.revision,
        count: 6,
      }
    );
    preserve.mockRestore();
    await expect(runtime.content.project(session)).rejects.toThrow("投影修订已变化");
    expect(ContentDocumentTable.read(db, 7)!.content[0].children).toEqual([
      { text: "同步下载候选" },
    ]);
    expect(JSON.stringify(readNodeDocument(session.doc))).toContain("共享未同步");
  });

  it("同步替换释放未加载的冷缓存，之后按新库重新打开", async () => {
    const {
      local,
      localSessions,
      localDirectory,
      localAssets,
      event,
      localStore: store,
      localId,
    } = await setup();
    const session = localSessions.get(localId)!;
    const image = await prepareContentContract("tau.image", {
      type: "image",
      kind: "block",
      dataVersion: 1,
      isVoid: true,
      resources: [{ path: "url", kind: "image" }],
    });
    const reference = await localAssets.keepLocalFile(localId, {
      name: "unprojected.png",
      mime: "image/png",
      bytes: new TextEncoder().encode("待保全的图片"),
    });
    const path = localAssets.resolveLocalFile(reference, localId)!;
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
    localSessions.delete(localId);
    await local.releaseLibrary("library");
    expect(store.list().some(info => info.id === localId)).toBe(false);
    expect(readFileSync(path, "utf8")).toBe("待保全的图片");
    const discarded = join(localDirectory, "discarded");
    expect(
      readdirSync(discarded).some(name =>
        readFileSync(join(discarded, name), "utf8").includes(path)
      )
    ).toBe(true);
    expect((await local.open(event, { contentId: 7 })).frozen).toBe(false);
    localAssets.removeDocumentCache(localId);
    expect(readFileSync(path, "utf8")).toBe("待保全的图片");
  });

  it("旧来源冷缓存按当前主库重建，并发打开得到同一会话", async () => {
    const { local, localSessions, event, db, localId } = await setup();
    const session = localSessions.get(localId)!;
    unregisterContentSession(session);
    session.awareness.destroy();
    session.doc.destroy();
    localSessions.delete(localId);
    db.prepare("UPDATE library_identity SET source_id='downloaded-library'").run();
    const original = ContentDocumentTable.read(db, 7)!;
    const opened = await Promise.all([
      local.open(event, { contentId: 7 }),
      local.open(event, { contentId: 7 }),
    ]);
    expect(opened[0].source?.librarySourceId).toBe("downloaded-library");
    expect(opened[1].documentId).toBe(opened[0].documentId);
    expect(ContentDocumentTable.read(db, 7)).toEqual(original);
    await expect(local.project(localSessions.get(localId)!)).resolves.toBeUndefined();
  });

  it("同名资料库换连接时在途旧打开拒绝，重试复用新连接会话", async () => {
    const {
      local,
      localSessions,
      localAssets,
      localStore: store,
      event,
      db,
      localId,
    } = await setup();
    const original = ContentDocumentTable.read(db, 7)!;
    await local.removeSession(localSessions.get(localId)!);
    const replacement = new Database(join(host.dir, "replacement.db"));
    cleanup.push(() => {
      replacement.close();
    });
    replacement.exec(schema);
    replacement.exec(
      "INSERT INTO contents(id,create_time,update_time,content,count,ref_count) VALUES(7,1,1,'[]',0,1)"
    );
    ContentIdentityTable.establishBaseline(replacement);
    const downloaded = ContentDocumentTable.commit(
      replacement,
      7,
      {
        ...original,
        documentId: "replaced-content",
        content: [{ ...original.content[0], children: [{ text: "新连接正文" }] }],
      },
      { installDocument: true, count: 5 }
    );
    const entered = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    const prepare = localAssets.prepareLocalDocument.bind(localAssets);
    vi.spyOn(localAssets, "prepareLocalDocument").mockImplementationOnce(async (...args) => {
      entered.resolve();
      await resume.promise;
      return prepare(...args);
    });
    const opening = local.open(event, { contentId: 7 });
    void opening.catch(() => undefined);
    try {
      await entered.promise;
      host.databases.set("library", replacement);
      const current = await local.open(event, { contentId: 7 });
      expect(current.source?.contentDocumentId).toBe(downloaded.documentId);
      resume.resolve();
      await expect(opening).rejects.toThrow("资料库已切换");
      const retried = await local.open(event, { contentId: 7 });
      expect(retried.documentId).toBe(current.documentId);
      expect(localSessions.has(localId)).toBe(false);
      expect(store.list().map(info => info.id)).toEqual([current.documentId]);
      const content = readNodeDocument(localSessions.get(current.documentId)!.doc).content;
      expect(content[0].children?.[0].text).toBe("新连接正文");
      expect(ContentDocumentTable.read(db, 7)).toEqual(original);
      expect(ContentDocumentTable.read(replacement, 7)).toEqual(downloaded);
    } finally {
      resume.resolve();
      await opening.catch(() => undefined);
    }
  });

  it.each(["database-change", "quit"] as const)(
    "主库回退旧格式后 %s 保留新缓存且不投影",
    async reason => {
      const { local, localSessions, db, localStore: store, localId } = await setup();
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const session = localSessions.get(localId)!;
      const before = Y.encodeStateAsUpdate(session.doc);
      db.prepare("DELETE FROM content_documents WHERE content_id=7").run();
      const original = db.prepare("SELECT content FROM contents WHERE id=7").get();
      const drain = await local.drainDatabase({ databaseName: "library", reason });
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
    const { local, localSessions, db, localStore: store, localId } = await setup();
    db.prepare("DELETE FROM content_documents WHERE content_id=7").run();
    localSessions.get(localId)!.dirty = true;
    vi.spyOn(store, "compact").mockImplementation(() => {
      throw new Error("缓存磁盘写入失败");
    });
    await expect(local.drainDatabase({ databaseName: "library", reason: "quit" })).rejects.toThrow(
      "缓存磁盘写入失败"
    );
    expect(localSessions.get(localId)!.info.frozen).toBe(false);
  });

  it("资料库连接重开但身份与正文未变时恢复原会话", async () => {
    const { local, event, localId } = await setup();
    const drain = await local.drainDatabase({
      databaseName: "library",
      reason: "database-change",
    });
    drain.commit();
    const opened = await local.open(event, { contentId: 7 });
    expect(opened.documentId).toBe(localId);
    expect(opened.frozen).toBe(false);
  });
});
