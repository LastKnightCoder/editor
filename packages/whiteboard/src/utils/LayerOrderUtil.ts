import Board from "../Board";
import { BoardElement, MoveNodeOperation, Operation } from "../types";
import BoardOperations from "./BoardOperations";
import PathUtil from "./PathUtil";
import BoardUtil from "./BoardUtil";

export type LayerOrderAction = "move-up" | "move-down" | "move-top" | "move-bottom";

export interface LayerOrderActionState {
  moveUpDisabled: boolean;
  moveDownDisabled: boolean;
  moveTopDisabled: boolean;
  moveBottomDisabled: boolean;
}

interface LayerOrderPlan {
  disabled: boolean;
  moveOps: MoveNodeOperation[];
  relayoutTargets: string[];
}

const ACTIONS: LayerOrderAction[] = ["move-up", "move-down", "move-top", "move-bottom"];

const uniqueElements = (elements: BoardElement[]): BoardElement[] => {
  const seen = new Set<string>();
  const result: BoardElement[] = [];
  elements.forEach(element => {
    if (!element || seen.has(element.id)) return;
    seen.add(element.id);
    result.push(element);
  });
  return result;
};

const isSamePath = (a: number[], b: number[]): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

const isSameOrder = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

const sortByIndexAsc = (a: number, b: number) => a - b;

const transformVisualOrder = (
  visualOrder: string[],
  selectedIds: Set<string>,
  action: LayerOrderAction
): string[] => {
  if (visualOrder.length <= 1) return visualOrder;

  const selectedInOrder = visualOrder.filter(id => selectedIds.has(id));
  const unselectedInOrder = visualOrder.filter(id => !selectedIds.has(id));
  const next = [...visualOrder];

  if (action === "move-top") {
    return [...selectedInOrder, ...unselectedInOrder];
  }

  if (action === "move-bottom") {
    return [...unselectedInOrder, ...selectedInOrder];
  }

  if (action === "move-up") {
    for (let i = 1; i < next.length; i++) {
      if (selectedIds.has(next[i]) && !selectedIds.has(next[i - 1])) {
        const tmp = next[i - 1];
        next[i - 1] = next[i];
        next[i] = tmp;
      }
    }
    return next;
  }

  for (let i = next.length - 2; i >= 0; i--) {
    if (selectedIds.has(next[i]) && !selectedIds.has(next[i + 1])) {
      const tmp = next[i + 1];
      next[i + 1] = next[i];
      next[i] = tmp;
    }
  }
  return next;
};

const buildMoveOpsFromTargetOrder = (
  parentPath: number[],
  currentOrder: string[],
  targetOrder: string[]
): {
  moveOps: MoveNodeOperation[];
  movedIds: string[];
} => {
  const simulated = [...currentOrder];
  const ops: MoveNodeOperation[] = [];
  const movedIds: string[] = [];

  for (let targetIndex = 0; targetIndex < targetOrder.length; targetIndex++) {
    const targetId = targetOrder[targetIndex];
    const currentIndex = simulated.indexOf(targetId);
    if (currentIndex < 0 || currentIndex === targetIndex) continue;

    simulated.splice(currentIndex, 1);
    simulated.splice(targetIndex, 0, targetId);

    ops.push({
      type: "move_node",
      path: [...parentPath, currentIndex],
      newPath: [...parentPath, targetIndex],
    });
    movedIds.push(targetId);
  }

  return {
    moveOps: ops,
    movedIds,
  };
};

