import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Descendant } from "slate";
import { afterEach, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { NodeTree, base64ToBytes } from "@tau/collaboration";
import { prepareContentContract } from "@tau/db-schema/content-contracts";
import type { ContentDetailResponse } from "../../types";
import useLocalContentDocument, { type LocalContentDocument } from "../useLocalContentDocument";

const io = vi.hoisted(() => ({ write: vi.fn(), draft: vi.fn(), tree: null as NodeTree | null }));
vi.mock("../../services/tauri", () => ({
  collabReadCache: async () => null,
  collabWriteCache: io.write,
  collabInputDraft: io.draft,
  collabNodeViews: async () => ({}),
}));
vi.mock("../../services/editorKit", () => ({
  getMobileContentKit: () => ({ extensions: [], registry: { get: () => ({}) } }),
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
vi.mock("../../components/toast", () => ({ toast: { error: vi.fn() } }));
afterEach(() => {
  vi.clearAllMocks();
  io.tree = null;
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
