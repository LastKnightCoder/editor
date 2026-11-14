// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import {
  createNodeDocument,
  NodeTree,
  bytesToBase64,
  base64ToBytes,
  readNodeDocument,
  DEFAULT_COLLABORATION_URL,
  type SharedDocumentInfo,
  type SharedDocumentListing,
} from "@tau/collaboration";
import { prepareContentContract } from "@tau/db-schema/content-contracts";
import { collaborationManager, type RuntimeSession } from "../core/manager";
import type { CachedContentSession } from "../../../services/tauri";
import { useCollaborationStore } from "../core/store";
const io = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
  remote: vi.fn(),
  protocol: vi.fn(),
  project: vi.fn(),
  adopt: vi.fn(),
  draft: vi.fn(),
  discard: vi.fn(),
  resource: vi.fn(),
  upload: vi.fn(),
  close: vi.fn(),
  assets: vi.fn(),
  leave: vi.fn(),
  list: vi.fn(async (): Promise<{ documents: SharedDocumentListing[] }> => ({ documents: [] })),
  recovery: vi.fn(),
  records: new Map<string, CachedContentSession>(),
  unbind: vi.fn(),
}));
vi.mock("../../../services/tauri", () => ({
  collabInputDraft: io.draft,
  collabAdoptCache: io.adopt,
  collabReadCache: io.read,
  collabDiscardCache: io.discard,
  collabWriteCache: io.write,
  collabProjectContent: io.project,
  collabNodeViews: async () => ({}),
  collabResource: io.resource,
  uploadResource: io.upload,
  collabListBindings: async () => [],
  collabRecovery: io.recovery,
  collabListCache: async () => [...io.records.values()],
  collabUnbindContent: io.unbind,
}));
vi.mock("../core/rest", () => ({
  getDocumentState: io.remote,
  getDocumentProtocol: io.protocol,
  listAssets: io.assets,
  closeDocument: io.close,
  leaveDocument: io.leave,
  listDocuments: io.list,
  listJoinRequests: async () => ({ requests: [] }),
}));
const manager = collaborationManager as unknown as {
  stopped: boolean;
  sessions: Map<string, RuntimeSession>;
  rooms: Map<string, SharedDocumentListing>;
  transports: Map<string, HocuspocusProviderWebsocket>;
  attach(session: RuntimeSession): void;
  createSession(info: SharedDocumentInfo): Promise<RuntimeSession>;
  openSession(info: SharedDocumentInfo): Promise<RuntimeSession>;
  processResources(session: RuntimeSession): Promise<void>;
  startPolling(): void;
  resourceTimer: ReturnType<typeof setInterval> | null;
  refreshTimer: ReturnType<typeof setInterval> | null;
  connectEvents(url: string): Promise<void>;
};
afterEach(async () => {
  if (manager.resourceTimer) clearInterval(manager.resourceTimer);
  if (manager.refreshTimer) clearInterval(manager.refreshTimer);
  manager.resourceTimer = manager.refreshTimer = null;
  vi.useRealTimers();
  for (const session of manager.sessions.values()) {
    await session.resourceTask?.catch(() => {});
    await session.writeTail.catch(() => {});
    session.detachDocListener?.();
    session.releaseResourceSource?.();
    session.awareness.destroy();
    session.doc.destroy();
  }
  manager.sessions.clear();
  manager.rooms.clear();
  Object.assign(manager, { serverUrl: DEFAULT_COLLABORATION_URL });
  io.records.clear();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

it("目录只列出正文元数据，打开目标时才下载快照，撤权后移出目录", async () => {
  const { doc, info } = await fixture();
  doc.destroy();
  const room: SharedDocumentListing = { ...info, kind: "content", protocolVersion: 2 };
  io.list.mockResolvedValueOnce({
    documents: [
      room,
      {
        ...room,
        id: "board",
        kind: "whiteboard",
        protocolVersion: 3,
      },
    ],
  });
  await collaborationManager.refresh();
  expect(io.remote).not.toHaveBeenCalled();
  expect(useCollaborationStore.getState().sessions).toMatchObject([
    { id: room.id, connection: "idle" },
  ]);
  await Promise.all([
    collaborationManager.openDocument(room.id),
    collaborationManager.openDocument(room.id),
  ]);
  expect(io.remote).toHaveBeenCalledExactlyOnceWith(DEFAULT_COLLABORATION_URL, room.id);
  expect(manager.sessions.has(room.id)).toBe(true);
  await collaborationManager.refresh();
  expect(useCollaborationStore.getState().sessions).toEqual([]);
});
async function fixture() {
  manager.stopped = false;
  vi.spyOn(manager, "attach").mockImplementation(() => {});
  vi.spyOn(manager, "connectEvents").mockResolvedValue();
  const contract = await prepareContentContract("tau.paragraph", {
    type: "paragraph",
    dataVersion: 1,
    kind: "block",
  });
  const content = {
    title: "文档",
    bannerBg: "",
    bannerPosition: "center",
    content: [
      { type: "paragraph", collabId: "p", tauContract: contract.id, children: [{ text: "原文" }] },
    ],
  };
  const doc = await createNodeDocument(
    { documentId: "doc", baselineId: "base", epoch: 0 },
    content,
    { [contract.id]: contract.contract }
  );
  const info: CachedContentSession = {
    id: "doc",
    title: "文档",
    ownerId: "author",
    role: "owner",
    status: "active",
    members: [],
    updatedAt: 1,
    serverUrl: DEFAULT_COLLABORATION_URL,
    connection: "offline",
    pending: true,
    leaving: false,
    baselineId: "base",
    epoch: 0,
    source: {
      databaseName: "library",
      contentId: 7,
      contentCreatedAt: 1,
      librarySourceId: "source",
      contentDocumentId: "body",
      projectionRevision: "observed",
    },
  };
  const state = bytesToBase64(Y.encodeStateAsUpdate(doc));
  io.remote.mockResolvedValue({ state });
  io.write.mockImplementation(async payload => {
    if (!io.records.get(payload.documentId)?.close)
      io.records.set(payload.documentId, structuredClone(payload.metadata));
    return "new-cache-revision";
  });
  io.recovery.mockImplementation(async (id: string, action = "read") => {
    const record = io.records.get(id);
    if (!record) return null;
    if (action === "confirm-close") {
      record.close!.confirmed = true;
      record.status = "closed";
    } else if (action === "clear-close") {
      delete record.close;
      record.leaving = false;
    } else if (action === "release") io.records.delete(id);
    return structuredClone(record);
  });
  io.close.mockImplementation(async (_url, _id, revision) => ({ ok: true, revision }));
  io.unbind.mockResolvedValue(undefined);
  io.protocol.mockResolvedValue({ id: "doc", version: 2, baselineId: "base", epoch: 0 });
  io.resource.mockImplementation(async (_context, action: string, references: string[]) => {
    if (action === "pending") return false;
    if (action === "localize")
      return Object.fromEntries(
        references.map(reference => [reference, "https://owner.test/image.webp"])
      );
    if (action === "prepare")
      return Object.fromEntries(references.map(reference => [reference, reference]));
    return undefined;
  });
  io.assets.mockResolvedValue({ ids: [] });
  io.project.mockResolvedValue({ projected: true, revision: "projected" });
  return { doc, content, info, state, contracts: { [contract.id]: contract.contract } };
}

async function imageFixture() {
  const value = await fixture();
  const image = await prepareContentContract("tau.image", {
    type: "image",
    dataVersion: 1,
    kind: "block",
    isVoid: true,
    resources: [{ path: "url", kind: "image", preview: "previewUrl" }],
  });
  const tree = new NodeTree(value.doc);
  const reference = "tau-collab-asset:11111111-1111-4111-8111-111111111111";
  await tree.installContracts({ [image.id]: image.contract }, null);
  tree.insertNode(
    {
      type: "image",
      collabId: "image",
      tauContract: image.id,
      url: reference,
      previewUrl: reference,
      children: [{ text: "" }],
    },
    null,
    1,
    null,
    true
  );
  tree.dispose();
  const state = bytesToBase64(Y.encodeStateAsUpdate(value.doc));
  io.remote.mockResolvedValue({ state });
  io.read.mockResolvedValue({ metadata: value.info, state, updates: [], revision: "cache" });
  return { ...value, reference, state };
}

it.each(["reconnect", "cache-retry"])(
  "%s 保留其他房间的传输、当前文档的 Awareness 与视图订阅",
  async action => {
    const { doc, info, state, content, contracts } = await fixture();
    io.read.mockResolvedValue({ metadata: info, state, updates: [], revision: "cache" });
    const first = await manager.createSession(info);
    const other = await createNodeDocument(
      { documentId: "other", baselineId: "base", epoch: 0 },
      content,
      contracts
    );
    io.read.mockResolvedValue(null);
    io.remote.mockResolvedValue({ state: bytesToBase64(Y.encodeStateAsUpdate(other)) });
    const second = await manager.createSession({ ...info, id: "other" });
    const socket = new HocuspocusProviderWebsocket({
      url: "ws://127.0.0.1:9/ws",
      autoConnect: false,
    });
    vi.spyOn(socket, "connect").mockResolvedValue(undefined);
    vi.mocked(manager.attach).mockRestore();
    manager.transports.set(info.serverUrl, socket);
    manager.attach(first);
    manager.attach(second);
    const provider = first.provider;
    const otherProvider = second.provider;
    const viewChanged = vi.fn();
    first.awareness.on("change", viewChanged);
    const destroyed = vi.spyOn(first.awareness, "destroy");
    const socketDestroyed = vi.spyOn(socket, "destroy");
    try {
      if (action === "reconnect") {
        await collaborationManager.reconnect(info.id);
      } else {
        io.write.mockRejectedValueOnce(new Error("缓存暂时不可写"));
        const tree = new NodeTree(first.doc);
        try {
          tree.insertText("p", 0, "离线", {});
          await expect(first.writeTail).rejects.toThrow("缓存暂时不可写");
          expect(first.provider?.isAttached).toBe(false);
          expect(first.info.frozen).toBe(true);
          io.write.mockResolvedValue("saved");
          await collaborationManager.flushCache(info.id);
        } finally {
          tree.dispose();
        }
      }
      expect(first.provider).toBe(provider);
      expect(second.provider).toBe(otherProvider);
      expect(first.provider?.isAttached).toBe(true);
      expect(second.provider?.isAttached).toBe(true);
      expect(socket.configuration.providerMap.size).toBe(2);
      expect(manager.transports.get(info.serverUrl)).toBe(socket);
      expect(socketDestroyed).not.toHaveBeenCalled();
      expect(destroyed).not.toHaveBeenCalled();
      first.awareness.setLocalStateField("activity", "editing");
      expect(viewChanged).toHaveBeenCalled();
      expect(first.info.frozen).toBe(false);
    } finally {
      first.provider?.destroy();
      second.provider?.destroy();
      socket.destroy();
      manager.transports.clear();
      other.destroy();
      doc.destroy();
    }
  }
);

it("作者新图保留图床地址，成员上传显式走协作通道且不走作者转换", async () => {
  const { doc, info, state } = await fixture();
  io.read.mockResolvedValue({ metadata: info, state, updates: [], revision: "cache" });
  const session = await manager.createSession(info);
  const remote = "https://owner.test/uploaded.webp";
  await expect(collaborationManager.prepareResource("doc", remote)).resolves.toBe(remote);
  expect(io.upload).not.toHaveBeenCalled();
  session.info.role = "editor";
  io.upload.mockResolvedValue("tau-collab-asset:member");
  const file = { name: "member.png", type: "image/png" } as File;
  await expect(collaborationManager.uploadSharedResource("doc", file)).resolves.toBe(
    "tau-collab-asset:member"
  );
  expect(io.upload).toHaveBeenCalledWith(
    expect.objectContaining({
      fileName: "member.png",
      content: file,
      collaboration: { documentId: "doc", serverUrl: session.info.serverUrl },
    })
  );
  await expect(collaborationManager.prepareResource("doc", "~/local.png")).rejects.toThrow(
    "成员图片"
  );
  doc.destroy();
});

it("冷缓存恢复后的作者图片无需正文或原库打开，存储失败后由后台自动重试", async () => {
  const { doc, info, state, reference } = await imageFixture();
  delete info.source;
  io.read.mockResolvedValue({ metadata: info, state, updates: [], revision: "cache" });
  const session = await manager.createSession(info);
  io.resource.mockImplementation(async (_context, action: string, refs: string[]) => {
    if (action === "pending") return false;
    if (action === "localize") throw new Error("作者图床暂不可用");
    return Object.fromEntries(refs.map(ref => [ref, ref]));
  });
  vi.useFakeTimers();
  manager.startPolling();
  await vi.advanceTimersByTimeAsync(2000);
  expect(session.info.error).toContain("作者图床暂不可用");
  expect(session.resourcesDirty).toBe(true);
  expect(io.project).not.toHaveBeenCalled();
  io.resource.mockImplementation(async (_context, action: string, refs: string[]) =>
    action === "localize"
      ? Object.fromEntries(refs.map(ref => [ref, "~/.editor/resources/received.webp"]))
      : undefined
  );
  await vi.advanceTimersByTimeAsync(2000);
  expect(io.resource).toHaveBeenLastCalledWith(
    expect.objectContaining({ documentId: "doc" }),
    "localize",
    [reference]
  );
  expect(session.info.error).toBeUndefined();
  expect(session.resourcesDirty).toBe(false);
  doc.destroy();
});

it("上传期间新入队的图片在恢复正文发送前继续冲刷", async () => {
  const { doc, info, state } = await fixture();
  info.role = "editor";
  delete info.source;
  io.read.mockResolvedValue({ metadata: info, state, updates: [], revision: "cache" });
  const session = await manager.createSession(info);
  const pending = new Set(["A"]);
  let release!: () => void;
  const blocked = new Promise<void>(resolve => {
    release = resolve;
  });
  let flushes = 0;
  const attach = vi.fn();
  session.provider = {
    attach,
    detach: vi.fn(),
    hasUnsyncedChanges: false,
  } as unknown as RuntimeSession["provider"];
  session.assetsPending = true;
  io.resource.mockImplementation(async (_context, action: string) => {
    if (action === "pending") return pending.size > 0;
    if (action === "flush") {
      const batch = [...pending];
      if (++flushes === 1) await blocked;
      batch.forEach(id => pending.delete(id));
    }
  });
  const running = manager.processResources(session);
  await vi.waitFor(() => expect(flushes).toBe(1));
  io.upload.mockImplementationOnce(async () => {
    pending.add("B");
    return "tau-collab-asset:B";
  });
  await collaborationManager.uploadSharedResource("doc", {
    name: "b.png",
    type: "image/png",
  } as File);
  expect(attach).not.toHaveBeenCalled();
  release();
  await running;
  expect(flushes).toBe(2);
  expect(pending.size).toBe(0);
  expect(session.assetsPending).toBe(false);
  expect(attach).toHaveBeenCalledTimes(1);
  doc.destroy();
});

it("服务器资产进入主库前使用作者的持久地址，原共享文档保持资产引用", async () => {
  const { doc, info, reference } = await imageFixture();
  const session = await manager.createSession(info);
  await collaborationManager.project("doc");
  expect(io.project.mock.calls[0][0].content[1]).toMatchObject({
    url: "https://owner.test/image.webp",
    previewUrl: "https://owner.test/image.webp",
  });
  expect(readNodeDocument(session.doc).content[1]).toMatchObject({ url: reference });
  doc.destroy();
});

it("作者图片补存失败不关闭共享，重试后最终正文使用持久地址再关闭", async () => {
  const { doc, info, state } = await imageFixture();
  const session = await manager.createSession(info);
  session.provider = {
    synced: true,
    hasUnsyncedChanges: false,
    attach: vi.fn(),
    detach: vi.fn(),
    destroy: vi.fn(),
  } as unknown as RuntimeSession["provider"];
  const revision = await setFinalSnapshot(state);
  io.assets.mockResolvedValue({ ids: ["11111111-1111-4111-8111-111111111111"] });
  io.resource.mockRejectedValueOnce(new Error("作者图床失败"));
  await expect(collaborationManager.leave("doc")).rejects.toThrow("作者图床失败");
  expect(io.close).not.toHaveBeenCalled();
  expect(session.info.leaving).toBe(false);
  await collaborationManager.leave("doc");
  expect(io.project.mock.calls[0][0].content[1]).toMatchObject({
    url: "https://owner.test/image.webp",
  });
  expect(io.close).toHaveBeenCalledWith(session.info.serverUrl, "doc", revision);
  expect(io.protocol).not.toHaveBeenCalled();
  expect(io.project.mock.invocationCallOrder[0]).toBeLessThan(io.close.mock.invocationCallOrder[0]);
  session.awareness.destroy();
  session.doc.destroy();
  doc.destroy();
});

async function setFinalSnapshot(state: string) {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(base64ToBytes(state)));
  const revision = [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
  io.remote.mockResolvedValue({
    state,
    protocol: { id: "doc", version: 2, baselineId: "base", epoch: 0, revision, sequence: 0 },
  });
  return revision;
}
function syncedProvider(session: RuntimeSession) {
  session.provider = {
    synced: true,
    hasUnsyncedChanges: false,
    attach: vi.fn(() => {
      if (session.provider) session.provider.synced = true;
    }),
    detach: vi.fn(),
    destroy: vi.fn(),
  } as unknown as RuntimeSession["provider"];
}

it("结束共享等待旧投影，禁止定时器插队，并在最终远端快照落库后才关闭", async () => {
  const { doc, info, state } = await imageFixture();
  const session = await manager.createSession(info);
  syncedProvider(session);
  let release!: () => void;
  const delayed = new Promise<void>(resolve => {
    release = resolve;
  });
  let main = "";
  io.project
    .mockImplementationOnce(async payload => {
      await delayed;
      main = JSON.stringify(payload.content);
      return { projected: true, revision: "old-projection" };
    })
    .mockImplementation(async payload => {
      main = JSON.stringify(payload.content);
      return { projected: true, revision: "final-projection" };
    });
  const old = collaborationManager.project("doc");
  await vi.waitFor(() => expect(io.project).toHaveBeenCalledTimes(1));
  const remote = new Y.Doc({ gc: false });
  Y.applyUpdate(remote, base64ToBytes(state));
  const tree = new NodeTree(remote);
  tree.insertText("p", 2, "最终远端输入", {});
  tree.dispose();
  const final = bytesToBase64(Y.encodeStateAsUpdate(remote));
  const revision = await setFinalSnapshot(final);
  io.close.mockImplementation(async (_url, _id, expected) => {
    expect(main).toContain("最终远端输入");
    expect(main).toContain("https://owner.test/image.webp");
    return { ok: true, revision: expected };
  });
  const closing = collaborationManager.leave("doc");
  await vi.waitFor(() => expect(session.info.leaving).toBe(true));
  await collaborationManager.project("doc");
  expect(io.project).toHaveBeenCalledTimes(1);
  expect(io.close).not.toHaveBeenCalled();
  release();
  await old;
  await closing;
  expect(io.project).toHaveBeenCalledTimes(2);
  expect(io.close).toHaveBeenCalledWith(session.info.serverUrl, "doc", revision);
  session.awareness.destroy();
  session.doc.destroy();
  remote.destroy();
  doc.destroy();
});

it.each(["response", "receipt-storage", "receipt-ack", "cleanup", "cleanup-ack"])(
  "关闭结果未知或收尾失败保持只读，重启且缓存丢失后按耐久记录继续：%s",
  async failureAt => {
    const { doc, info, state } = await fixture();
    io.read.mockResolvedValue({ metadata: info, state, updates: [], revision: "cache" });
    const session = await manager.createSession(info);
    syncedProvider(session);
    const revision = await setFinalSnapshot(state);
    if (failureAt === "response") io.close.mockRejectedValueOnce(new Error("关闭已执行但响应丢失"));
    if (failureAt === "cleanup") io.unbind.mockRejectedValueOnce(new Error("请切回原资料库"));
    if (["receipt-storage", "receipt-ack", "cleanup-ack"].includes(failureAt)) {
      const recover = io.recovery.getMockImplementation()!;
      let fail = true;
      io.recovery.mockImplementation(async (id, action) => {
        if (action === (failureAt === "cleanup-ack" ? "release" : "confirm-close") && fail) {
          fail = false;
          if (failureAt !== "receipt-storage") await recover(id, action);
          throw new Error("回执确认失败");
        }
        return recover(id, action);
      });
    }
    await expect(collaborationManager.leave("doc")).rejects.toThrow();
    expect(session.info.leaving).toBe(true);
    if (failureAt !== "cleanup-ack") {
      expect(io.records.get("doc")?.close?.revision).toBe(revision);
      expect(io.resource.mock.calls.some(call => call[1] === "release")).toBe(false);
    }
    await expect(
      collaborationManager.uploadSharedResource("doc", { name: "x.mp4", type: "video/mp4" } as File)
    ).rejects.toThrow("会话已变化");
    if (failureAt !== "cleanup-ack") {
      session.detachDocListener?.();
      session.releaseResourceSource?.();
      manager.sessions.delete("doc");
      session.awareness.destroy();
      session.doc.destroy();
    }
    io.read.mockResolvedValue(null);
    if (failureAt === "response") Object.assign(manager, { serverUrl: "https://new-default.test" });
    io.remote.mockClear();
    io.project.mockClear();
    await collaborationManager.refresh();
    expect(io.close).toHaveBeenCalledTimes(
      ["cleanup", "receipt-ack", "cleanup-ack"].includes(failureAt) ? 1 : 2
    );
    expect(io.close).toHaveBeenLastCalledWith(session.info.serverUrl, "doc", revision);
    expect(io.remote).not.toHaveBeenCalled();
    expect(io.project).not.toHaveBeenCalled();
    expect(io.unbind).toHaveBeenLastCalledWith(7, { documentId: "doc", sourceId: "source" });
    expect(io.records.has("doc")).toBe(false);
    if (failureAt === "cleanup-ack") {
      session.awareness.destroy();
      session.doc.destroy();
    }
    doc.destroy();
  }
);

it("原生层丢弃损坏缓存后，从独立恢复记录还原来源与观察修订", async () => {
  const { doc, info } = await fixture();
  io.records.set("doc", structuredClone(info));
  io.read.mockResolvedValue(null);
  const { source: _source, ...remoteInfo } = info;
  const session = await manager.createSession(remoteInfo);
  expect(session.info.source).toEqual(info.source);
  await collaborationManager.project("doc");
  expect(io.project).toHaveBeenCalledWith(
    expect.objectContaining({
      expectedSourceId: "source",
      expectedDocumentId: "body",
      expectedRevision: "observed",
    })
  );
  doc.destroy();
});

it("旧投影与后台补存重叠后，保留下一轮投影并写入最新正文", async () => {
  const { doc, info, state } = await fixture();
  io.read.mockResolvedValue({ metadata: info, state, updates: [], revision: "cache" });
  const session = await manager.createSession(info);
  let release!: () => void;
  const blocked = new Promise<void>(resolve => {
    release = resolve;
  });
  let main = "";
  io.project
    .mockImplementationOnce(async payload => {
      await blocked;
      main = JSON.stringify(payload.content);
      return { projected: true, revision: "older" };
    })
    .mockImplementation(async payload => {
      main = JSON.stringify(payload.content);
      return { projected: true, revision: "latest" };
    });
  const first = collaborationManager.project("doc");
  await vi.waitFor(() => expect(io.project).toHaveBeenCalledTimes(1));
  const tree = new NodeTree(session.doc);
  tree.insertText("p", 2, "新输入", {});
  tree.dispose();
  const background = manager.processResources(session);
  await vi.waitFor(() => expect(session.resourcesDirty).toBe(true));
  release();
  await first;
  await background;
  expect(session.resourcesDirty).toBe(true);
  await manager.processResources(session);
  expect(main).toContain("新输入");
  doc.destroy();
});

it("只有确认房间仍活动的修订冲突才解除关闭标记，下一次重新保全", async () => {
  const { doc, info, state } = await fixture();
  io.read.mockResolvedValue({ metadata: info, state, updates: [], revision: "cache" });
  const session = await manager.createSession(info);
  syncedProvider(session);
  await setFinalSnapshot(state);
  io.close.mockRejectedValueOnce(
    Object.assign(new Error("正文已变化"), { code: "REVISION_CONFLICT" })
  );
  await expect(collaborationManager.leave("doc")).rejects.toThrow("正文已变化");
  expect(session.info.leaving).toBe(false);
  expect(session.close).toBeUndefined();
  expect(io.recovery).toHaveBeenCalledWith("doc", "clear-close");
  expect(io.protocol).toHaveBeenCalledTimes(1);
  await collaborationManager.leave("doc");
  expect(io.close).toHaveBeenCalledTimes(2);
  session.awareness.destroy();
  session.doc.destroy();
  doc.destroy();
});
it("重启合入同一真实基线，未确认的本机输入不会被服务器旧快照覆盖", async () => {
  const { doc, info, state } = await fixture();
  const before = Y.encodeStateVector(doc),
    tree = new NodeTree(doc);
  tree.insertText("p", 2, "本机输入", {});
  io.read.mockResolvedValue({
    metadata: info,
    state,
    updates: [bytesToBase64(Y.encodeStateAsUpdate(doc, before))],
    revision: "cache-revision",
  });
  const session = await manager.createSession(info);
  expect(JSON.stringify(new NodeTree(session.doc).read())).toContain("原文本机输入");
  const saved = io.write.mock.calls[0][0];
  expect(saved.expectedRevision).toBe("cache-revision");
  const restored = new Y.Doc();
  Y.applyUpdate(restored, base64ToBytes(saved.state));
  expect(JSON.stringify(new NodeTree(restored).read())).toContain("本机输入");
  restored.destroy();
  tree.dispose();
  doc.destroy();
});

it("读不出的旧协议缓存备份后按服务器内容重建，不阻断打开", async () => {
  const { info } = await fixture();
  const old = new Y.Doc();
  old.getMap("meta").set("version", 1);
  old.get("content", Y.XmlText).insert(0, "未确认的旧输入");
  const state = bytesToBase64(Y.encodeStateAsUpdate(old));
  old.destroy();
  io.read.mockResolvedValue({
    metadata: info,
    state,
    updates: [],
    revision: "old-cache",
    inputDrafts: [],
  });
  const session = await manager.createSession(info);
  expect(io.discard).toHaveBeenCalledWith("doc", expect.any(String));
  expect(JSON.stringify(new NodeTree(session.doc).read())).toContain("原文");
  expect(session.info).toMatchObject({ frozen: false, remoteVersionAvailable: false });
  expect(io.write.mock.calls[0][0].expectedRevision).toBeUndefined();
  expect(io.adopt).not.toHaveBeenCalled();
});
it("远端换代时备份旧缓存并按新基线重建，保持静默不提示", async () => {
  const { doc, info, state, content, contracts } = await fixture();
  io.read.mockResolvedValue({
    metadata: info,
    state,
    updates: [],
    revision: "cache-revision",
    inputDrafts: [],
  });
  const remote = await createNodeDocument(
    { documentId: "doc", baselineId: "new-base", epoch: 1 },
    content,
    contracts
  );
  io.remote.mockResolvedValue({ state: bytesToBase64(Y.encodeStateAsUpdate(remote)) });
  const { useCollaborationStore } = await import("../core/store");
  useCollaborationStore.setState({ notices: [] });
  const session = await manager.createSession(info);
  expect(io.discard).toHaveBeenCalledWith("doc", "协作端基线已变化");
  expect(session.info).toMatchObject({ frozen: false, remoteVersionAvailable: false });
  expect(session.doc.getMap("meta").get("baselineId")).toBe("new-base");
  expect(session.info.source?.contentId).toBe(7);
  expect(useCollaborationStore.getState().notices).toEqual([]);
  remote.destroy();
  doc.destroy();
});
it("投影只携带缓存观察到的修订，成功后耐久保存新的观察值", async () => {
  const { doc, info, state } = await fixture();
  io.read.mockResolvedValue({ metadata: info, state, updates: [], revision: "cache-revision" });
  const session = await manager.createSession(info);
  io.project.mockResolvedValue({ projected: true, revision: "written" });
  await collaborationManager.project("doc");
  expect(io.project.mock.calls[0][0]).toMatchObject({
    expectedRevision: "observed",
    expectedDocumentId: "body",
    expectedSourceId: "source",
  });
  expect(session.info.source?.projectionRevision).toBe("written");
  expect(io.write.mock.calls.at(-1)?.[0].metadata.source.projectionRevision).toBe("written");
  doc.destroy();
});

it("源码草稿随实际增量确认，保存失败不清理未确认输入", async () => {
  const { doc, info } = await fixture();
  const contract = await prepareContentContract("example", {
    type: "example.source",
    dataVersion: 1,
    kind: "block",
    isVoid: true,
    collaboration: { textFields: ["code"] },
  });
  const original = new NodeTree(doc);
  await original.installContracts({ [contract.id]: contract.contract }, null);
  original.insertNode(
    {
      type: "example.source",
      collabId: "source",
      tauContract: contract.id,
      code: "A",
      children: [{ text: "" }],
    },
    null,
    1,
    null,
    true
  );
  const state = bytesToBase64(Y.encodeStateAsUpdate(doc));
  io.read.mockResolvedValue({ metadata: info, state, updates: [], revision: "cache-revision" });
  io.remote.mockResolvedValue({ state });
  io.draft.mockResolvedValue(undefined);
  const session = await manager.createSession(info),
    tree = new NodeTree(session.doc);
  const draft = {
    viewId: "view",
    nodeId: "source",
    field: "code",
    value: "AB",
    revision: "r1",
    sequence: 1,
  };
  try {
    await collaborationManager.preserveInputDraft("doc", draft);
    tree.textField("source", "code").insert(1, "B");
    await collaborationManager.flushCache("doc");
    expect(io.write.mock.calls.at(-1)?.[0].confirmedDrafts).toEqual([draft]);
    expect(session.inputDrafts.size).toBe(0);
    const next = { ...draft, value: "ABC", sequence: 2, revision: "r2" };
    await collaborationManager.preserveInputDraft("doc", next);
    io.write.mockRejectedValueOnce(new Error("磁盘写入失败"));
    tree.textField("source", "code").insert(2, "C");
    await expect(collaborationManager.flushCache("doc")).rejects.toThrow("磁盘写入失败");
    expect([...session.inputDrafts.values()]).toEqual([next]);
  } finally {
    tree.dispose();
    original.dispose();
    doc.destroy();
  }
});

it("写盘失败后重试保留祖先和后继，成功才解除保存冻结", async () => {
  const { doc, info, state } = await fixture();
  io.read.mockResolvedValue({ metadata: info, state, updates: [], revision: "cache" });
  const session = await manager.createSession(info),
    tree = new NodeTree(session.doc);
  const writes: string[] = [];
  io.write.mockRejectedValueOnce(new Error("磁盘暂不可写"));
  tree.insertText("p", 2, "甲", {});
  await expect(collaborationManager.flushCache("doc")).rejects.toThrow("磁盘暂不可写");
  expect(session.info.frozen).toBe(true);
  io.write.mockImplementation(async payload => {
    writes.push(payload.state);
    return "saved";
  });
  tree.insertText("p", 3, "乙", {});
  await collaborationManager.flushCache("doc");
  const restored = new Y.Doc();
  Y.applyUpdate(restored, base64ToBytes(state));
  writes.filter(Boolean).forEach(bytes => Y.applyUpdate(restored, base64ToBytes(bytes)));
  expect(restored.store.pendingStructs).toBeNull();
  expect(JSON.stringify(new NodeTree(restored).read())).toContain("原文甲乙");
  expect(session.pendingUpdates).toEqual([]);
  expect(session.info.frozen).toBe(false);
  expect(manager.attach).toHaveBeenCalledTimes(2);
  restored.destroy();
  tree.dispose();
  doc.destroy();
});

it("草稿保存失败后可显式冲刷重试，不跳过原草稿", async () => {
  const { doc, info, state } = await fixture();
  io.read.mockResolvedValue({ metadata: info, state, updates: [], revision: "cache" });
  const session = await manager.createSession(info);
  const draft = {
    viewId: "v",
    nodeId: "missing",
    field: "code",
    value: "未提交输入",
    revision: "r",
    sequence: 1,
  };
  io.draft.mockRejectedValueOnce(new Error("草稿写入失败"));
  await expect(collaborationManager.preserveInputDraft("doc", draft)).rejects.toThrow(
    "草稿写入失败"
  );
  io.draft.mockResolvedValue(undefined);
  await collaborationManager.flushCache("doc");
  expect(io.draft.mock.calls.at(-1)?.[0]).toMatchObject(draft);
  expect([...session.inputDrafts.values()]).toEqual([draft]);
  expect(session.info.frozen).toBe(false);
  doc.destroy();
});

it.each(["refresh", "reconnect"])(
  "活跃会话经 %s 检出换代，备份本机输入后按新基线重建，不再冻结",
  async trigger => {
    const { doc, info, state, content, contracts } = await fixture();
    io.read.mockResolvedValue({
      metadata: info,
      state,
      updates: [],
      revision: "cache",
      inputDrafts: [],
    });
    const session = await manager.createSession(info),
      tree = new NodeTree(session.doc);
    tree.insertText("p", 2, "离线输入", {});
    await collaborationManager.flushCache("doc");
    const remote = await createNodeDocument(
      { documentId: "doc", baselineId: "next", epoch: 1 },
      content,
      contracts
    );
    io.remote.mockResolvedValue({ state: bytesToBase64(Y.encodeStateAsUpdate(remote)) });
    io.protocol.mockResolvedValue({ id: "doc", version: 2, baselineId: "next", epoch: 1 });
    io.read.mockResolvedValueOnce({
      metadata: { ...info, pending: true },
      state,
      updates: [],
      revision: "cache",
      inputDrafts: [],
    });
    io.read.mockResolvedValue(null);
    if (trigger === "refresh") await manager.openSession(info);
    else await collaborationManager.reconnect("doc");
    expect(io.discard).toHaveBeenCalledWith("doc", "协作端基线已变化");
    const next = manager.sessions.get("doc")!;
    expect(next).not.toBe(session);
    expect(next.info).toMatchObject({ frozen: false, remoteVersionAvailable: false });
    expect(next.doc.getMap("meta").get("baselineId")).toBe("next");
    expect(next.info.source?.contentId).toBe(7);
    expect(session.provider).toBeNull();
    tree.dispose();
    remote.destroy();
    doc.destroy();
  }
);

it("同代次摘要刷新不下载正文，协议请求失败后可以重试", async () => {
  const { doc, info, state } = await fixture();
  io.read.mockResolvedValue({ metadata: info, state, updates: [], revision: "cache" });
  const session = await manager.createSession(info);
  io.remote.mockClear();
  await manager.openSession(info);
  expect(io.remote).not.toHaveBeenCalled();
  expect(session.info.frozen).toBe(false);
  io.protocol.mockRejectedValueOnce(new Error("offline"));
  await expect(collaborationManager.reconnect("doc")).resolves.toBeUndefined();
  expect(session.info.connection).toBe("error");
  await collaborationManager.reconnect("doc");
  expect(session.info.connection).toBe("connecting");
  doc.destroy();
});

it("插件条件写入等待旧投影结束后再次投影，并携带固定工作区来源", async () => {
  const { doc, info, state } = await fixture();
  io.read.mockResolvedValue({ metadata: info, state, updates: [], revision: "cache-revision" });
  await manager.createSession(info);
  let finish!: (value: unknown) => void;
  io.project
    .mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    )
    .mockResolvedValue({ projected: true, revision: "plugin-written" });
  const previous = collaborationManager.project("doc");
  await vi.waitFor(() => expect(io.project).toHaveBeenCalledTimes(1));
  const plugin = { pluginId: "example", token: "scope", database: "one.db" };
  const pending = collaborationManager.project("doc", plugin);
  finish({ projected: true, revision: "previous-written" });
  try {
    await Promise.all([previous, pending]);
    expect(io.project).toHaveBeenCalledTimes(2);
    expect(io.project.mock.calls[1][0]).toMatchObject({
      plugin,
      expectedRevision: "previous-written",
    });
  } finally {
    doc.destroy();
  }
});

it("插件组件投影在缓存落盘等待后重新核验访问，不把撤权结果写回主库", async () => {
  const { doc, info, state } = await fixture();
  io.read.mockResolvedValue({ metadata: info, state, updates: [], revision: "cache-revision" });
  await manager.createSession(info);
  let finish!: () => void;
  const flush = vi.spyOn(collaborationManager, "flushCache").mockImplementationOnce(
    () =>
      new Promise<void>(resolve => {
        finish = resolve;
      })
  );
  let allowed = true;
  const pending = collaborationManager.project(
    "doc",
    { pluginId: "example", token: "scope", database: "one.db" },
    async () => {
      if (!allowed) throw new Error("访问已撤回");
    }
  );
  const rejected = expect(pending).rejects.toThrow("访问已撤回");
  await vi.waitFor(() => expect(flush).toHaveBeenCalled());
  allowed = false;
  finish();
  try {
    await rejected;
    expect(io.project).not.toHaveBeenCalled();
  } finally {
    doc.destroy();
  }
});
