import { getProjectItemsByIds } from "@/commands";
import { EDragPosition, IDragItem } from "@/hooks/useDragAndDrop";
import { Project, ProjectItem } from "@/types";
import {
  canMoveTreeItem,
  getAdjustedTreeInsertIndex,
  getMindMapTreeNodeId,
  isDescendantTreeNode,
} from "@/utils/mindMapTreeUtils";

export interface ProjectTreeNode {
  nodeId: string;
  item: ProjectItem;
  parentId: number;
  parentNodeId?: string;
  isRoot: boolean;
  path: number[];
  parentChildren: number[];
  children: ProjectTreeNode[];
}

export interface ProjectTreeData {
  nodes: ProjectTreeNode[];
  itemMap: Map<number, ProjectItem>;
  nodeMap: Map<string, ProjectTreeNode>;
  itemNodeMap: Map<number, ProjectTreeNode[]>;
}

const BATCH_SIZE = 40;

export const getProjectTreeNodeId = getMindMapTreeNodeId;

export const loadProjectItemMap = async (rootIds: number[]): Promise<Map<number, ProjectItem>> => {
  const queue = [...new Set(rootIds)];
  const visited = new Set<number>();
  const itemMap = new Map<number, ProjectItem>();

  while (queue.length > 0) {
    const batch = queue.splice(0, BATCH_SIZE).filter(id => !visited.has(id));
    if (batch.length === 0) continue;

    batch.forEach(id => visited.add(id));
    const items = await getProjectItemsByIds(batch);
    items.forEach(item => {
      itemMap.set(item.id, item);
      item.children?.forEach(childId => {
        if (!visited.has(childId)) {
          queue.push(childId);
        }
      });
    });
  }

  return itemMap;
};

export const buildProjectTreeData = (
  project: Project,
  itemMap: Map<number, ProjectItem>
): ProjectTreeData => {
  const nodeMap = new Map<string, ProjectTreeNode>();
  const itemNodeMap = new Map<number, ProjectTreeNode[]>();

  const buildNode = (
    itemId: number,
    parentId: number,
    parentNodeId: string | undefined,
    parentChildren: number[],
    path: number[],
    ancestors: Set<number>
  ): ProjectTreeNode | null => {
    if (ancestors.has(itemId)) return null;
    const item = itemMap.get(itemId);
    if (!item) return null;

    const nextAncestors = new Set(ancestors);
    nextAncestors.add(itemId);
    const nodeId = getProjectTreeNodeId(item.id, path);
    const node: ProjectTreeNode = {
      nodeId,
      item,
      parentId,
      parentNodeId,
      isRoot: parentId === project.id,
      path,
      parentChildren,
      children: [],
    };
    node.children = (item.children || [])
      .map((childId, index) =>
        buildNode(childId, item.id, nodeId, item.children, [...path, index], nextAncestors)
      )
      .filter((child): child is ProjectTreeNode => Boolean(child));
    nodeMap.set(nodeId, node);
    itemNodeMap.set(item.id, [...(itemNodeMap.get(item.id) || []), node]);
    return node;
  };

  const nodes = (project.children || [])
    .map((itemId, index) =>
      buildNode(itemId, project.id, undefined, project.children, [index], new Set())
    )
    .filter((node): node is ProjectTreeNode => Boolean(node));

  return {
    nodes,
    itemMap,
    nodeMap,
    itemNodeMap,
  };
};

export const isDescendantNode = (
  treeData: ProjectTreeData,
  ancestorId: number,
  maybeDescendantId: number
) => {
  return isDescendantTreeNode(treeData, ancestorId, maybeDescendantId);
};

export const canMoveProjectTreeItem = ({
  treeData,
  dragItem,
  dropTargetId,
  dragPosition,
  insertParentId,
  insertParentChildren,
  insertParentIsRoot,
}: {
  treeData: ProjectTreeData;
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

export const getAdjustedProjectTreeInsertIndex = ({
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
