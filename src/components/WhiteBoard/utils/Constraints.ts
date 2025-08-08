import { BoardElement } from "../types";

/**
 * 统一的嵌套约束：
 * - frame 不能嵌套 frame，且不能包含 arrow
 * - mind-node 只能包含 mind-node
 * - 其他情况默认允许
 */
export function canNest(parent: BoardElement, child: BoardElement): boolean {
  if (parent.type === "frame") {
    if (child.type === "frame") return false;
    if (child.type === "arrow") return false;
    return true;
  }

  if (parent.type === "mind-node") {
    return child.type === "mind-node";
  }

  return true;
}
