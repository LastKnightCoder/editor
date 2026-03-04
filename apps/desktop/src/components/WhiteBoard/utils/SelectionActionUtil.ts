import { Board, BoardElement, MindNodeElement, Operation } from "../types";
import { MindUtil } from "./MindUtil";
import { PathUtil } from "./PathUtil";
import { BoardUtil } from "./BoardUtil";
import { isValid } from "./common";

export const deleteBoardElements = (
  board: Board,
  elements: BoardElement[],
): boolean => {
  if (elements.length === 0) return false;

  const selectedIds = new Set(elements.map((element) => element.id));

  const mindNodes = elements.filter(
    (element) => element.type === "mind-node",
  ) as MindNodeElement[];

  const roots = mindNodes
    .map((node) => {
      const root = MindUtil.getRoot(board, node);
      if (!root) return null;
      return {
        root,
        node,
      };
    })
    .filter(isValid);

  const rootsMap = new Map<MindNodeElement, MindNodeElement[]>();
  roots.forEach(({ root, node }) => {
    if (!rootsMap.has(root)) {
      rootsMap.set(root, []);
    }
    rootsMap.get(root)?.push(node);
  });

  const mindOps: Operation[] = [];
  const rootsToDelete: MindNodeElement[] = [];

  rootsMap.forEach((nodes, root) => {
    const rootPath = PathUtil.getPathByElement(board, root);
    if (!rootPath) return;
    if (selectedIds.has(root.id)) {
      rootsToDelete.push(root);
    } else {
      const newRoot = MindUtil.deleteNodes(root, nodes);
      mindOps.push(...BoardUtil.diffNode(root, newRoot, rootPath));
    }
  });

  const otherElements = elements.filter(
    (element) => element.type !== "mind-node",
  );

  const deleteTargets = [...otherElements, ...rootsToDelete];
  const ops: Operation[] = [];
  for (const element of deleteTargets) {
    const path = PathUtil.getPathByElement(board, element);
    if (!path) continue;
    ops.push({
      type: "remove_node",
      path,
      node: element,
    });
  }

  const finalOps = [...mindOps, ...ops];
  if (finalOps.length === 0) {
    return false;
  }

  // mindOps 来自 diffNode：需要跳过路径变换并按顺序执行，因此必须标记为 normalized。
  BoardUtil.normalizeOperations(mindOps);
  board.apply(finalOps);
  return true;
};

export default deleteBoardElements;
