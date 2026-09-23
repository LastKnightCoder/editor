import { EDragPosition, IDragItem } from "@/hooks/useDragAndDrop";

export interface MindMapTreeNodeLike<TItem extends { id: number }> {
  nodeId: string;
  item: TItem;
  parentId: number;
  parentNodeId?: string;
  isRoot: boolean;
  parentChildren: number[];
  children: MindMapTreeNodeLike<TItem>[];
}

export interface MindMapTreeDataLike<
  TItem extends { id: number },
  TNode extends MindMapTreeNodeLike<TItem>,
> {
  nodes: TNode[];
  itemMap: Map<number, TItem>;
  nodeMap: Map<string, TNode>;
  itemNodeMap: Map<number, TNode[]>;
}

export type MindMapDropIndicator = "top" | "bottom" | "inside";

export interface MindMapDropPlacement {
  parentId: number;
  parentIsRoot: boolean;
  insertIndex: number;
  indicator: MindMapDropIndicator;
  referenceNodeId?: string;
  parentNodeId?: string;
  beforeNodeId?: string;
  afterNodeId?: string;
}

export type MindMapDropGuide = {
  d: string;
  width: number;
  height: number;
} | null;

const HORIZONTAL_TARGET_TOLERANCE = 32;
const MAX_DROP_SNAP_DISTANCE_X = 140;
const MAX_DROP_SNAP_DISTANCE_Y = 96;

const getRectDistanceX = (rect: DOMRect, clientX: number) => {
  if (clientX < rect.left) return rect.left - clientX;
  if (clientX > rect.right) return clientX - rect.right;
  return 0;
};

const getRectDistanceY = (rect: DOMRect, clientY: number) => {
  if (clientY < rect.top) return rect.top - clientY;
  if (clientY > rect.bottom) return clientY - rect.bottom;
  return 0;
};

export const getMindMapTreeNodeId = (itemId: number, path: number[]) =>
  `${itemId}@${path.join(".")}`;

export const isDescendantTreeNode = <
  TItem extends { id: number },
  TNode extends MindMapTreeNodeLike<TItem>,
>(
  treeData: MindMapTreeDataLike<TItem, TNode>,
  ancestorId: number,
  maybeDescendantId: number
) => {
  const ancestors = treeData.itemNodeMap.get(ancestorId) || [];
  if (ancestors.length === 0) return false;

  const walk = (node: TNode | MindMapTreeNodeLike<TItem>): boolean => {
    if (node.item.id === maybeDescendantId) return true;
    return node.children.some(walk);
  };

  return ancestors.some(ancestor => ancestor.children.some(walk));
};

export const canMoveTreeItem = <
  TItem extends { id: number; children: number[] },
  TNode extends MindMapTreeNodeLike<TItem>,
>({
  treeData,
  dragItem,
  dropTargetId,
  dragPosition,
  insertParentId,
  insertParentChildren,
  insertParentIsRoot,
}: {
  treeData: MindMapTreeDataLike<TItem, TNode>;
  dragItem: IDragItem;
  dropTargetId: number;
  dragPosition: EDragPosition;
  insertParentId?: number;
  insertParentChildren?: number[];
  insertParentIsRoot?: boolean;
}) => {
  const targetParentId =
    typeof insertParentId === "number"
      ? insertParentId
      : dragPosition === EDragPosition.Inside
        ? dropTargetId
        : undefined;
  const targetParentIsRoot =
    typeof insertParentId === "number" ? Boolean(insertParentIsRoot) : false;

  if (dragItem.itemId === dropTargetId) return false;
  if (targetParentId === dragItem.itemId && !targetParentIsRoot) return false;

  if (
    typeof targetParentId === "number" &&
    !targetParentIsRoot &&
    isDescendantTreeNode(treeData, dragItem.itemId, targetParentId)
  ) {
    return false;
  }

  if (
    typeof targetParentId !== "number" &&
    isDescendantTreeNode(treeData, dragItem.itemId, dropTargetId)
  ) {
    return false;
  }

  if (dragPosition === EDragPosition.Inside) {
    const targetNode = treeData.itemNodeMap.get(dropTargetId)?.[0];
    if (
      (!dragItem.isRoot && dragItem.parentId === dropTargetId) ||
      targetNode?.item.children.includes(dragItem.itemId)
    ) {
      return false;
    }
    return true;
  }

  if (
    typeof targetParentId === "number" &&
    targetParentId !== dragItem.parentId &&
    insertParentChildren?.includes(dragItem.itemId)
  ) {
    return false;
  }

  if (
    typeof targetParentId === "number" &&
    targetParentId === dragItem.parentId &&
    targetParentIsRoot === dragItem.isRoot
  ) {
    return true;
  }

  return true;
};

export const getAdjustedTreeInsertIndex = ({
  children,
  dragId,
  insertIndex,
}: {
  children: number[];
  dragId: number;
  insertIndex: number;
}) => {
  const previousIndex = children.findIndex(id => id === dragId);
  const adjustedIndex =
    previousIndex >= 0 && previousIndex < insertIndex ? insertIndex - 1 : insertIndex;
  return Math.max(0, Math.min(adjustedIndex, children.length));
};

export const getMindMapNodeElement = (
  container: HTMLElement,
  nodeId: string | undefined,
  nodeSelector: string
) => {
  if (!nodeId) return null;
  return container.querySelector<HTMLElement>(`[${nodeSelector}="${nodeId}"]`);
};

export const getMindMapDropPlacement = <
  TItem extends { id: number; children: number[] },
  TNode extends MindMapTreeNodeLike<TItem>,
