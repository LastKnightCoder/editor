import { expect, it, vi } from "vitest";
import { createEditor, Node, Transforms, type Element } from "slate";
import { withReact } from "slate-react";
import { createNodeDocument, NodeTree } from "@tau/collaboration";
import { prepareContentContract } from "@tau/db-schema/content-contracts";
import { copyNodeToClipboard, notifierOf } from "@tau/editor/api";
import { withNodeTree } from "../withNodeTree";

const createClipboard = () => {
  const data = new Map<string, string>();
  return {
    getData: (key: string) => data.get(key) ?? "",
    setData: (key: string, value: string) => data.set(key, value),
  } as unknown as DataTransfer;
};

class TestClipboardItem {
  constructor(readonly items: Record<string, Blob>) {}
}

const readBlob = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });

it("在非空段落中粘贴编辑器内复制的带格式文本", async () => {
  const paragraph = await prepareContentContract("tau.paragraph", {
    type: "paragraph",
    dataVersion: 1,
    kind: "block",
  });
  const doc = await createNodeDocument(
    { documentId: "clipboard", baselineId: "clipboard", epoch: 0 },
    {
      title: "",
      bannerBg: "",
      bannerPosition: "center",
      content: [
        {
          type: "paragraph",
          collabId: "paragraph",
          tauContract: paragraph.id,
          children: [{ type: "formatted", text: "原文", bold: true }],
        },
      ],
    },
    { [paragraph.id]: paragraph.contract }
  );
  const tree = new NodeTree(doc);
  const base = withReact(createEditor());
  base.setFragmentData = vi.fn();
  const editor = withNodeTree(
    base,
    tree,
    {},
    {
      currentContract: () => paragraph.id,
      resolveVersion: () => ({
        access: "edit",
        element: { type: "paragraph", kind: "block", render: () => null },
      }),
    }
  );
  const reportError = vi.spyOn(notifierOf(editor), "error");
  const clipboard = createClipboard();
  editor.connectNodeTree();
  try {
    Transforms.select(editor, {
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 0], offset: 2 },
    });
    editor.setFragmentData(clipboard);
    Transforms.select(editor, { path: [0, 0], offset: 1 });
    await editor.insertData(clipboard);

    expect(reportError).not.toHaveBeenCalled();
    expect(Node.string(editor)).toBe("原原文文");
    expect((editor.children[0] as Element).children).toEqual([
      { type: "formatted", text: "原原文文", bold: true },
    ]);
    expect(tree.read()).toEqual(editor.children);

    const external = createClipboard();
    external.setData("text/plain", "外部文本");
    Transforms.select(editor, { path: [0, 0], offset: 4 });
    await editor.insertData(external);
    expect(Node.string(editor)).toBe("原原文文外部文本");
    expect(tree.read()).toEqual(editor.children);
    expect(reportError).not.toHaveBeenCalled();
  } finally {
    reportError.mockRestore();
    editor.disposeNodeTree();
    tree.dispose();
    doc.destroy();
  }
});

it.each(["block", "inline"] as const)(
  "块复制的 %s 节点经 HTML 跨文档粘贴时，目标未安装插件也保留原契约",
  async kind => {
    const paragraph = await prepareContentContract("tau.paragraph", {
      type: "paragraph",
      dataVersion: 1,
      kind: "block",
    });
    const unknown = await prepareContentContract("example.plugin", {
      type: "example.diagram",
      dataVersion: 1,
      kind,
      isVoid: true,
      collaboration: { textFields: ["source"] },
      resources: [{ path: "cover", kind: "image" }],
    });
    const original = {
      type: "example.diagram",
      collabId: "source-node",
      tauContract: unknown.id,
      source: "原版本源码",
      custom: "保留",
      cover: "~/.editor/resources/image.png",
      children: [{ text: "" }],
    };
    const sourceParagraph = {
      type: "paragraph",
      collabId: "source-paragraph",
      tauContract: paragraph.id,
      children: [{ text: "" }, original, { text: "" }],
    };
    const fragment = kind === "inline" ? [sourceParagraph] : [original];
    const source = await createNodeDocument(
      { documentId: "source", baselineId: "source", epoch: 0 },
      { title: "", bannerBg: "", bannerPosition: "center", content: fragment },
      { [paragraph.id]: paragraph.contract, [unknown.id]: unknown.contract },
      { allowLocalResources: true }
    );
    const target = await createNodeDocument(
      { documentId: "target", baselineId: "target", epoch: 0 },
      {
        title: "",
        bannerBg: "",
        bannerPosition: "center",
        content: [
          {
            type: "paragraph",
            collabId: "paragraph",
            tauContract: paragraph.id,
            children: [{ text: kind === "inline" ? "甲乙" : "" }],
          },
        ],
      },
      { [paragraph.id]: paragraph.contract }
    );
    const sourceTree = new NodeTree(source),
      targetTree = new NodeTree(target);
    const clipboard = createClipboard();
    const from = createEditor(),
      to = createEditor();
    from.setFragmentData = vi.fn();
    from.insertData = vi.fn();
    from.getFragment = () => fragment as never;
    to.setFragmentData = vi.fn();
    to.insertData = vi.fn();
    const first = withNodeTree(from, sourceTree, {}),
      second = withNodeTree(
        to,
        targetTree,
        {},
        {
          currentContract: type => (type === "paragraph" ? paragraph.id : undefined),
          resolveVersion: node =>
            node.type === "paragraph"
              ? {
                  access: "edit",
                  element: { type: "paragraph", kind: "block", render: () => null },
                }
              : undefined,
        }
      );
    first.connectNodeTree();
    second.connectNodeTree();
    const blockClipboard = createClipboard();
    vi.stubGlobal("ClipboardItem", TestClipboardItem);
    vi.stubGlobal("navigator", {
      clipboard: {
        write: async ([item]: TestClipboardItem[]) => {
          blockClipboard.setData("text/html", await readBlob(item.items["text/html"]));
        },
      },
    });
    try {
      first.setFragmentData(clipboard);
      expect(await copyNodeToClipboard(first, fragment as never)).toBe(true);
      const html = new DOMParser().parseFromString(
        blockClipboard.getData("text/html"),
        "text/html"
      );
      expect(
        html.querySelector("[data-slate-fragment]")?.getAttribute("data-tau-content-fragment")
      ).toBe(clipboard.getData("application/x-tau-content"));
      Transforms.select(second, { path: [0, 0], offset: kind === "inline" ? 1 : 0 });
      await second.insertData(blockClipboard);
      const content = targetTree.read();
      const copied = kind === "inline" ? content[0]?.children?.[1] : content[0];
      if (kind === "inline") {
        expect(content).toHaveLength(1);
        expect(Node.string(second)).toBe("甲乙");
      }
      expect(copied).toMatchObject({
        tauContract: unknown.id,
        source: "原版本源码",
        custom: "保留",
        cover: original.cover,
      });
      expect(copied?.collabId).toEqual(expect.any(String));
      expect(copied?.collabId).not.toBe(original.collabId);
      expect(targetTree.contracts.get(unknown.id)).toEqual(unknown.contract);
    } finally {
      vi.unstubAllGlobals();
      first.disposeNodeTree();
      second.disposeNodeTree();
      sourceTree.dispose();
      targetTree.dispose();
      source.destroy();
      target.destroy();
    }
  }
);
