import type { MindNodeElement } from "../../types/mind";
import type { MindBox, MindConnector, MindDropDistance } from "./types";
import { scoreOf } from "./score";
import { visibleChildren } from "./tree-shape";

/** 缩进列：子节点排在父节点下方并右缩进，树状图与组织结构图的三级以下共用 */
export const INDENT = 36;
const ROW_GAP = 10;
const CORNER = 6;

export const stemX = (node: MindBox) => node.x + Math.min(14, node.width / 2);

export function columnWidth(node: MindNodeElement): number {
  const kids = visibleChildren(node);
  return Math.max(node.width, kids.length ? INDENT + Math.max(...kids.map(columnWidth)) : 0);
}

/** 把 node 放到 (x, y)，子孙逐行向下排；actualHeight 记录整列高度 */
export function placeColumn(node: MindNodeElement, x: number, y: number) {
  node.x = x;
  node.y = y;
  let bottom = y + node.height;
  for (const child of visibleChildren(node)) {
    placeColumn(child, x + INDENT, bottom + ROW_GAP);
    bottom = child.y + child.actualHeight;
  }
  node.actualHeight = bottom - y;
  node.childrenHeight = node.actualHeight - node.height;
  node.leftChildrenHeight = 0;
  node.rightChildrenHeight = node.childrenHeight;
}

export function columnConnector(parent: MindBox, child: MindBox): MindConnector {
  const x = stemX(parent);
  const top = parent.y + parent.height;
  const y = child.y + child.height / 2;
  return {
    kind: "path",
    d: `M ${x} ${top} V ${y - CORNER} Q ${x} ${y} ${x + CORNER} ${y} H ${child.x}`,
  };
}

/** 列首（树状图的根、组织结构图的主分支）按钮在下方竖线上，其余在节点左侧的来线上 */
export function columnFoldHandle(node: MindBox, isHead: boolean) {
  if (isHead) {
    const x = stemX(node);
    const bottom = node.y + node.height;
    return { at: { x, y: bottom + 10 }, from: { x, y: bottom } };
  }
  const y = node.y + node.height / 2;
  return { at: { x: node.x - 11, y }, from: { x: node.x, y } };
}

/**
 * 被拖节点的左边需越过父节点的竖线，且落在父节点下方；
 * 纵向只要还在父节点这一列的范围内就不扣分，长列表里也能挂到父节点下。
 */
export function columnDropDistance(
  dragged: MindBox,
  parent: MindNodeElement,
  direction: MindNodeElement["direction"],
  zoom: number
): MindDropDistance | null {
  const bottom = parent.y + parent.height;
  if (dragged.x < parent.x + INDENT / 2 || dragged.y < parent.y + parent.height / 2) return null;
  const horizontalDistance = Math.abs(dragged.x - (parent.x + INDENT));
  const verticalDistance = Math.max(
    0,
    bottom - dragged.y,
    dragged.y - (parent.y + Math.max(parent.actualHeight, parent.height) + ROW_GAP * 2)
  );
  return {
    direction,
    horizontalDistance,
    verticalDistance,
    score: scoreOf(horizontalDistance, verticalDistance, zoom),
    connectionStart: { x: stemX(parent), y: bottom },
    connectionEnd: { x: dragged.x, y: dragged.y + dragged.height / 2 },
  };
}
