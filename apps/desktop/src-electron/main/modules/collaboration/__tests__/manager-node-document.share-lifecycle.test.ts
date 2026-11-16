// @vitest-environment node
import { host, resetAfterEach } from "./manager-node-document.mocks";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { NodeTree, readNodeDocument, type DocumentStateResponse } from "@tau/collaboration";
import type { ContentSessionRuntime } from "../../content-runtime";
import type { PreparedContentShare } from "../../content-runtime/sharing";
import type { RuntimeSession } from "../types";
import { ContentDocumentTable } from "../../tables/content-document";
import { contentSession } from "../content-sessions";
import { restartHandoffRuntime, setup } from "./manager-node-document.helpers";

afterEach(resetAfterEach);

describe("共享发布、结束与解绑恢复", () => {
  it("转换后发布原类型及业务字段，结束共享接回最终正文且保持主库身份", async () => {
    const { runtime, db, server, owner, event, localSessions } = await setup();
    const identity = ContentDocumentTable.read(db, 7)!.documentId;
    const shared = await runtime.createContent(event, 7);
    const session = runtime.content.sessions.get(shared.documentId)!;
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
    const requestSnapshot = runtime.client.request.bind(runtime.client);
    const invalidSnapshot = vi
      .spyOn(runtime.client, "request")
      .mockImplementation(async (...args) => {
        const result = await requestSnapshot(...args);
        if (!args[1].endsWith("/state")) return result;
        const snapshot = result as DocumentStateResponse;
        return { ...snapshot, protocol: { ...snapshot.protocol, revision: "0".repeat(64) } };
      });
    await expect(runtime.prepareLeave(session)).rejects.toThrow("共享快照与协议修订不匹配");
    expect(session.info.frozen).toBe(false);
    expect(
      invalidSnapshot.mock.calls.filter(([, path]) => path.endsWith("/protocol"))
    ).toHaveLength(0);
    invalidSnapshot.mockRestore();
    host.databases.delete("library");
    await expect(runtime.prepareLeave(session)).rejects.toThrow("原内容所在数据库");
    expect(server.store.document(shared.documentId).status).toBe("active");
    expect(session.info.frozen).toBe(false);
    host.databases.set("library", db);
    const project = vi
      .spyOn(runtime.content, "project")
      .mockRejectedValueOnce(new Error("正文落库失败"));
    await expect(runtime.prepareLeave(session)).rejects.toThrow("正文落库失败");
    expect(server.store.document(shared.documentId).status).toBe("active");
    project.mockRestore();
    const snapshotRequests = vi.spyOn(runtime.client, "request");
    await runtime.prepareLeave(session);
    expect(snapshotRequests.mock.calls.map(([, path]) => path)).toEqual([
      `/v1/documents/${shared.documentId}/state`,
      `/v1/documents/${shared.documentId}/assets`,
    ]);
    snapshotRequests.mockRestore();
    expect(JSON.stringify(ContentDocumentTable.read(db, 7)!.content)).toContain("远端输入正文");
    session.info.leaving = true;
    const request = runtime.client.request.bind(runtime.client);
    let attempt = 0;
    const closeRequests = vi
      .spyOn(runtime.client, "request")
      .mockImplementation(async (...args) => {
        const result = await request(...args);
        if (args[1].endsWith("/close")) {
          attempt++;
          if (attempt === 1) throw new Error("关闭回执丢失");
          if (attempt === 2) return { ok: true, revision: "其他修订" };
        }
        return result;
      });
    await runtime.finishLeave(session);
    expect(server.store.document(shared.documentId).status).toBe("closed");
    expect(session.info.leaving).toBe(true);
    expect(runtime.content.sessions.has(shared.documentId)).toBe(true);
    await runtime.finishLeave(session);
    expect(session.info.leaving).toBe(true);
    expect(session.info.error).toContain("关闭回执未确认");
    expect(session.info.frozen).toBe(true);
    await runtime.finishLeave(session);
    expect(
      closeRequests.mock.calls.filter(args => String(args[1]).endsWith("/close"))
    ).toHaveLength(3);
    expect(server.store.document(shared.documentId).status).toBe("closed");
    const local = [...localSessions.values()][0]!;
    expect(local).toBeDefined();
    expect(JSON.stringify(readNodeDocument(local.doc).content)).toContain("远端输入正文");
    expect(ContentDocumentTable.read(db, 7)!.documentId).toBe(identity);
    expect(db.prepare("SELECT * FROM collaboration_bindings").all()).toEqual([]);
  });

  it.each([false, true])("关闭修订冲突只在确认房间仍活动时解除冻结（已关闭=%s）", async closed => {
    const { runtime, server, owner, event, store } = await setup();
    const { documentId } = await runtime.createContent(event, 7);
    const session = runtime.content.sessions.get(documentId)!;
    await runtime.prepareLeave(session);
    session.info.leaving = true;
    const revision = store.get(`close-revision:${documentId}`, "");
    const doc = server.store.loadDocument(documentId);
    const current = server.store.loadDocument(documentId);
    try {
      const vector = Y.encodeStateVector(doc);
      doc.getText("title").insert(0, "新标题");
      await server.store.appendUpdate(
        documentId,
        owner.id,
        Y.encodeStateAsUpdate(doc, vector),
        current
      );
    } finally {
      doc.destroy();
      current.destroy();
    }
    if (closed)
      server.store.closeDocument(
        documentId,
        owner.id,
        server.store.protocols.state(documentId).revision
      );

    await runtime.finishLeave(session);

    expect(session.info.leaving).toBe(closed);
    expect(session.info.frozen).toBe(closed);
    expect(store.get(`close-revision:${documentId}`, "")).toBe(closed ? revision : "");
    expect(store.get(`close-confirmed:${documentId}`, false)).toBe(false);
  });

  it("首次发布响应丢失保持本机暂停，重试复用同一候选和房间", async () => {
    const { runtime, localSessions, event, localId, server, loseResponse } = await setup();
    loseResponse();
    await expect(runtime.createContent(event, 7)).rejects.toThrow("响应丢失");
    expect(localSessions.get(localId)!.info.frozen).toBe(true);
    const result = await runtime.createContent(event, 7);
    expect(runtime.content.sessions.has(result.documentId)).toBe(true);
    expect(server.store.db.prepare("SELECT count(*) AS count FROM documents").get()).toEqual({
      count: 1,
    });
  });

  it("未知发布重开本机日志后仍使用已发布的房间和基线", async () => {
    const original = await setup();
    const { runtime, event, db, localId, server, localStore: originalLog } = original;
    const key = `publishing:${localId}`;
    original.loseResponse();
    await expect(runtime.createContent(event, 7)).rejects.toThrow("响应丢失");
    const candidate = originalLog.get<{ documentId: string; baselineId: string }>(key, {
      documentId: "",
      baselineId: "",
    });
    expect(server.store.protocols.state(candidate.documentId).baselineId).toBe(
      candidate.baselineId
    );
    expect(db.prepare("SELECT document_id FROM collaboration_bindings").all()).toEqual([]);

    const { local, localLog, sharedLog, handler } = await restartHandoffRuntime(original);
    await expect(local.open(event, { contentId: 7 })).resolves.toMatchObject({
      documentId: localId,
      mode: "local",
      frozen: true,
    });
    await expect(handler("collaboration:create-content")(event, 7)).resolves.toMatchObject({
      documentId: candidate.documentId,
    });
    expect(server.store.db.prepare("SELECT id FROM documents").all()).toEqual([
      { id: candidate.documentId },
    ]);
    expect(db.prepare("SELECT document_id FROM collaboration_bindings").all()).toEqual([
      { document_id: candidate.documentId },
    ]);
    expect(localLog.get(key, null)).toBeNull();
    expect(localLog.list().map(({ id }) => id)).toEqual([]);
    const shared = sharedLog.load(candidate.documentId);
    try {
      expect(shared.doc.getMap("meta").get("baselineId")).toBe(candidate.baselineId);
    } finally {
      shared.doc.destroy();
    }
  });

  it.each(["原资料库", "协作中心"])(
    "发布绑定已提交但尚未安装共享日志，从%s打开只清理匹配的本机冻结会话",
    async entry => {
      const original = await setup();
      const { runtime, event, db, localId, server, store, localStore } = original;
      const key = `publishing:${localId}`;
      const install = vi.spyOn(runtime.content, "install");
      install.mockImplementationOnce(() => {
        throw new Error("主库发布事务之后中断");
      });
      await expect(runtime.createContent(event, 7)).rejects.toThrow("主库发布事务之后中断");
      const candidate = localStore.get<PreparedContentShare | null>(key, null);
      if (!candidate) throw new Error("发布候选未耐久保存");
      const committed = ContentDocumentTable.read(db, 7)!;
      expect(db.prepare("SELECT document_id FROM collaboration_bindings").all()).toEqual([
        { document_id: candidate.documentId },
      ]);
      expect(server.store.protocols.state(candidate.documentId).baselineId).toBe(
        candidate.baselineId
      );
      expect(store.list()).toEqual([]);
      expect(localStore.list().map(({ id }) => id)).toEqual([localId]);

      const {
        local,
        localLog,
        sharedLog,
        shared: manager,
        handler,
      } = await restartHandoffRuntime(original);
      const reopen = async () => {
        if (entry === "原资料库") return local.open(event, { contentId: 7 });
        const session = await manager["openRoom"](candidate.documentId);
        return {
          documentId: session.info.id,
          mode: session.info.mode,
          frozen: session.info.frozen,
        };
      };
      localLog.set(key, { ...candidate, revision: "different-local-revision" });
      await expect(reopen()).resolves.toMatchObject({
        documentId: candidate.documentId,
        mode: "shared",
      });
      expect(localLog.list().map(({ id }) => id)).toEqual([localId]);
      expect(localLog.get(key, null)).not.toBeNull();
      localLog.set(key, candidate);

      await expect(reopen()).resolves.toMatchObject({
        documentId: candidate.documentId,
        mode: "shared",
        frozen: false,
      });
      expect(localLog.list()).toEqual([]);
      expect(localLog.get(key, null)).toBeNull();
      expect(local.activeSession(localId)).toBeUndefined();
      const shared = sharedLog.load(candidate.documentId);
      try {
        expect(shared.doc.getMap("meta").get("baselineId")).toBe(candidate.baselineId);
        expect(readNodeDocument(shared.doc).content).toEqual(committed.content);
      } finally {
        shared.doc.destroy();
      }
      await expect(handler("collaboration:create-content")(event, 7)).resolves.toMatchObject({
        documentId: candidate.documentId,
      });
      expect(server.store.db.prepare("SELECT id FROM documents").all()).toEqual([
        { id: candidate.documentId },
      ]);
      expect(ContentDocumentTable.read(db, 7)).toEqual(committed);
    }
  );

  it("未知关闭重开协作日志后拒绝共享增量，取得原修订回执后接回本机", async () => {
    const original = await setup();
    const { runtime, event, db, server, owner, store, localId } = original;
    const { documentId } = await runtime.createContent(event, 7);
    const session = runtime.content.sessions.get(documentId)!;
    const before = ContentDocumentTable.read(db, 7)!;
    const epoch = Number(session.doc.getMap("meta").get("epoch"));
    await runtime.prepareLeave(session);
    session.info.leaving = true;
    store.metadata(session.info);
    const request = runtime.client.request.bind(runtime.client);
    const loseClose = vi.spyOn(runtime.client, "request").mockImplementation(async (...args) => {
      const result = await request(...args);
      if (args[1].endsWith("/close")) throw new Error("关闭回执丢失");
      return result;
    });
    await runtime.finishLeave(session);
    loseClose.mockRestore();
    expect(server.store.document(documentId).status).toBe("closed");
    expect(store.get(`close-attempted:${documentId}`, false)).toBe(true);
    expect(store.get(`close-confirmed:${documentId}`, false)).toBe(false);
    const revision = store.get(`close-revision:${documentId}`, "");

    const { shared, local, sharedLog, handler } = await restartHandoffRuntime(original);
    const { BrowserWindow } = await import("electron");
    vi.spyOn(BrowserWindow, "fromWebContents").mockReturnValue({
      id: 1,
      isDestroyed: () => false,
    } as ReturnType<typeof BrowserWindow.fromWebContents>);
    const viewId = "recovering-close-view";
    await expect(handler("collaboration:subscribe")(event, documentId, viewId)).rejects.toThrow(
      "正文会话已失效"
    );
    const { doc: rendered } = sharedLog.load(documentId);
    try {
      const vector = Y.encodeStateVector(rendered);
      rendered.getText("title").insert(0, "关闭中不应接纳的输入");
      const delta = Y.encodeStateAsUpdate(rendered, vector);
      await expect(
        handler("collaboration:update")(event, documentId, delta, viewId)
      ).rejects.toThrow("正文会话已失效");
    } finally {
      rendered.destroy();
    }
    expect(handler("collaboration:state")(event).sessions).toEqual([
      expect.objectContaining({ id: documentId, leaving: true, frozen: true }),
    ]);
    expect(db.prepare("SELECT document_id FROM collaboration_bindings").all()).toEqual([
      { document_id: documentId },
    ]);

    sharedLog.set(`identity:${host.serverUrl}`, JSON.stringify(owner));
    shared["stopped"] = false;
    vi.spyOn(
      shared as unknown as { connectEvents(url: string): Promise<void> },
      "connectEvents"
    ).mockResolvedValue();
    const requests = vi.spyOn(shared.documentClient(), "request");
    await shared.refreshShared();
    expect(requests.mock.calls.filter(([, path]) => path.endsWith("/close"))).toEqual([
      [host.serverUrl, `/v1/documents/${documentId}/close`, "POST", { expectedRevision: revision }],
    ]);
    expect(sharedLog.list().map(({ id }) => id)).toEqual([]);
    expect(db.prepare("SELECT document_id FROM collaboration_bindings").all()).toEqual([]);
    expect(ContentDocumentTable.read(db, 7)).toMatchObject({
      documentId: before.documentId,
      content: before.content,
    });
    await expect(local.open(event, { contentId: 7 })).resolves.toMatchObject({
      documentId: localId,
      mode: "local",
      frozen: false,
    });
    expect(local.getSession(localId).doc.getMap("meta").get("epoch")).toBe(epoch + 1);
    expect(local.getSession(localId).doc.getText("title").toString()).not.toContain("不应接纳");
  });
});

