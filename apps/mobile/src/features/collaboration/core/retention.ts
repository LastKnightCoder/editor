import type * as Y from "yjs";
import { NodeTree, collectNodeDocumentResources, NODE_DOCUMENT_VERSION } from "@tau/collaboration";
import {
  CONTENT_ENTITY_NODE_CONTRACTS,
  isContentEntityReference,
  type ContentEntityReference,
} from "@tau/db-schema/content-identities";

export function matchingInputDrafts(
  doc: Y.Doc,
  drafts: readonly import("../../../services/tauri").CachedInputDraft[]
) {
  if (!drafts.length || doc.getMap("meta").get("version") !== NODE_DOCUMENT_VERSION) return [];
  const tree = new NodeTree(doc);
  try {
    return drafts.filter(draft => {
      try {
        return (
          !tree.isDeleted(draft.nodeId) &&
          tree.textField(draft.nodeId, draft.field).toString() === draft.value
        );
      } catch {
        return false;
      }
    });
  } finally {
    tree.dispose();
  }
}

/** 缓存的隐藏节点仍保留资源与实体持有；正文投影计数不包含这些本机记录。 */
export function nodeRetentions(doc: Y.Doc) {
  if (doc.getMap("meta").get("version") !== NODE_DOCUMENT_VERSION)
    return { resources: [], references: [] };
  const tree = new NodeTree(doc);
  const references: ContentEntityReference[] = [];
  try {
    for (const id of tree.nodes.keys()) {
      const contract = tree.contract(id),
        expected = contract && CONTENT_ENTITY_NODE_CONTRACTS[contract.type];
      if (!contract || !expected || expected.owner !== contract.owner) continue;
      const target = tree.properties(id).get("entityRef");
      if (!isContentEntityReference(target) || target.kind !== expected.kind)
        throw new Error("实体引用缺少稳定来源");
      references.push(target);
    }
    return { resources: collectNodeDocumentResources(doc), references };
  } finally {
    tree.dispose();
  }
}
