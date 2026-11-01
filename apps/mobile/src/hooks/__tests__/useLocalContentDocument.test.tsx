import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Descendant } from "slate";
import { afterEach, expect, it, vi } from "vitest";
import * as Y from "yjs";
import {
  NodeTree,
  base64ToBytes,
  bytesToBase64,
  createNodeDocument,
  type ContentNode,
} from "@tau/collaboration";
import { prepareContentContract } from "@tau/db-schema/content-contracts";
import { IResourceService, type ResourceService } from "@tau/shared/host-services";
import type { ContentDetailResponse } from "../../types";
import useLocalContentDocument, { type LocalContentDocument } from "../useLocalContentDocument";
import * as deviceNative from "../../services/device-sync/native";

const io = vi.hoisted(() => ({
  read: vi.fn(),
  discard: vi.fn(),
  write: vi.fn(),
  draft: vi.fn(),
  tree: null as NodeTree | null,
  resources: { upload: vi.fn(), remoteResourceToLocal: vi.fn() },
}));
vi.mock("../../services/tauri", () => ({
  collabReadCache: io.read,
  collabDiscardCache: io.discard,
  collabWriteCache: io.write,
  collabInputDraft: io.draft,
  collabNodeViews: async () => ({}),
}));
vi.mock("../../services/editorKit", () => ({
  getMobileContentKit: () => ({ extensions: [], registry: { get: () => io.resources } }),
}));
vi.mock("../../app/plugins/content", () => ({
  mobileContentPlugins: {
    subscribe: () => () => {},
    getRevision: () => 0,
    prepareEditorContracts: async () => ({ additionalContracts: () => ({}) }),
  },
}));
vi.mock("@tau/editor-collab", () => ({
  createNodeTreeDocument: (tree: NodeTree) => {
    io.tree = tree;
    return {};
  },
}));
const toast = vi.hoisted(() => ({ error: vi.fn(), info: vi.fn() }));
vi.mock("../../components/toast", () => ({ toast }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  io.tree = null;
});