const buildPlan = (
  board: Board,
  rawTargets: BoardElement[],
  action: LayerOrderAction
): LayerOrderPlan => {
  const targets = uniqueElements(rawTargets);
  if (targets.length === 0) {
    return { disabled: true, moveOps: [], relayoutTargets: [] };
  }

  const targetPaths = targets
    .map(element => PathUtil.getPathByElement(board, element))
    .filter((path): path is number[] => Array.isArray(path) && path.length > 0);

  if (targetPaths.length !== targets.length) {
    return { disabled: true, moveOps: [], relayoutTargets: [] };
  }

  const parentPath = targetPaths[0].slice(0, -1);
  const sameParent = targetPaths.every(path => isSamePath(path.slice(0, -1), parentPath));
  if (!sameParent) {
    return { disabled: true, moveOps: [], relayoutTargets: [] };
  }

  const isTopLevel = parentPath.length === 0;
  const parentElement = !isTopLevel ? PathUtil.getElementByPath(board, parentPath) : null;
  if (!isTopLevel && !parentElement) {
    return { disabled: true, moveOps: [], relayoutTargets: [] };
  }
  const siblings = isTopLevel
    ? board.children
    : parentElement?.children
      ? parentElement.children
      : [];
  if (siblings.length <= 1) {
    return { disabled: true, moveOps: [], relayoutTargets: [] };
  }

  const currentOrder = siblings.map(child => child.id);
  const selectedIds = new Set(targets.map(target => target.id));
  const selectedIndices = targetPaths.map(path => path[path.length - 1]).sort(sortByIndexAsc);

  if (selectedIndices.some(index => index < 0 || index >= siblings.length)) {
    return { disabled: true, moveOps: [], relayoutTargets: [] };
  }

  const isReversed = isTopLevel
    ? true
    : board.capabilityService.shouldReverseChildren(parentElement as BoardElement);
  const visualOrder = isReversed ? [...currentOrder].reverse() : [...currentOrder];
  const nextVisualOrder = transformVisualOrder(visualOrder, selectedIds, action);
  const targetOrder = isReversed ? [...nextVisualOrder].reverse() : [...nextVisualOrder];

  if (isSameOrder(currentOrder, targetOrder)) {
    return { disabled: true, moveOps: [], relayoutTargets: [] };
  }

  const { moveOps, movedIds } = buildMoveOpsFromTargetOrder(parentPath, currentOrder, targetOrder);
  if (moveOps.length === 0) {
    return { disabled: true, moveOps: [], relayoutTargets: [] };
  }

  // 需要 relayout 的元素（如思维导图节点），重排细节由其 movement.afterMove 能力处理
  const relayoutTargets = Array.from(new Set(movedIds)).filter(id => {
    const element = BoardUtil.getElementById(board, id);
    return element && board.capabilityService.requiresRelayout(element);
  });

  return {
    disabled: false,
    moveOps,
    relayoutTargets,
  };
};

export const getLayerOrderActionState = (
  board: Board,
  targets: BoardElement[]
): LayerOrderActionState => {
  const plans = new Map<LayerOrderAction, LayerOrderPlan>();
  ACTIONS.forEach(action => {
    plans.set(action, buildPlan(board, targets, action));
  });

  return {
    moveUpDisabled: plans.get("move-up")!.disabled,
    moveDownDisabled: plans.get("move-down")!.disabled,
    moveTopDisabled: plans.get("move-top")!.disabled,
    moveBottomDisabled: plans.get("move-bottom")!.disabled,
  };
};

export const executeLayerOrderAction = (
  board: Board,
  targets: BoardElement[],
  action: LayerOrderAction
): boolean => {
  const plan = buildPlan(board, targets, action);
  if (plan.disabled || plan.moveOps.length === 0) {
    return false;
  }

  const ops: Operation[] = plan.moveOps.map(op => {
    const moveOp: Operation = { ...op };
    BoardOperations.markAsNormalized(moveOp);
    return moveOp;
  });
  board.apply(ops, true);

  plan.relayoutTargets.forEach(elementId => {
    const element = BoardUtil.getElementById(board, elementId);
    if (element) {
      board.capabilityService.notifyAfterMove(element);
    }
  });

  return true;
};

export default {
  getLayerOrderActionState,
  executeLayerOrderAction,
};
