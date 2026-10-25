import {
  CONTENT_ENTITY_NODE_CONTRACTS,
  isContentEntityReference,
  type ContentEntityReference,
} from "@tau/db-schema/content-identities";
import { NODE_CONTRACT_PROPERTY } from "@tau/db-schema/content-contracts";
import { NodeTree } from "./node-tree";
import type { WhiteboardModel } from "./whiteboard-model";
import type { ContentNode } from "./protocol";

export interface WhiteboardEntityRelation {
  rootId: string;
  nodeId: string;
  slot: string;
  target: ContentEntityReference;
}
export const whiteboardRelationKey = (relation: WhiteboardEntityRelation) =>
  JSON.stringify([
    relation.rootId,
    relation.nodeId,
    relation.slot,
    relation.target.sourceId,
    relation.target.kind,
    relation.target.entityId,
  ]);

/** 存活投影用于业务关系账；保留池用于本机历史持有，两者不能混作同步引用计数。 */
export function collectWhiteboardRelations(
  model: WhiteboardModel,
  retained = false
): WhiteboardEntityRelation[] {
  const relations: WhiteboardEntityRelation[] = [];
  const bodyNode = (rootId: string, node: ContentNode) => {
    const contract =
      typeof node[NODE_CONTRACT_PROPERTY] === "string"
        ? model.contracts.get(node[NODE_CONTRACT_PROPERTY] as string)
        : undefined;
    const entity = contract && CONTENT_ENTITY_NODE_CONTRACTS[contract.type];
    if (entity && contract?.domain === "editor-node" && entity.owner === contract.owner) {
      if (
        typeof node.collabId !== "string" ||
        !isContentEntityReference(node.entityRef) ||
        node.entityRef.kind !== entity.kind
      )
        throw new Error("正文实体槽缺少稳定身份");
      relations.push({ rootId, nodeId: node.collabId, slot: "entityRef", target: node.entityRef });
    }
    node.children?.forEach(child => bodyNode(rootId, child));
  };
  if (retained) {
    for (const [id, record] of model.elements) {
      const entity = record.get("entity");
      if (entity !== undefined) {
        if (!isContentEntityReference(entity)) throw new Error("白板实体槽缺少稳定身份");
        relations.push({ rootId: "board", nodeId: id, slot: "entity", target: entity });
      }
      const binding = record.get("fieldBindings") as { body?: { mode: string; rootId: string } };
      if (binding.body?.mode === "richtext") {
        const tree = new NodeTree(model.doc, { rootId: binding.body.rootId });
        try {
          for (const [nodeId] of tree.nodes)
            bodyNode(tree.rootId, {
              ...tree.properties(nodeId).toJSON(),
              collabId: nodeId,
            } as ContentNode);
        } finally {
          tree.dispose();
        }
      }
    }
  } else {
    const visit = (nodes: import("./whiteboard-types").WhiteboardElementSnapshot[]) => {
      for (const node of nodes) {
        if (node.entity)
          relations.push({ rootId: "board", nodeId: node.id, slot: "entity", target: node.entity });
        if (node.fieldBindings.body?.mode === "richtext" && Array.isArray(node.body))
          node.body.forEach(value => bodyNode(node.fieldBindings.body!.rootId, value));
        visit([...node.children]);
      }
    };
    const snapshot = model.read();
    for (const page of snapshot.pages) visit([...page.children, ...page.recovery]);
    visit([...snapshot.recovery]);
  }
  return relations;
}
