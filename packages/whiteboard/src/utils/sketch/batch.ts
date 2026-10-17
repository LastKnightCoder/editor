import type Board from "../../Board";
import type { BoardElement, MindNodeElement, Operation, SetNodePatch } from "../../types";
import MindUtil from "../MindUtil";
import PathUtil from "../PathUtil";
import { isSketchableType } from "./resolve";

export { patchSketch } from "./patch";

/**
 * 多选笔触的作用对象：思维导图节点归到根节点（覆盖存在根上），重复的根只算一次；
 * 不跟随手绘的类型（手写）剔除。
 */
export function getSketchTargets(board: Board, elements: BoardElement[]): BoardElement[] {
  const byId = new Map<string, BoardElement>();
  elements.forEach(el => {
    const owner =
      el.type === "mind-node" ? (MindUtil.getRoot(board, el as MindNodeElement) ?? el) : el;
    if (board.extensions?.supportsSketch(owner.type) ?? isSketchableType(owner.type))
      byId.set(owner.id, owner);
  });
  return [...byId.values()];
}

/** 按元素生成只改 sketch / fillStyle 的 set_node；recipe 返回 null 表示该元素不改 */
export function buildSketchOps(
  board: Board,
  targets: BoardElement[],
  recipe: (el: BoardElement) => Partial<Pick<SetNodePatch, "sketch" | "fillStyle">> | null
): Operation[] {
  const ops: Operation[] = [];
  targets.forEach(target => {
    const path = PathUtil.getPathByElement(board, target);
    const current = path && PathUtil.getElementByPath(board, path);
    if (!path || !current) return;
    const patch = recipe(current);
    if (!patch) return;
    const properties = Object.fromEntries(Object.keys(patch).map(key => [key, current[key]]));
    ops.push({ type: "set_node", path, properties, newProperties: patch });
  });
  return ops;
}
