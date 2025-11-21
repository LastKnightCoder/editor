import { Board, BoardElement, Operation } from "@/components/WhiteBoard/types";
import BoardOperations from "../../../utils/BoardOperations";
import BoardUtil from "../../../utils/BoardUtil";
import PathUtil from "../../../utils/PathUtil";
import MindUtil from "../../../utils/MindUtil";
import { FrameUtil } from "../../../utils/FrameUtil";
import { MindNodeElement } from "../../../types";
import { FrameElement } from "../../../types";

export type PreviewNodeInfo = {
  node: BoardElement;
  path: number[];
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

  if (targetRootInfo) {
    const actualRoot = BoardUtil.getElementById(
      board,
      targetRootInfo.node.id,
    ) as MindNodeElement | null;
    const rootPath = actualRoot && PathUtil.getPathByElement(board, actualRoot);
    if (actualRoot && rootPath) {
      const laidOut = MindUtil.layout(targetRootInfo.node as MindNodeElement);
      ops.push({
        type: "set_node",
        path: rootPath,
        properties: actualRoot,
        newProperties: laidOut,
      });
    }
  }

  if (sourceRootId && sourceRootId !== targetRootId) {
    const previewSource = findNodeInfoById(previewChildren, sourceRootId);
    if (previewSource && previewSource.node.type === "mind-node") {
      const actualSource = BoardUtil.getElementById(
        board,
        sourceRootId,
      ) as MindNodeElement | null;
      const sourcePath =
        actualSource && PathUtil.getPathByElement(board, actualSource);
      if (actualSource && sourcePath) {
        const relaid = MindUtil.layout(previewSource.node as MindNodeElement);
        ops.push({
          type: "set_node",
          path: sourcePath,
          properties: actualSource,
          newProperties: relaid,
        });
      }
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
    properties: latestFrame,
    newProperties: {
      ...(previewInfo.node as FrameElement),
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    },
  };
};
