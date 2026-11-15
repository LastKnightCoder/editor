import { deepStrictEqual } from "node:assert/strict";
import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";
import type { ContentNode, SharedContent } from "../protocol";

export interface ContentBaselineSnapshot {
  identity: { version: number; documentId: string; baselineId: string; epoch: number };
  contracts: ContentContractDictionary;
  document: SharedContent;
}

export interface ContentBaselineFixture {
  fixtureVersion: 1;
  identity: ContentBaselineSnapshot["identity"];
  contracts: ContentContractDictionary;
  initial: SharedContent;
  operations: Array<
    | { kind: "insertText"; nodeId: string; index: number; text: string }
    | { kind: "moveNode"; nodeId: string; index: number }
  >;
  expected: SharedContent;
}

function canonicalNode(node: ContentNode): ContentNode {
  const copy = { ...node };
  if (Array.isArray(node.children)) copy.children = node.children.map(canonicalNode);
  // 文本叶的缺省类型与显式 formatted 等价，其余字段必须原样参与比对。
  else if (typeof node.text === "string" && node.type === "formatted") delete copy.type;
  return copy;
}

/** 仅比较冻结预期，不调用正文模型、资源转换或投影代码生成正确答案。 */
export function assertContentBaseline(
  actual: ContentBaselineSnapshot,
  expected: ContentBaselineSnapshot
): void {
  deepStrictEqual(actual.identity, expected.identity, "正文或基线身份变化");
  deepStrictEqual(actual.contracts, expected.contracts, "契约字典变化");
  deepStrictEqual(
    { ...actual.document, content: actual.document.content.map(canonicalNode) },
    { ...expected.document, content: expected.document.content.map(canonicalNode) },
    "正文、格式、节点身份、资源或未知字段变化"
  );
}
