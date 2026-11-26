import type { MindBoundary, MindNodeElement, MindRange } from "../../types/mind";
import type { MindBox, MindSide } from "./types";
import { createRangeResolver, isSummary, resolveRange, visibleChildren } from "./tree-shape";

/** 外框与括住的子树之间的留白；有标题时上方再让出一行 */
export const BOUNDARY_PAD = 9;
export const BOUNDARY_TITLE_SPACE = 20;
/** 括号离区间外缘的距离与括号尖的长度，概要节点再隔一段放在尖外 */
const BRACE_GAP = 12;
const BRACE_DEPTH = 17;
const SUMMARY_GAP = 30;
/** 括号加概要间隔在排列轴外侧额外占的宽度 */
export const SUMMARY_OFFSET = BRACE_GAP + SUMMARY_GAP;

interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const union = (a: Rect, b: Rect): Rect => ({
  x1: Math.min(a.x1, b.x1),
  y1: Math.min(a.y1, b.y1),
  x2: Math.max(a.x2, b.x2),
  y2: Math.max(a.y2, b.y2),
});

const toBox = (rect: Rect): MindBox => ({
  x: rect.x1,
  y: rect.y1,
  width: rect.x2 - rect.x1,
  height: rect.y2 - rect.y1,
});

const nodeRect = (node: MindBox): Rect => ({
  x1: node.x,
  y1: node.y,
  x2: node.x + node.width,
  y2: node.y + node.height,
});

/** 区间内的兄弟（不计概要）；端点失效时按 resolveRange 退化 */
export const rangeNodes = (parent: MindNodeElement, range: MindRange, bothSides: boolean) =>
  resolveRange(
    parent.children.filter(child => !isSummary(child)),
    range,
    bothSides
  );

/** 查询期间坐标不再变化；子树几何和兄弟索引在同一批范围查询中复用。 */
export function createRangeGeometry(bothSides: boolean) {
  const boxes = new Map<MindNodeElement, Rect>();
  const resolvers = new Map<MindNodeElement, ReturnType<typeof createRangeResolver>>();
  const resolve = (parent: MindNodeElement, range: MindRange) => {
    let resolver = resolvers.get(parent);
    if (!resolver) {
      const visible = new Set(visibleChildren(parent));
      const resolveAll = createRangeResolver(
        parent.children.filter(child => !isSummary(child)),
        bothSides
      );
      resolver = range => resolveAll(range).filter(child => visible.has(child));
      resolvers.set(parent, resolver);
    }
    return resolver(range);
  };
  const subtree = (node: MindNodeElement): Rect => {
    const cached = boxes.get(node);
    if (cached) return cached;
    let rect = nodeRect(node);
    for (const child of visibleChildren(node)) rect = union(rect, subtree(child));
    for (const boundary of node.boundaries ?? []) {
      const box = boundaryRect(node, boundary);
      if (box) rect = union(rect, box);
    }
    boxes.set(node, rect);
    return rect;
  };
  const rangeRect = (parent: MindNodeElement, range: MindRange): Rect | null => {
    const nodes = resolve(parent, range);
    return nodes.length ? nodes.map(subtree).reduce(union) : null;
  };
  const boundaryRect = (parent: MindNodeElement, boundary: MindBoundary): Rect | null => {
    const rect = rangeRect(parent, boundary);
    if (!rect) return null;
    const top = BOUNDARY_PAD + (boundary.title ? BOUNDARY_TITLE_SPACE : 0);
    return {
      x1: rect.x1 - BOUNDARY_PAD,
      y1: rect.y1 - top,
      x2: rect.x2 + BOUNDARY_PAD,
      y2: rect.y2 + BOUNDARY_PAD,
    };
  };
  return {
    subtreeBox: (node: MindNodeElement) => toBox(subtree(node)),
    rangeBox: (parent: MindNodeElement, range: MindRange) => {
      const rect = rangeRect(parent, range);
      return rect && toBox(rect);
    },
    boundaryBox: (parent: MindNodeElement, boundary: MindBoundary) => {
      const rect = boundaryRect(parent, boundary);
      return rect && toBox(rect);
    },
  };
}

export const subtreeBox = (node: MindNodeElement, bothSides: boolean) =>
  createRangeGeometry(bothSides).subtreeBox(node);

export const rangeBox = (parent: MindNodeElement, range: MindRange, bothSides: boolean) =>
  createRangeGeometry(bothSides).rangeBox(parent, range);