>({
  clientOffset,
  container,
  treeData,
  rootId,
  nodeSelector,
  rootSelector,
  dragItem,
}: {
  clientOffset: { x: number; y: number } | null;
  container: HTMLElement | null;
  treeData: MindMapTreeDataLike<TItem, TNode>;
  rootId: number;
  nodeSelector: string;
  rootSelector: string;
  dragItem?: IDragItem;
}): MindMapDropPlacement | null => {
  if (!clientOffset || !container) return null;
  const rootElement = container.querySelector<HTMLElement>(`[${rootSelector}="true"]`);
  const rootRect = rootElement?.getBoundingClientRect();
  if (rootRect && clientOffset.x < rootRect.left) {
    return null;
  }

  const nodeElements = Array.from(container.querySelectorAll<HTMLElement>(`[${nodeSelector}]`))
    .map(element => {
      const nodeId = element.getAttribute(nodeSelector);
      if (!nodeId) return null;
      const treeNode = treeData.nodeMap.get(nodeId);
      if (!treeNode) return null;
      if (treeNode.item.id === dragItem?.itemId) return null;
      const rect = element.getBoundingClientRect();
      return {
        nodeId,
        treeNode,
        rect,
        midY: rect.top + rect.height / 2,
        distanceX: getRectDistanceX(rect, clientOffset.x),
        distanceY: getRectDistanceY(rect, clientOffset.y),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  if (nodeElements.length === 0) {
    return {
      parentId: rootId,
      parentIsRoot: true,
      insertIndex: treeData.nodes.length,
      indicator: "inside",
    };
  }

  const minDistanceX = Math.min(...nodeElements.map(item => item.distanceX));
  const minDistanceY = Math.min(...nodeElements.map(item => item.distanceY));
  if (minDistanceX > MAX_DROP_SNAP_DISTANCE_X || minDistanceY > MAX_DROP_SNAP_DISTANCE_Y) {
    return null;
  }

  const horizontalCandidates = nodeElements
    .filter(item => item.distanceX <= minDistanceX + HORIZONTAL_TARGET_TOLERANCE)
    .sort((a, b) => a.midY - b.midY);
  const target =
    horizontalCandidates.find(item => clientOffset.y < item.midY) ??
    horizontalCandidates[horizontalCandidates.length - 1];
  const { treeNode: targetNode, rect } = target;
  const targetIndex = targetNode.parentChildren.findIndex(id => id === targetNode.item.id);
  if (targetIndex < 0) return null;
  const offsetY = clientOffset.y - rect.top;
  const isInside = offsetY >= rect.height * 0.25 && offsetY <= rect.height * 0.75;
  if (isInside) {
    return {
      parentId: targetNode.item.id,
      parentIsRoot: false,
      insertIndex: targetNode.children.length,
      indicator: "inside",
      referenceNodeId: targetNode.nodeId,
      parentNodeId: targetNode.nodeId,
    };
  }
  const isBefore = offsetY < rect.height / 2;
  const insertIndex = isBefore ? targetIndex : targetIndex + 1;
  const siblings = targetNode.parentNodeId
    ? treeData.nodeMap.get(targetNode.parentNodeId)?.children || []
    : treeData.nodes;

  return {
    parentId: targetNode.parentId,
    parentIsRoot: targetNode.isRoot,
    insertIndex,
    indicator: isBefore ? "top" : "bottom",
    referenceNodeId: targetNode.nodeId,
    parentNodeId: targetNode.parentNodeId,
    beforeNodeId: siblings[insertIndex - 1]?.nodeId,
    afterNodeId: siblings[insertIndex]?.nodeId,
  };
};

export const buildMindMapDropGuide = ({
  placement,
  container,
  nodeSelector,
  rootSelector,
}: {
  placement: MindMapDropPlacement | null;
  container: HTMLElement | null;
  nodeSelector: string;
  rootSelector: string;
}): MindMapDropGuide => {
  if (!placement || !container || placement.indicator === "inside" || !placement.referenceNodeId) {
    return null;
  }
  const referenceElement = getMindMapNodeElement(
    container,
    placement.referenceNodeId,
    nodeSelector
  );
  const parentSelector = placement.parentIsRoot
    ? `[${rootSelector}="true"]`
    : `[${nodeSelector}="${placement.parentNodeId}"]`;
  const parentElement = container.querySelector<HTMLElement>(parentSelector);
  if (!referenceElement || !parentElement) return null;

  const containerRect = container.getBoundingClientRect();
  const referenceRect = referenceElement.getBoundingClientRect();
  const parentRect = parentElement.getBoundingClientRect();
  const beforeRect = getMindMapNodeElement(
    container,
    placement.beforeNodeId,
    nodeSelector
  )?.getBoundingClientRect();
  const afterRect = getMindMapNodeElement(
    container,
    placement.afterNodeId,
    nodeSelector
  )?.getBoundingClientRect();
  const fallbackEndY = placement.indicator === "top" ? referenceRect.top : referenceRect.bottom;
  const slotY =
    beforeRect && afterRect
      ? (beforeRect.bottom + afterRect.top) / 2
      : beforeRect
        ? beforeRect.bottom + 12
        : afterRect
          ? afterRect.top - 12
          : fallbackEndY;
  const start = {
    x: parentRect.right - containerRect.left,
    y: parentRect.top + parentRect.height / 2 - containerRect.top,
  };
  const end = {
    x: referenceRect.left - containerRect.left,
    y: slotY - containerRect.top,
  };
  const deltaX = Math.abs(end.x - start.x);
  const controlX = start.x + deltaX / 2;
  return {
    d: `M ${start.x} ${start.y} C ${controlX} ${start.y}, ${controlX} ${end.y}, ${end.x} ${end.y}`,
    width: containerRect.width,
    height: containerRect.height,
  };
};