it("明确覆盖后同基线旧缓存和旧会话不能重新带回本地输入，新会话可继续编辑", async () => {
  const contract = await prepareContentContract("tau.paragraph", {
    type: "paragraph",
    dataVersion: 1,
    kind: "block",
  });
  const contracts = { [contract.id]: contract.contract };
  const content = [
    {
      type: "paragraph",
      collabId: "p",
      tauContract: contract.id,
      children: [{ text: "远端正文" }],
    },
  ] as ContentNode[];
  const remote = await createNodeDocument(
    { documentId: "body", baselineId: "same-base", epoch: 0 },
    { title: "", bannerBg: "", bannerPosition: "center", content },
    contracts
  );
  const local = new Y.Doc({ gc: false });
  Y.applyUpdate(local, Y.encodeStateAsUpdate(remote));
  const localTree = new NodeTree(local);
  localTree.insertText("p", 4, "本地旧字", {});
  const entry = (doc: Y.Doc) => ({
    contentId: 7,
    documentId: "body",
    baselineId: "same-base",
    epoch: 0,
    state: bytesToBase64(Y.encodeStateAsUpdate(doc)),
    paths: {},
    updatedAt: 1,
  });
  let current = entry(local),
    generation = "";
  vi.spyOn(deviceNative, "deviceSyncDatabase").mockReturnValue("restore-test.db");
  vi.spyOn(deviceNative, "readDeviceContent").mockImplementation(async () => current);
  vi.spyOn(deviceNative, "deviceStore").mockImplementation((async (action: string) =>
    action === "generation"
      ? generation
      : action === "status"
        ? { state: null }
        : []) as typeof deviceNative.deviceStore);
  const metadata = {
    contentId: 7,
    createTime: 1,
    updateTime: 1,
    librarySourceId: "library",
    documentId: "body",
    revision: "r",
    contracts,
    content,
    count: 4,
    card: null,
  } as ContentDetailResponse;
  io.read.mockImplementation(async (id: string) =>
    id === "local:library:body"
      ? {
          metadata: {
            id,
            mode: "local",
            baselineId: "same-base",
            epoch: 0,
            source: {
              librarySourceId: "library",
              contentDocumentId: "body",
              projectionRevision: "r",
            },
          },
          state: entry(local).state,
          updates: [],
          revision: "cached",
          inputDrafts: [],
        }
      : null
  );
  io.write.mockResolvedValue("saved");
  let document: LocalContentDocument | undefined;
  function Harness() {
    document = useLocalContentDocument({
      contentId: 7,
      metadata,
      content: content as Descendant[],
      version: 1,
      onChange: vi.fn(),
    });
    return null;
  }
  const container = window.document.createElement("div"),
    root = createRoot(container);
  window.document.body.append(container);
  try {
    await act(async () => root.render(<Harness />));
    await vi.waitFor(() => expect(io.tree).not.toBeNull());
    expect(JSON.stringify(io.tree!.read())).toContain("本地旧字");
    let resources: ResourceService | undefined;
    document!.services!((id, service) => {
      if (id === IResourceService) resources = service as ResourceService;
    });
    const imagePath = "~/.editor/resources/paired-image.png";
    io.resources.upload.mockResolvedValue(imagePath);
    const reference = await resources!.upload(new File(["image"], "paired-image.png"));
    expect(reference).toMatch(/^tau-collab-local:/);
    expect(await resources!.remoteResourceToLocal!(reference)).toBe(imagePath);
    const recordingPath = "~/.editor/resources/recording.m4a";
    const recordingReference = document!.prepareResource(recordingPath);
    expect(recordingReference).toMatch(/^tau-collab-local:/);
    expect(document!.prepareResource(recordingPath)).toBe(recordingReference);
    expect(await resources!.remoteResourceToLocal!(recordingReference)).toBe(recordingPath);
    const previous = io.tree,
      oldDocument = document!;
    let finish = () => {};
    await act(async () => {
      finish = deviceNative.beginDeviceReplacement("restore-test.db");
    });
    const writesBefore = io.write.mock.calls.length;
    expect(() => oldDocument.prepareResource(recordingPath)).toThrow("正文已重新下载");
    await oldDocument.flush();
    expect(io.write.mock.calls.length).toBe(writesBefore);
    generation = "restored";
    current = entry(remote);
    await act(async () => finish());
    await vi.waitFor(() => {
      expect(io.tree).not.toBe(previous);
      expect(JSON.stringify(io.tree!.read())).not.toContain("本地旧字");
    });
    expect(io.read).toHaveBeenCalledWith("local:library:body:restored");
    await act(async () => io.tree!.insertText("p", 4, "新编辑", {}));
    await document!.flush();
    expect(JSON.stringify(io.tree!.read())).toContain("新编辑");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    localTree.dispose();
    local.destroy();
    remote.destroy();
  }
});

