import { Board, BoardElement, Operation } from "@/components/WhiteBoard/types";
import BoardOperations from "../../../utils/BoardOperations";
import BoardUtil from "../../../utils/BoardUtil";
import MindUtil from "../../../utils/MindUtil";
import { FrameUtil } from "../../../utils/FrameUtil";
import { MindNodeElement } from "../../../types";
import { FrameElement } from "../../../types";

export type PreviewNodeInfo = {
  node: BoardElement;
  path: number[];
};

export const canDropElementIntoParent = (
  board: Board,
  parent: BoardElement | null,
  child: BoardElement,
): boolean => {
  if (!parent) return true;

  const capService = board.capabilityService;
  if (!capService.canContain(parent, child)) return false;

  const containment = capService.getContainmentCapability(child.type);
  return containment.canBeContainedBy
    ? containment.canBeContainedBy(parent)
    : true;
};

export const simulateChildrenAfterOps = (
  board: Board,
  ops: Operation[],
): BoardElement[] => {
  const clonedChildren = JSON.parse(JSON.stringify(board.children));
  const result = BoardOperations.applyOperations(
    { children: clonedChildren },
    ops,
    {
      skipSelectionOperations: true,
      skipViewPortOperations: true,
    },
  );
  return result.data.children;
};

export const findNodeInfoById = (
  nodes: BoardElement[],
  id: string,
  basePath: number[] = [],
): PreviewNodeInfo | null => {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node) continue;
    const currentPath = [...basePath, i];
    if (node.id === id) {
      return { node, path: currentPath };
    }
    if (node.children?.length) {
      const childResult = findNodeInfoById(node.children, id, currentPath);
      if (childResult) return childResult;
    }
  }
  return null;
};

export const getNodeByPathSnapshot = (
  nodes: BoardElement[],
  path: number[],
): BoardElement | null => {
  let currentChildren = nodes;
  let currentNode: BoardElement | null = null;
  for (const index of path) {
    currentNode = currentChildren[index];
    if (!currentNode) {
      return null;
    }
    currentChildren = currentNode.children ?? [];
  }
  return currentNode;
};

export const findMindRootInfo = (
  nodes: BoardElement[],
  path: number[],
): PreviewNodeInfo | null => {
  let currentPath = [...path];
  while (currentPath.length > 0) {
    const candidate = getNodeByPathSnapshot(nodes, currentPath);
    if (!candidate) return null;
    if (candidate.type === "mind-node") {
      const parentPath = currentPath.slice(0, -1);
      if (parentPath.length === 0) {
        return { node: candidate, path: currentPath };
      }
      const parent = getNodeByPathSnapshot(nodes, parentPath);
      if (!parent || parent.type !== "mind-node") {
        return { node: candidate, path: currentPath };
      }
    }
    currentPath = currentPath.slice(0, -1);
  }
  return null;
};

export const collectMindLayoutOpsFromPreview = (
  board: Board,
  previewChildren: BoardElement[],
  movedMindNodeId: string,
  sourceRootId?: string | null,
): Operation[] => {
  const ops: Operation[] = [];
  const movedInfo = findNodeInfoById(previewChildren, movedMindNodeId);
  const targetRootInfo =
    movedInfo && findMindRootInfo(previewChildren, movedInfo.path);
  const targetRootId = targetRootInfo?.node.id ?? null;

  // 关键点：这里必须只生成“布局 patch”，不能再生成结构 diff。
  // 因为结构变化（父子关系/顺序）已经通过 move_node 表达；若再用 diffNode(oldRoot, newRoot)
  // 会把结构变化重复表达一遍，容易在同一个 apply 里把树改坏（表现为节点丢失/布局错乱）。
  const actualInfoById = (() => {
    const map = new Map<string, { node: BoardElement; path: number[] }>();
    const dfs = (nodes: BoardElement[], basePath: number[]) => {
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (!node) continue;
        const path = [...basePath, i];
        map.set(node.id, { node, path });
        if (node.children?.length) {
          dfs(node.children, path);
        }
      }
    };
    dfs(board.children, []);
    return map;
  })();

  const collectLayoutPatchOps = (previewRoot: MindNodeElement) => {
    const laidOut = MindUtil.layout(previewRoot);
    const walk = (node: MindNodeElement) => {
      const actual = actualInfoById.get(node.id);
      if (actual) {
        ops.push(
          ...BoardUtil.diffNodePatchOnly(actual.node, node, actual.path),
        );
      }
      if (node.children?.length) {
        node.children.forEach((c) => walk(c));
      }
    };
    walk(laidOut);
  };

  if (targetRootInfo && targetRootInfo.node.type === "mind-node") {
    collectLayoutPatchOps(targetRootInfo.node as MindNodeElement);
  }

  if (sourceRootId && sourceRootId !== targetRootId) {
    const previewSource = findNodeInfoById(previewChildren, sourceRootId);
    if (previewSource && previewSource.node.type === "mind-node") {
      collectLayoutPatchOps(previewSource.node as MindNodeElement);
    }
  }

  return ops;
};

export const buildFrameResizeOp = (
  board: Board,
  previewChildren: BoardElement[],
  frameId: string,
  framePath: number[],
): Operation | null => {
  const previewInfo = findNodeInfoById(previewChildren, frameId);
  if (!previewInfo || previewInfo.node.type !== "frame") return null;
  const latestFrame = BoardUtil.getElementById(
    board,
    frameId,
  ) as FrameElement | null;
  if (!latestFrame) return null;
  const nonFrameChildren =
    previewInfo.node.children?.filter((child) => child.type !== "frame") ?? [];
  const bounds = FrameUtil.calculateFrameBounds(
    board,
    previewInfo.node as FrameElement,
    nonFrameChildren,
  );
  return {
    type: "set_node",
    path: framePath,
    properties: {
      x: latestFrame.x,
      y: latestFrame.y,
      width: latestFrame.width,
      height: latestFrame.height,
    },
    newProperties: {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    },
  };
};
