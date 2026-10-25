import { expect, it, vi } from "vitest";
import { createEditor, Transforms } from "slate";
import { createNodeDocument, NodeTree } from "@tau/collaboration";
import { prepareContentContract } from "@tau/db-schema/content-contracts";
import { withNodeTree } from "../withNodeTree";

it("跨文档复制带上原版本契约，目标未安装插件也保留节点并生成新身份", async () => {
  const paragraph = await prepareContentContract("tau.paragraph", {
    type: "paragraph",
    dataVersion: 1,
    kind: "block",
  });
  const unknown = await prepareContentContract("example.plugin", {
    type: "example.diagram",
    dataVersion: 1,
    kind: "block",
    isVoid: true,
    collaboration: { textFields: ["source"] },
  });
  const original = {
    type: "example.diagram",
    collabId: "source-node",
    tauContract: unknown.id,
    source: "原版本源码",
    custom: "保留",
    children: [{ text: "" }],
  };
  const source = await createNodeDocument(
    { documentId: "source", baselineId: "source", epoch: 0 },
    { title: "", bannerBg: "", bannerPosition: "center", content: [original] },
    { [unknown.id]: unknown.contract }
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
          children: [{ text: "" }],
        },
      ],
    },
    { [paragraph.id]: paragraph.contract }
  );
  const sourceTree = new NodeTree(source),
    targetTree = new NodeTree(target);
  const data = new Map<string, string>();
  const clipboard = {
    getData: (key: string) => data.get(key) ?? "",
    setData: (key: string, value: string) => data.set(key, value),
  } as unknown as DataTransfer;
  const from = createEditor(),
    to = createEditor();
  from.setFragmentData = vi.fn();
  from.insertData = vi.fn();
  from.getFragment = () => [original] as never;
  to.setFragmentData = vi.fn();
  to.insertData = vi.fn();
  const first = withNodeTree(from, sourceTree, {}),
    second = withNodeTree(
      to,
      targetTree,
      {},
      { currentContract: type => (type === "paragraph" ? paragraph.id : undefined) }
    );
  first.connectNodeTree();
  second.connectNodeTree();
  try {
    first.setFragmentData(clipboard);
    Transforms.select(second, { path: [0, 0], offset: 0 });
    await second.insertData(clipboard);
    const copied = targetTree.read().find(node => node.type === "example.diagram");
    expect(copied).toMatchObject({ tauContract: unknown.id, source: "原版本源码", custom: "保留" });
    expect(copied!.collabId).not.toBe(original.collabId);
    expect(targetTree.contracts.get(unknown.id)).toEqual(unknown.contract);
  } finally {
    first.disposeNodeTree();
    second.disposeNodeTree();
    sourceTree.dispose();
    targetTree.dispose();
    source.destroy();
    target.destroy();
  }
});
