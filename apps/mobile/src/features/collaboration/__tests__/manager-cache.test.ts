// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import * as Y from "yjs";
import {
  createNodeDocument,
  NodeTree,
  bytesToBase64,
  base64ToBytes,
  type SharedDocumentInfo,
} from "@tau/collaboration";
import { prepareContentContract } from "@tau/db-schema/content-contracts";
import { collaborationManager, type RuntimeSession } from "../core/manager";
import type { CachedContentSession } from "../../../services/tauri";
const io = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
  remote: vi.fn(),
  protocol: vi.fn(),
  project: vi.fn(),
  adopt: vi.fn(),
  draft: vi.fn(),
  discard: vi.fn(),
}));
vi.mock("../../../services/tauri", () => ({
  collabInputDraft: io.draft,
  collabAdoptCache: io.adopt,
  collabReadCache: io.read,
  collabDiscardCache: io.discard,
  collabWriteCache: io.write,
  collabProjectContent: io.project,
  collabNodeViews: async () => ({}),
}));
vi.mock("../core/rest", () => ({ getDocumentState: io.remote, getDocumentProtocol: io.protocol }));
const manager = collaborationManager as unknown as {
  stopped: boolean;
  sessions: Map<string, RuntimeSession>;
  attach(session: RuntimeSession): void;
  createSession(info: SharedDocumentInfo): Promise<RuntimeSession>;
  openSession(info: SharedDocumentInfo): Promise<RuntimeSession>;
};
afterEach(() => {
  for (const session of manager.sessions.values()) {
    session.detachDocListener?.();
    session.awareness.destroy();
    session.doc.destroy();
  }
  manager.sessions.clear();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
async function fixture() {
  manager.stopped = false;
  vi.spyOn(manager, "attach").mockImplementation(() => {});
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
    serverUrl: "https://test",
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
  io.write.mockResolvedValue("new-cache-revision");
  io.protocol.mockResolvedValue({ id: "doc", version: 2, baselineId: "base", epoch: 0 });
  return { doc, content, info, state, contracts: { [contract.id]: contract.contract } };
}
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
it("远端换代时备份旧缓存并按新基线重建，有未同步改动时给出提示", async () => {
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
  expect(useCollaborationStore.getState().notices.map(notice => notice.kind)).toEqual(["rebuilt"]);
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