it.each([false, true])("主库解绑已提交而本机安装中断后恢复（有更新的冷写=%s）", async coldWrite => {
  const original = await setup();
  const { runtime, local, localStore, localSessions, localId, db, server, event } = original;
  const localBefore = localSessions.get(localId)!;
  const stale = new Y.Doc({ gc: false });
  Y.applyUpdate(stale, Y.encodeStateAsUpdate(localBefore.doc));
  const staleInfo = structuredClone(localBefore.info);
  const initialIdentity = ContentDocumentTable.read(db, 7)!.documentId;
  const { documentId } = await runtime.createContent(event, 7);
  // 旧版本可能保留同一个本机会话 ID 的冷缓存。
  localStore.create(staleInfo, stale);
  stale.destroy();
  const session = runtime.content.sessions.get(documentId)!;
  const sharedEpoch = session.doc.getMap("meta").get("epoch") as number;
  const room = server.store.loadDocument(documentId);
  const remote = new Y.Doc({ gc: false });
  Y.applyUpdate(remote, Y.encodeStateAsUpdate(room));
  const vector = Y.encodeStateVector(remote);
  const tree = new NodeTree(remote);
  try {
    tree.insertText("paragraph", 0, "共享终稿｜", null);
    await server.store.appendUpdate(
      documentId,
      original.owner.id,
      Y.encodeStateAsUpdate(remote, vector),
      room
    );
  } finally {
    tree.dispose();
    remote.destroy();
    room.destroy();
  }
  await runtime.prepareLeave(session);
  session.info.leaving = true;
  const cut = vi
    .spyOn(local as unknown as Pick<ContentSessionRuntime, "restoreDemotion">, "restoreDemotion")
    .mockImplementationOnce(() => {
      throw new Error("模拟主库提交后中断");
    });
  const closeRequests = vi.spyOn(runtime.client, "request");
  await runtime.finishLeave(session);
  expect(cut).toHaveBeenCalledTimes(1);
  expect(session.info.error).toContain("模拟主库提交后中断");
  expect(server.store.document(documentId).status).toBe("closed");
  expect(db.prepare("SELECT document_id FROM collaboration_bindings").get()).toBeUndefined();
  expect(localStore.list()).toEqual([]);
  const planKey = `demoting:${localId}`;
  const staged = localStore.get<{ baselineId: string; epoch: number } | null>(planKey, null);
  expect(staged).toMatchObject({ baselineId: expect.any(String), epoch: sharedEpoch + 1 });
  expect(original.store.get("generation:library:7", 0)).toBe(1);

  if (coldWrite) {
    const current = ContentDocumentTable.read(db, 7)!;
    ContentDocumentTable.commit(
      db,
      7,
      {
        ...current,
        content: [{ ...current.content[0], children: [{ text: "更新的冷写" }] }],
      },
      { expectedRevision: current.revision, count: 5 }
    );
  }
  const restarted = await restartHandoffRuntime(original, async localFirst => {
    await expect(localFirst.open(event, { contentId: 7 })).resolves.toMatchObject({
      documentId: localId,
      mode: "local",
      frozen: false,
    });
  });
  const restored = restarted.local.getSession(localId);
  expect(contentSession(db, 7)).toBe(restored);
  expect(JSON.stringify(readNodeDocument(restored.doc).content)).toContain(
    coldWrite ? "更新的冷写" : "共享终稿｜正文"
  );
  if (!coldWrite) {
    expect(restored.doc.getMap("meta").get("baselineId")).toBe(staged?.baselineId);
    expect(restored.doc.getMap("meta").get("epoch")).toBe(sharedEpoch + 1);
  }
  expect(restarted.localLog.get(planKey, null)).toBeNull();
  expect(restarted.local.getSession(localId)).toBe(restored);
  expect(ContentDocumentTable.read(db, 7)!.documentId).toBe(initialIdentity);
  expect(db.prepare("SELECT ref_count FROM contents WHERE id=7").get()).toEqual({ ref_count: 1 });

  restarted.sharedLog.set(`identity:${host.serverUrl}`, JSON.stringify(original.owner));
  restarted.shared["stopped"] = false;
  vi.spyOn(
    restarted.shared as unknown as { connectEvents(url: string): Promise<void> },
    "connectEvents"
  ).mockResolvedValue();
  await restarted.shared.refreshShared();
  expect(restarted.sharedLog.list()).toEqual([]);
  expect(restarted.sharedLog.get(`close-generation:${documentId}`, false)).toBe(false);
  expect(restarted.sharedLog.get("generation:library:7", 0)).toBe(1);
  expect(closeRequests.mock.calls.filter(([, path]) => path.endsWith("/close"))).toHaveLength(1);
});

