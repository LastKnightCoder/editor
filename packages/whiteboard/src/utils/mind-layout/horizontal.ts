import type { MindNodeElement } from "../../types/mind";
import type { MindBox, MindLayout, MindLayoutId, MindSide } from "./types";
import { scoreOf } from "./score";
import { visibleChildren } from "./tree-shape";

const MARGIN_X = 36;
const MARGIN_Y: Record<string, number> = { "1": 24, "2": 16, "3": 8 };
const gapY = (level: number) => MARGIN_Y[level] || 8;

/**
 * 水平布局：思维导图按节点自己的 direction 分左右，逻辑图一律向右（不改写 direction，
 * 切回思维导图时恢复原来的左右分配）。
 */
export function createHorizontalLayout(id: MindLayoutId, bothSides: boolean): MindLayout {
  const sideOf = (node: Pick<MindNodeElement, "direction">): MindSide =>
    bothSides ? node.direction : "right";

  const place = (root: MindNodeElement) => {
    const onSide = (node: MindNodeElement, side: MindSide) =>
      visibleChildren(node).filter(child => sideOf(child) === side);
    const stackHeight = (nodes: MindNodeElement[], level: number) =>
      nodes.length
        ? nodes.reduce((sum, n) => sum + n.actualHeight, 0) + (nodes.length - 1) * gapY(level)
        : 0;

    const measure = (node: MindNodeElement) => {
      visibleChildren(node).forEach(measure);
      const left = stackHeight(onSide(node, "left"), node.level + 1);
      const right = stackHeight(onSide(node, "right"), node.level + 1);
      node.leftChildrenHeight = left;
      node.rightChildrenHeight = right;
      node.childrenHeight = Math.max(left, right);
      node.actualHeight = Math.max(node.childrenHeight, node.height);
    };

    const position = (node: MindNodeElement) => {
      for (const side of ["left", "right"] as const) {
        const total = side === "left" ? node.leftChildrenHeight : node.rightChildrenHeight;
        let top = node.y + node.height / 2 - total / 2;
        for (const child of onSide(node, side)) {
          child.x =
            side === "left" ? node.x - child.width - MARGIN_X : node.x + node.width + MARGIN_X;
          child.y = top + (child.actualHeight - child.height) / 2;
          top += child.actualHeight + gapY(child.level);
          position(child);
        }
      }
    };

    measure(root);
    position(root);
  };

  return {
    id,
    sides: bothSides ? ["left", "right"] : ["right"],
    place,
    connector(parent, child) {
      const left = sideOf(child) === "left";
      return {
        kind: "curve",
        from: { x: left ? parent.x : parent.x + parent.width, y: parent.y + parent.height / 2 },
        to: { x: left ? child.x + child.width : child.x, y: child.y + child.height / 2 },
      };
    },
    foldHandle(node, side) {
      const y = node.y + node.height / 2;
      const edge = side === "left" ? node.x : node.x + node.width;
      return { at: { x: side === "left" ? edge - 10 : edge + 10, y }, from: { x: edge, y } };
    },
    navigate(node, key) {
      if (key === "up") return "prev";
      if (key === "down") return "next";
      if (node.level === 1) return bothSides || key === "right" ? "child" : null;
      return (key === "left") === (sideOf(node) === "left") ? "child" : "parent";
    },
    siblingAxis: () => "y",
    dropDistance(dragged: MindBox, parent, direction, zoom) {
      const side = bothSides ? direction : "right";
      const parentRight = parent.x + parent.width;
      const draggedRight = dragged.x + dragged.width;
      const onSide = side === "right" ? dragged.x >= parentRight : draggedRight <= parent.x;
      if (!onSide) return null;
      const horizontalDistance =
        side === "right" ? dragged.x - parentRight : parent.x - draggedRight;
      const verticalDistance = Math.max(
        0,
        parent.y - (dragged.y + dragged.height),
        dragged.y - (parent.y + parent.height)
      );
      return {
        direction,
        horizontalDistance,
        verticalDistance,
        score: scoreOf(horizontalDistance, verticalDistance, zoom),
        connectionStart: {
          x: side === "right" ? parentRight : parent.x,
          y: parent.y + parent.height / 2,
        },
        connectionEnd: {
          x: side === "right" ? dragged.x : draggedRight,
          y: dragged.y + dragged.height / 2,
        },
      };
    },
  };
}