export const boundaryBox = (parent: MindNodeElement, boundary: MindBoundary, bothSides: boolean) =>
  createRangeGeometry(bothSides).boundaryBox(parent, boundary);

/**
 * 兄弟排布时外框需要的额外间距：before[i] 加在第 i 个兄弟之前，after[i] 加在其后。
 * 下标对应 siblings（参与排布的那组兄弟）；横排时标题在上方不占排列轴，withTitle 传 false。
 */
export function boundaryInsets(
  parent: MindNodeElement,
  siblings: MindNodeElement[],
  bothSides: boolean,
  withTitle = true
) {
  const before = siblings.map(() => 0);
  const after = siblings.map(() => 0);
  const resolve = createRangeResolver(
    parent.children.filter(child => !isSummary(child)),
    bothSides
  );
  const indexes = new Map(siblings.map((child, index) => [child.id, index]));
  for (const boundary of parent.boundaries ?? []) {
    const nodes = resolve(boundary);
    if (!nodes.length) continue;
    const first = indexes.get(nodes[0].id);
    const last = indexes.get(nodes[nodes.length - 1].id);
    if (first === undefined || last === undefined) continue;
    before[first] += BOUNDARY_PAD + (withTitle && boundary.title ? BOUNDARY_TITLE_SPACE : 0);
    after[last] += BOUNDARY_PAD;
  }
  return { before, after };
}

export type SummaryAxis = "x" | "y";

/**
 * 概要括号：axis 是兄弟排列的轴（y 为竖排，括号在区间外侧；x 为横排，括号在区间下方）。
 * 返回括号路径和概要节点应贴靠的点（节点在该点外侧居中）。
 */
export function summaryBrace(box: MindBox, axis: SummaryAxis, side: MindSide, summary?: MindBox) {
  if (axis === "x") {
    const by = box.y + box.height + BRACE_GAP;
    const x1 = box.x;
    const x2 = box.x + box.width;
    const mid = (x1 + x2) / 2;
    return {
      d:
        `M${x1} ${by} Q${x1} ${by + 9} ${x1 + 9} ${by + 9} H${mid - 7} Q${mid} ${by + 9} ${mid} ${by + BRACE_DEPTH} Q${mid} ${by + 9} ${mid + 7} ${by + 9} H${x2 - 9} Q${x2} ${by + 9} ${x2} ${by}` +
        (summary && summary.y > by + SUMMARY_GAP + 1
          ? ` M${mid} ${by + BRACE_DEPTH} V${summary.y - 8}`
          : ""),
      anchor: { x: mid, y: by + SUMMARY_GAP },
    };
  }
  const s = side === "left" ? -1 : 1;
  const bx = side === "left" ? box.x - BRACE_GAP : box.x + box.width + BRACE_GAP;
  const y1 = box.y;
  const y2 = box.y + box.height;
  const mid = (y1 + y2) / 2;
  const c = bx + s * 9;
  const edge = summary && (side === "left" ? summary.x + summary.width : summary.x);
  return {
    d:
      `M${bx} ${y1} Q${c} ${y1} ${c} ${y1 + 9} V${mid - 7} Q${c} ${mid} ${bx + s * BRACE_DEPTH} ${mid} Q${c} ${mid} ${c} ${mid + 7} V${y2 - 9} Q${c} ${y2} ${bx} ${y2}` +
      (edge !== undefined && (edge - bx) * s > SUMMARY_GAP + 1
        ? ` M${bx + s * BRACE_DEPTH} ${mid} H${edge - s * 8}`
        : ""),
    anchor: { x: bx + s * SUMMARY_GAP, y: mid },
  };
}

/** 按括号贴靠点放概要节点（只写它自己的 x/y，子节点由各布局随后排布） */
export function placeSummary(
  parent: MindNodeElement,
  summary: MindNodeElement,
  axis: SummaryAxis,
  side: MindSide,
  bothSides: boolean,
  geometry = createRangeGeometry(bothSides)
) {
  const box = summary.summaryRange && geometry.rangeBox(parent, summary.summaryRange);
  if (!box) return false;
  const { anchor } = summaryBrace(box, axis, side);
  if (axis === "x") {
    summary.x = anchor.x - summary.width / 2;
    summary.y = anchor.y;
  } else {
    summary.x = side === "left" ? anchor.x - summary.width : anchor.x;
    summary.y = anchor.y - summary.height / 2;
  }
  return true;
}
