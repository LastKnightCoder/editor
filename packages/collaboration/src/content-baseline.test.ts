import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { NodeTree } from "./node-tree";
import { createNodeDocument, readNodeDocument, validateNodeDocument } from "./node-document";
import { readDocumentIdentity } from "./document-version";
import {
  assertContentBaseline,
  type ContentBaselineFixture,
  type ContentBaselineSnapshot,
} from "./testing/content-baseline";

const fixture = JSON.parse(
  readFileSync(new URL("./testing/fixtures/content-baseline-v1.json", import.meta.url), "utf8")
) as ContentBaselineFixture;

const expectedSnapshot = (edited = false): ContentBaselineSnapshot =>
  structuredClone({
    identity: fixture.identity,
    contracts: fixture.contracts,
    document: edited ? fixture.expected : fixture.initial,
  });

const snapshot = (doc: Y.Doc): ContentBaselineSnapshot => ({
  identity: readDocumentIdentity(doc),
  contracts: doc.getMap("node-tree:contracts").toJSON(),
  document: readNodeDocument(doc),
});

function firstLeaf(value: ContentBaselineSnapshot, index: number) {
  const leaf = value.document.content[index]?.children?.[0];
  if (!leaf) throw new Error("固定夹具缺少预期文本叶");
  return leaf;
}

describe("固定正文夹具与独立判据", () => {
  it("固定契约和完整载荷在创建、二进制重开、编辑和再次重开后符合人工预期", async () => {
    expect(fixture.fixtureVersion).toBe(1);
    const doc = await createNodeDocument(
      fixture.identity,
      structuredClone(fixture.initial),
      structuredClone(fixture.contracts)
    );
    const restored = new Y.Doc({ gc: false });
    const reopened = new Y.Doc({ gc: false });
    let tree: NodeTree | undefined;
    try {
      assertContentBaseline(snapshot(doc), expectedSnapshot());
      Y.applyUpdate(restored, Y.encodeStateAsUpdate(doc));
      await validateNodeDocument(restored, fixture.identity);
      assertContentBaseline(snapshot(restored), expectedSnapshot());
      tree = new NodeTree(restored);
      for (const operation of fixture.operations) {
        if (operation.kind === "insertText")
          tree.insertText(operation.nodeId, operation.index, operation.text, "baseline");
        else tree.moveNode(operation.nodeId, null, operation.index, "baseline");
      }
      await validateNodeDocument(restored, fixture.identity);
      assertContentBaseline(snapshot(restored), expectedSnapshot(true));
      Y.applyUpdate(reopened, Y.encodeStateAsUpdate(restored));
      await validateNodeDocument(reopened, fixture.identity);
      assertContentBaseline(snapshot(reopened), expectedSnapshot(true));
    } finally {
      tree?.dispose();
      doc.destroy();
      restored.destroy();
      reopened.destroy();
    }
  });

  const corruptions: Array<[string, (value: ContentBaselineSnapshot) => void]> = [
    ["丢字", value => (firstLeaf(value, 1).text = "甲乙")],
    ["重复文字", value => (firstLeaf(value, 1).text += "乙")],
    ["丢格式", value => delete firstLeaf(value, 1).bold],
    ["节点身份错误", value => (value.document.content[1].collabId = "wrong-node")],
    ["节点顺序错误", value => value.document.content.reverse()],
    ["源码丢失", value => (value.document.content[3].source = "")],
    [
      "资源地址错误",
      value => (value.document.content[4].url = "https://example.invalid/wrong.png"),
    ],
    ["未知数据丢失", value => delete value.document.content[5].payload],
    ["正文身份错误", value => (value.identity.documentId = "wrong-document")],
    ["基线身份错误", value => (value.identity.baselineId = "wrong-baseline")],
    ["文档代次错误", value => value.identity.epoch++],
    [
      "契约丢失",
      value => {
        const contracts = { ...value.contracts };
        delete contracts[Object.keys(contracts)[0]];
        value.contracts = contracts;
      },
    ],
  ];

  it.each(corruptions)("判定器能拒绝：%s", (_name, corrupt) => {
    const actual = expectedSnapshot();
    corrupt(actual);
    expect(() => assertContentBaseline(actual, expectedSnapshot())).toThrow();
  });

  it("只接受文本叶缺省类型这一项表示差异，不修改输入", () => {
    const actual = expectedSnapshot();
    firstLeaf(actual, 1).type = "formatted";
    const before = structuredClone(actual);
    expect(() => assertContentBaseline(actual, expectedSnapshot())).not.toThrow();
    expect(actual).toEqual(before);
    firstLeaf(actual, 1).type = "unexpected";
    expect(() => assertContentBaseline(actual, expectedSnapshot())).toThrow();
  });
});
