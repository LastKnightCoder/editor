import { createStore } from "zustand/vanilla";

import type { ArrowElement, Board, BoardElement, MindNodeElement, Point } from "../types";
import type { Operation } from "../types/operation";
import { EArrowLineType, EMarkerType } from "../types";
import { ARROW_CONNECT_ID } from "../constants/arrow";
import BoardUtil from "./BoardUtil.ts";
import BoardOperations from "./BoardOperations";
import MindUtil from "./MindUtil.ts";
import { createLinkArrow } from "./placeElements";
import { isHiddenChild } from "./mind-layout/tree-shape";

/** 联系线模式：已选起点，等待点选终点 */
export interface MindRelationState {
  sourceId: string | null;
  pointer: Point | null;
}

const stores = new WeakMap<Board, ReturnType<typeof createRelationStore>>();
const createRelationStore = () =>
  createStore<MindRelationState>(() => ({ sourceId: null, pointer: null }));

/** 每块白板一份联系线模式状态：快捷键/菜单写入，MindPlugin 处理点击，浮层订阅绘制 */
export function relationStoreOf(board: Board) {
  let store = stores.get(board);
  if (!store) {
    store = createRelationStore();
    stores.set(board, store);
  }
  return store;
}

export const startMindRelation = (board: Board, sourceId: string) =>
  relationStoreOf(board).setState({ sourceId, pointer: null });

export const cancelMindRelation = (board: Board) =>
  relationStoreOf(board).setState({ sourceId: null, pointer: null });

/** 节点之间的联系线：曲线、灰色虚线、终点开口箭头 */
export function createMindRelation(from: MindNodeElement, to: MindNodeElement): ArrowElement {
  return {
    ...createLinkArrow(from as unknown as BoardElement, to as unknown as BoardElement),
    lineType: EArrowLineType.CURVE,
    lineWidth: 1.6,
    themeColorId: "gray",
    dashed: true,
    dashArray: [6, 4],
    animated: false,
    source: {
      marker: EMarkerType.None,
      bindId: from.id,
      connectId: ARROW_CONNECT_ID.CENTER,
    },
    target: {
      marker: EMarkerType.OpenArrow,
      bindId: to.id,
      connectId: ARROW_CONNECT_ID.CENTER,
    },
  };
}

type RelationEnd = { node: MindNodeElement; visible: MindNodeElement; hidden: boolean };
const indexes = new WeakMap<readonly BoardElement[], Map<string, RelationEnd>>();

/** 画布树不可变；一次快照共用索引，折叠、结构或坐标变更后的新树重新计算。 */
function relationIndex(children: readonly BoardElement[]) {
  const index = indexes.get(children);
  if (index) return index;
  const created = new Map<string, RelationEnd>();
  const walk = (
    nodes: readonly BoardElement[],
    parent?: MindNodeElement,
    hidden?: MindNodeElement
  ) => {
    for (const node of nodes) {
      if (node.type === "mind-node") {
        const mind = node as MindNodeElement;
        const visible = hidden ?? (parent && isHiddenChild(parent, mind) ? parent : mind);
        created.set(mind.id, { node: mind, visible, hidden: visible !== mind });
        walk(mind.children ?? [], mind, visible === mind ? undefined : visible);
      } else if (node.children) walk(node.children);
    }
  };
  walk(children);
  indexes.set(children, created);
  return created;
}

/** 两端都绑在思维导图节点上的箭头 */
export const isMindRelation = (board: Board, arrow: ArrowElement) =>
  Boolean(
    arrow.source.bindId &&
    arrow.target.bindId &&
    relationIndex(board.children).has(arrow.source.bindId) &&
    relationIndex(board.children).has(arrow.target.bindId)
  );

/** 节点被收起时联系线改接到最近的可见祖先；返回实际显示的节点和是否被收起 */
export function visibleRelationEnd(board: Board, node: MindNodeElement, children = board.children) {
  const end = relationIndex(children).get(node.id);
  if (!end?.hidden) return { node, hidden: false };
  const dx = node.x - end.node.x,
    dy = node.y - end.node.y;
  return {
    node: dx || dy ? { ...end.visible, x: end.visible.x + dx, y: end.visible.y + dy } : end.visible,
    hidden: true,
  };
}

/** 删除这些节点时一并删掉的联系线（两端都在导图节点上的顶层箭头），下标从大到小 */
export function relationRemovals(
  board: Board,
  removedIds: ReadonlySet<string>,
  skipIds: ReadonlySet<string> = new Set()
): Operation[] {
  return board.children
    .map((element, index) => ({ element, index }))
    .filter(({ element }) => {
      if (element.type !== "arrow" || skipIds.has(element.id)) return false;
      const arrow = element as ArrowElement;
      if (!isMindRelation(board, arrow)) return false;
      return removedIds.has(arrow.source.bindId!) || removedIds.has(arrow.target.bindId!);
    })
    .sort((a, b) => b.index - a.index)
    .map(({ element, index }) => ({ type: "remove_node" as const, path: [index], node: element }));
}

/** 节点子树里全部 id（含自身） */
export function subtreeIds(nodes: readonly MindNodeElement[]) {
  const ids = new Set<string>();
  nodes.forEach(node => MindUtil.dfs(node, { before: current => void ids.add(current.id) }));
  return ids;
}

/** 旧树里有、新树里没有的节点 id（含连带删除的概要） */
export function removedNodeIds(oldRoot: MindNodeElement, newRoot: MindNodeElement) {
  const kept = subtreeIds([newRoot]);
  return new Set([...subtreeIds([oldRoot])].filter(id => !kept.has(id)));
}

/** 导图联系线的透明度：任一端被收起时变淡，其余箭头不受影响 */
export function mindRelationOpacity(board: Board, arrow: ArrowElement) {
  if (!isMindRelation(board, arrow)) return undefined;
  const index = relationIndex(board.children);
  const hidden = [arrow.source.bindId, arrow.target.bindId].some(id => id && index.get(id)?.hidden);
  return hidden ? 0.4 : 0.85;
}

/** 结构操作造成的实际删除（不含仍存活的移动节点）连同联系线一批提交。 */
export function withMindRelationRemovals(board: Board, operations: Operation[]): Operation[] {
  BoardUtil.normalizeOperations(operations);
  const next = BoardOperations.applyToChildren(board.children, operations);
  const collect = (nodes: BoardElement[]) => {
    const ids = new Set<string>();
    const walk = (elements: BoardElement[]) => {
      for (const element of elements) {
        if (element.type === "mind-node") ids.add(element.id);
        if (element.children) walk(element.children);
      }
    };
    walk(nodes);
    return ids;
  };
  const kept = collect(next);
  const removed = new Set([...collect(board.children)].filter(id => !kept.has(id)));
  const removals = relationRemovals(board, removed).flatMap(operation => {
    if (operation.type !== "remove_node") return [];
    const index = next.findIndex(element => element.id === operation.node.id);
    return index < 0 ? [] : [{ ...operation, path: [index] }];
  });
  return [...operations, ...BoardUtil.normalizeOperations(removals)];
}