it("本机正文保存失败后冲刷重试完整因果链，重开能恢复失败期间的输入", async () => {
  const contract = await prepareContentContract("tau.paragraph", {
    type: "paragraph",
    dataVersion: 1,
    kind: "block",
  });
  const content: Descendant[] = [
    {
      type: "paragraph",
      collabId: "p",
      tauContract: contract.id,
      children: [{ type: "formatted", text: "原文" }],
    } as Descendant,
  ];
  const metadata = {
    contentId: 7,
    createTime: 1,
    updateTime: 1,
    content,
    count: 2,
    card: null,
    librarySourceId: "library",
    documentId: "body",
    revision: "revision",
    contracts: { [contract.id]: contract.contract },
  } as ContentDetailResponse;
  let document: LocalContentDocument | undefined;
  const options = { contentId: 7, content, metadata, version: 1, onChange: vi.fn() };
  function Harness() {
    document = useLocalContentDocument(options);
    return null;
  }
  io.write.mockResolvedValue("saved");
  const container = window.document.createElement("div"),
    root = createRoot(container);
  window.document.body.append(container);
  try {
    await act(async () => {
      root.render(<Harness />);
    });
    await vi.waitFor(() => expect(io.tree).not.toBeNull());
    let resources: ResourceService | undefined;
    document!.services!((id, service) => {
      if (id === IResourceService) resources = service as ResourceService;
    });
    const imagePath = "~/.editor/resources/image.png";
    io.resources.upload.mockResolvedValue(imagePath);
    expect(await resources!.upload(new File(["image"], "image.png"))).toBe(imagePath);
    expect(document!.prepareResource("~/.editor/resources/recording.m4a")).toBe(
      "~/.editor/resources/recording.m4a"
    );
    expect(await resources!.remoteResourceToLocal!(imagePath)).toBe(imagePath);
    expect(io.resources.remoteResourceToLocal).not.toHaveBeenCalled();
    const seed = io.write.mock.calls[0][0].state;
    const tree = io.tree!;
    const saved: string[] = [];
    io.write.mockRejectedValueOnce(new Error("disk full"));
    await act(async () => {
      tree.insertText("p", 2, "甲", {});
    });
    await vi.waitFor(() => expect(io.write).toHaveBeenCalledTimes(2));
    io.write.mockImplementation(async payload => {
      saved.push(payload.state);
      return "saved";
    });
    await act(async () => {
      tree.insertText("p", 3, "乙", {});
      await document!.flush();
    });
    const restored = new Y.Doc();
    Y.applyUpdate(restored, base64ToBytes(seed));
    saved.filter(Boolean).forEach(update => Y.applyUpdate(restored, base64ToBytes(update)));
    const read = new NodeTree(restored);
    expect(restored.store.pendingStructs).toBeNull();
    expect(JSON.stringify(read.read())).toContain("原文甲乙");
    read.dispose();
    restored.destroy();
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

async function paragraph(text: string) {
  const contract = await prepareContentContract("tau.paragraph", {
    type: "paragraph",
    dataVersion: 1,
    kind: "block",
  });
  const content: Descendant[] = [
    {
      type: "paragraph",
      collabId: "p",
      tauContract: contract.id,
      children: [{ type: "formatted", text }],
    } as Descendant,
  ];
  return { contract, content };
}

it.each([
  ["无未保存改动", false],
  ["有未保存改动", true],
])("主库被其他入口更新后打开：%s时备份缓存并按主库重建，不暂停写入", async (_, pending) => {
  const { contract, content: stale } = await paragraph("手机上的旧内容");
  const { content: latest } = await paragraph("桌面同步过来的新内容");
  const contracts = { [contract.id]: contract.contract };
  const cachedDoc = await createNodeDocument(
    { documentId: "body", baselineId: "cache-base", epoch: 0 },
    { title: "", bannerBg: "", bannerPosition: "center", content: stale as ContentNode[] },
    contracts
  );
  io.read.mockResolvedValue({
    metadata: {
      id: "local:library:body",
      mode: "local",
      baselineId: "cache-base",
      epoch: 0,
      pending,
      source: {
        librarySourceId: "library",
        contentDocumentId: "body",
        projectionRevision: "old-revision",
      },
    },
    state: bytesToBase64(Y.encodeStateAsUpdate(cachedDoc)),
    updates: [],
    revision: "cache",
    inputDrafts: [],
  });
  cachedDoc.destroy();
  io.write.mockResolvedValue("saved");
  const metadata = {
    contentId: 7,
    createTime: 1,
    updateTime: 2,
    content: latest,
    count: 6,
    card: null,
    librarySourceId: "library",
    documentId: "body",
    revision: "new-revision",
    contracts,
  } as ContentDetailResponse;
  const onChange = vi.fn();
  function Harness() {
    useLocalContentDocument({ contentId: 7, content: latest, metadata, version: 1, onChange });
    return null;
  }
  const container = window.document.createElement("div"),
    root = createRoot(container);
  window.document.body.append(container);
  try {
    await act(async () => {
      root.render(<Harness />);
    });
    await vi.waitFor(() => expect(io.tree).not.toBeNull());
    expect(io.discard).toHaveBeenCalledWith("local:library:body", "主库正文已被其他入口更新");
    expect(JSON.stringify(io.tree!.read())).toContain("桌面同步过来的新内容");
    expect(io.write.mock.calls[0][0].metadata.source.projectionRevision).toBe("new-revision");
    expect(io.write.mock.calls[0][0].expectedRevision).toBeUndefined();
    expect(toast.error).not.toHaveBeenCalled();
    // 缓存重建保持静默，不弹提示
    expect(toast.info).not.toHaveBeenCalled();
    for (const [value] of onChange.mock.calls)
      expect(JSON.stringify(value)).not.toContain("手机上的旧内容");
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
