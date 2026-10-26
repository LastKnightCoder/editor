import {
  prepareContentContract,
  type ContentContractDefinition,
} from "@tau/db-schema/content-contracts";
import { createNodeDocument, type NodeDocumentIdentity } from "../node-document";
import type { ContentNode, SharedContent } from "../protocol";

/** 测试直接声明当前节点契约；未声明类型拒绝，不模拟历史转换。 */
export async function createTestDocument(
  content: SharedContent,
  identity: NodeDocumentIdentity,
  definitions: readonly ContentContractDefinition[] = [
    { type: "paragraph", dataVersion: 1, kind: "block" },
  ]
) {
  const prepared = await Promise.all(
    definitions.map(definition => prepareContentContract("test." + definition.type, definition))
  );
  const byType = new Map(prepared.map(entry => [entry.contract.type, entry.id]));
  const stamp = (nodes: ContentNode[]): ContentNode[] =>
    nodes.map(node => {
      if (!node.children) return { ...node };
      const id = byType.get(String(node.type));
      if (!id) throw new Error("测试节点缺少显式契约：" + node.type);
      return { ...node, tauContract: id, children: stamp(node.children) };
    });
  return createNodeDocument(
    identity,
    { ...content, content: stamp(content.content) },
    Object.fromEntries(prepared.map(entry => [entry.id, entry.contract]))
  );
}
