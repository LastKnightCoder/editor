import * as Y from "yjs";
import { migrateKnowledgeReferences, type KnowledgeMapping } from "@tau/db-schema";
import { getBody } from "./document";
import type { ContentNode } from "./protocol";

export type { KnowledgeMapping } from "@tau/db-schema";

/** 只更新 CRDT 节点属性，保留文本身份，避免多端升级时整树重插造成重复正文。 */
export function migrateKnowledgeDocument(
  doc: Y.Doc,
  mapping: KnowledgeMapping,
  privateNodes = new Map<string, ContentNode>()
): boolean {
  const changes: {
    node: Y.XmlText;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
  }[] = [];
  const visit = (node: Y.XmlText) => {
    const before = node.getAttributes() as Record<string, unknown>;
    const after = migrateKnowledgeReferences(before, mapping) as Record<string, unknown>;
    if (JSON.stringify(before) !== JSON.stringify(after)) changes.push({ node, before, after });
    for (const delta of node.toDelta()) if (delta.insert instanceof Y.XmlText) visit(delta.insert);
  };
  visit(getBody(doc));
  const privateChanges: [string, ContentNode][] = [];
  for (const [id, node] of privateNodes) {
    const next = migrateKnowledgeReferences(node, mapping) as ContentNode;
    if (JSON.stringify(node) !== JSON.stringify(next)) privateChanges.push([id, next]);
  }
  if (!changes.length && !privateChanges.length) return false;
  doc.transact(() => {
    for (const { node, before, after } of changes) {
      for (const key of Object.keys(before)) if (!(key in after)) node.removeAttribute(key);
      for (const [key, value] of Object.entries(after)) {
        if (JSON.stringify(before[key]) !== JSON.stringify(value)) node.setAttribute(key, value);
      }
    }
  }, "knowledge-migration");
  for (const [id, node] of privateChanges) privateNodes.set(id, node);
  return true;
}
