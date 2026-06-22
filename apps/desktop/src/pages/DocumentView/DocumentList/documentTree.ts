import { getDocumentItemsByIds } from "@/commands";
import { EDragPosition, IDragItem } from "@/hooks/useDragAndDrop";
import { IDocument, IDocumentItem } from "@/types";
import {
  canMoveTreeItem,
  getAdjustedTreeInsertIndex,
  getMindMapTreeNodeId,
  isDescendantTreeNode,
} from "@/pages/shared/mindMapTreeUtils";

export interface DocumentTreeNode {
  nodeId: string;
  item: IDocumentItem;
  parentId: number;
  parentNodeId?: string;
  isRoot: boolean;
  path: number[];
  parentChildren: number[];
  children: DocumentTreeNode[];
}

export interface DocumentTreeData {
  nodes: DocumentTreeNode[];
  itemMap: Map<number, IDocumentItem>;
  nodeMap: Map<string, DocumentTreeNode>;
  itemNodeMap: Map<number, DocumentTreeNode[]>;
}

const BATCH_SIZE = 40;

export const getDocumentTreeNodeId = getMindMapTreeNodeId;

export const loadDocumentItemMap = async (
  rootIds: number[],
): Promise<Map<number, IDocumentItem>> => {
  const queue = [...new Set(rootIds)];
  const visited = new Set<number>();
  const itemMap = new Map<number, IDocumentItem>();

  while (queue.length > 0) {
    const batch = queue.splice(0, BATCH_SIZE).filter((id) => !visited.has(id));
    if (batch.length === 0) continue;

    batch.forEach((id) => visited.add(id));
    const items = await getDocumentItemsByIds(batch);
    items.forEach((item) => {
      itemMap.set(item.id, item);
      item.children?.forEach((childId) => {
        if (!visited.has(childId)) {
          queue.push(childId);
        }
      });
    });
  }

  return itemMap;
};

export const buildDocumentTreeData = (
  document: IDocument,
  itemMap: Map<number, IDocumentItem>,
): DocumentTreeData => {
  const nodeMap = new Map<string, DocumentTreeNode>();
  const itemNodeMap = new Map<number, DocumentTreeNode[]>();

  const buildNode = (
    itemId: number,
    parentId: number,
    parentNodeId: string | undefined,
    parentChildren: number[],
    path: number[],
    ancestors: Set<number>,
  ): DocumentTreeNode | null => {
    if (ancestors.has(itemId)) return null;
    const item = itemMap.get(itemId);
    if (!item) return null;

    const nextAncestors = new Set(ancestors);
    nextAncestors.add(itemId);
    const nodeId = getDocumentTreeNodeId(item.id, path);
    const node: DocumentTreeNode = {
      nodeId,
      item,
      parentId,
      parentNodeId,
      isRoot: parentId === document.id,
      path,
      parentChildren,
      children: [],
    };
    node.children = (item.children || [])
      .map((childId, index) =>
        buildNode(
          childId,
          item.id,
          nodeId,
          item.children,
          [...path, index],
          nextAncestors,
        ),
      )
      .filter((child): child is DocumentTreeNode => Boolean(child));
    nodeMap.set(nodeId, node);
    itemNodeMap.set(item.id, [...(itemNodeMap.get(item.id) || []), node]);
    return node;
  };

  const nodes = (document.children || [])
    .map((itemId, index) =>
      buildNode(
        itemId,
        document.id,
        undefined,
        document.children,
        [index],
        new Set(),
      ),
    )
    .filter((node): node is DocumentTreeNode => Boolean(node));

  return {
    nodes,
    itemMap,
    nodeMap,
    itemNodeMap,
  };
};

export const isDocumentDescendantNode = (
  treeData: DocumentTreeData,
  ancestorId: number,
  maybeDescendantId: number,
) => {
  return isDescendantTreeNode(treeData, ancestorId, maybeDescendantId);
};

export const canMoveDocumentTreeItem = ({
  treeData,
  dragItem,
  dropTargetId,
  dragPosition,
  insertParentId,
  insertParentChildren,
  insertParentIsRoot,
}: {
  treeData: DocumentTreeData;
  dragItem: IDragItem;
  dropTargetId: number;
  dragPosition: EDragPosition;
  insertParentId?: number;
  insertParentChildren?: number[];
  insertParentIsRoot?: boolean;
}) => {
  return canMoveTreeItem({
    treeData,
    dragItem,
    dropTargetId,
    dragPosition,
    insertParentId,
    insertParentChildren,
    insertParentIsRoot,
  });
};

export const getAdjustedDocumentTreeInsertIndex = ({
  children,
  dragId,
  insertIndex,
}: {
  children: number[];
  dragId: number;
  insertIndex: number;
}) => {
  return getAdjustedTreeInsertIndex({ children, dragId, insertIndex });
};
