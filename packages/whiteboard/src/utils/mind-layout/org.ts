import type { MindLayout } from "./types";
import { scoreOf } from "./score";
import { stackChildren, summaryChildren, visibleChildren } from "./tree-shape";
import { boundaryInsets } from "./ranges";
import {
  columnConnector,
  columnDropDistance,
  columnFoldHandle,
  columnWidth,
  placeColumn,
  placeColumnSummaries,
  stemX,
} from "./indented";

const ROOT_GAP = 48;
const BRANCH_GAP = 32;
const CORNER = 8;

/** 组织结构图：主分支在根节点下方横排，每条主分支往下是一列缩进清单 */
export const orgLayout: MindLayout = {
  id: "org",
  sides: ["right"],
  place(root) {
    const branches = stackChildren(root);
    const widths = branches.map(columnWidth);
    const { before, after } = boundaryInsets(root, branches, false, false);
    const insets = [...before, ...after].reduce((sum, n) => sum + n, 0);
    const total =
      widths.reduce((sum, w) => sum + w, 0) +
      BRANCH_GAP * Math.max(0, branches.length - 1) +
      insets;
    const top = root.y + root.height + ROOT_GAP;
    let x = root.x + root.width / 2 - total / 2;
    let bottom = root.y + root.height;
    branches.forEach((branch, i) => {
      x += before[i];
      placeColumn(branch, x, top);
      bottom = Math.max(bottom, branch.y + branch.actualHeight);
      x += widths[i] + after[i] + BRANCH_GAP;
    });
    placeColumnSummaries(root, "x");
    for (const summary of summaryChildren(root))
      bottom = Math.max(bottom, summary.y + summary.actualHeight);
    root.actualHeight = bottom - root.y;
    root.childrenHeight = root.actualHeight - root.height;
    root.leftChildrenHeight = 0;
    root.rightChildrenHeight = root.childrenHeight;
  },
  connector(parent, child) {
    if (parent.level !== 1) return columnConnector(parent, child);
    const x1 = parent.x + parent.width / 2;
    const y1 = parent.y + parent.height;
    const x2 = stemX(child);
    const mid = y1 + ROOT_GAP / 2;
    if (Math.abs(x2 - x1) < CORNER * 2)
      return { kind: "path", d: `M ${x1} ${y1} V ${mid} H ${x2} V ${child.y}` };
    const s = x2 > x1 ? 1 : -1;
    return {
      kind: "path",
      d: `M ${x1} ${y1} V ${mid - CORNER} Q ${x1} ${mid} ${x1 + s * CORNER} ${mid} H ${x2 - s * CORNER} Q ${x2} ${mid} ${x2} ${mid + CORNER} V ${child.y}`,
    };
  },
  foldHandle(node) {
    if (node.level === 1) {
      const x = node.x + node.width / 2;
      const bottom = node.y + node.height;
      return { at: { x, y: bottom + 10 }, from: { x, y: bottom } };
    }
    return columnFoldHandle(node, node.level === 2);
  },
  navigate(node, key) {
    if (node.level === 1) return key === "down" ? "child" : null;
    if (node.level === 2) {
      if (key === "left") return "prev";
      if (key === "right") return "next";
      return key === "down" ? "child" : "parent";
    }
    if (key === "up") return "prev";
    if (key === "down") return "next";
    return key === "right" ? "child" : "parent";
  },
  siblingAxis: parentLevel => (parentLevel === 1 ? "x" : "y"),
  dropDistance(dragged, parent, direction, zoom) {
    if (parent.level !== 1) return columnDropDistance(dragged, parent, direction, zoom);
    const bottom = parent.y + parent.height;
    if (dragged.y < bottom) return null;
    const verticalDistance = Math.abs(dragged.y - (bottom + ROOT_GAP));
    // 横向落在现有主分支横排的范围内不扣分，排外才按距离计
    const row = visibleChildren(parent);
    const left = Math.min(parent.x, ...row.map(c => c.x));
    const right = Math.max(parent.x + parent.width, ...row.map(c => c.x + c.width));
    const center = dragged.x + dragged.width / 2;
    const horizontalDistance = Math.max(0, left - center, center - right);
    return {
      direction,
      horizontalDistance,
      verticalDistance,
      score: scoreOf(horizontalDistance, verticalDistance, zoom),
      connectionStart: { x: parent.x + parent.width / 2, y: bottom },
      connectionEnd: { x: stemX(dragged), y: dragged.y },
      connectionAxis: "y",
    };
  },
};
