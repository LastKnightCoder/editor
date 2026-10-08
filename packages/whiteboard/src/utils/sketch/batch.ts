import type Board from "../../Board";
import type {
  BoardElement,
  ElementSketch,
  MindNodeElement,
  Operation,
  SetNodePatch,
} from "../../types";
import MindUtil from "../MindUtil";
import PathUtil from "../PathUtil";
import { isSketchableType } from "./resolve";

type SketchPatch = Partial<Record<keyof ElementSketch, unknown>>;

/** 合并覆盖：值为 undefined 的字段删除，全部删空则返回 undefined（回到完全跟随页面） */
export function patchSketch(
  sketch: ElementSketch | undefined,
  patch: SketchPatch
): ElementSketch | undefined {
  const next: Record<string, unknown> = { ...(sketch ?? {}), ...patch };
  Object.keys(next).forEach(key => next[key] === undefined && delete next[key]);
  return Object.keys(next).length ? (next as ElementSketch) : undefined;
}

/**
 * 多选笔触的作用对象：思维导图节点归到根节点（覆盖存在根上），重复的根只算一次；
 * 不跟随手绘的类型（手写）剔除。
 */
export function getSketchTargets(board: Board, elements: BoardElement[]): BoardElement[] {
  const byId = new Map<string, BoardElement>();
  elements.forEach(el => {
    const owner =
      el.type === "mind-node" ? (MindUtil.getRoot(board, el as MindNodeElement) ?? el) : el;
    if (isSketchableType(owner.type)) byId.set(owner.id, owner);
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