it("解绑事务回滚保留绑定，重试同一关闭结果不重复推进发布代次", async () => {
  const { runtime, localStore, localId, db, event, store } = await setup();
  const { documentId } = await runtime.createContent(event, 7);
  const session = runtime.content.sessions.get(documentId)!;
  await runtime.prepareLeave(session);
  session.info.leaving = true;
  db.exec(`CREATE TRIGGER reject_unbind BEFORE DELETE ON collaboration_bindings
    BEGIN SELECT RAISE(ABORT, '解绑事务故障'); END;`);
  const closeRequests = vi.spyOn(runtime.client, "request");
  await runtime.finishLeave(session);
  expect(session.info.error).toContain("解绑事务故障");
  expect(db.prepare("SELECT document_id FROM collaboration_bindings").get()).toEqual({
    document_id: documentId,
  });
  expect(localStore.list()).toEqual([]);
  expect(localStore.get(`demoting:${localId}`, null)).not.toBeNull();
  expect(store.get("generation:library:7", 0)).toBe(1);
  db.exec("DROP TRIGGER reject_unbind");
  await runtime.finishLeave(session);
  expect(db.prepare("SELECT document_id FROM collaboration_bindings").get()).toBeUndefined();
  expect(localStore.list()).toMatchObject([{ id: localId, mode: "local" }]);
  expect(localStore.get(`demoting:${localId}`, null)).toBeNull();
  expect(store.get("generation:library:7", 0)).toBe(1);
  expect(closeRequests.mock.calls.filter(([, path]) => path.endsWith("/close"))).toHaveLength(1);
});
