/**
 * 白板「专注力手册」的画布内容（板坐标，原点在纸面左上角）：左边画框「为什么分心」里三个形状和两条箭头，
 * 一条强调箭头连到右边的思维导图「专注」，最右是嵌入的 Deep Work 文章卡。内容取自官网白板区块。
 * 导图按 packages/whiteboard 的布局常量排：水平间距 36、二级子树间距 24、三级间距 16，节点高 = 字号 × 1.57 + 32。
 */
import type { ComposeDoc } from "./compose";
import { ARTICLE } from "./deepwork";

export type BoardRect = { x: number; y: number; width: number; height: number };

export type BoardShape = BoardRect & {
  id: string;
  kind: "rect" | "ellipse" | "diamond";
  label: string;
  /** 普通画风的实心底、手绘画风的填充色与填充样式 */
  fill: string;
  sketchFill: string;
  fillStyle: "hatch" | "cross" | "solid";
  stroke: string;
};

export type BoardArrow = { id: string; from: [number, number]; to: [number, number]; accent?: boolean };

export type MindNode = BoardRect & { id: string; text: string; level: number; branch: number; parent?: string };

export const BOARD_FRAME = { id: "frame-distract", name: "为什么分心", x: 40, y: 190, width: 420, height: 380 };

export const BOARD_SHAPES: BoardShape[] = [
  {
    id: "shape-notify",
    kind: "rect",
    label: "通知",
    x: 80,
    y: 258,
    width: 130,
    height: 64,
    fill: "var(--tau-tag-5-soft)",
    sketchFill: "var(--tau-tag-5)",
    fillStyle: "hatch",
    stroke: "var(--tau-tag-5)",
  },
  {
    id: "shape-switch",
    kind: "ellipse",
    label: "任务切换",
    x: 270,
    y: 252,
    width: 156,
    height: 76,
    fill: "var(--tau-tag-2-soft)",
    sketchFill: "var(--tau-tag-2)",
    fillStyle: "cross",
    stroke: "var(--tau-tag-2)",
  },
  {
    id: "shape-residue",
    kind: "diamond",
    label: "注意力残留",
    x: 150,
    y: 430,
    width: 210,
    height: 104,
    fill: "var(--tau-tag-4-soft)",
    sketchFill: "var(--tau-tag-4-soft)",
    fillStyle: "solid",
    stroke: "var(--tau-tag-4)",
  },
];

export const BOARD_ARROWS: BoardArrow[] = [
  { id: "arrow-notify", from: [145, 326], to: [222, 446] },
  { id: "arrow-switch", from: [348, 332], to: [288, 446] },
];

const FONT = 15;
const NODE_H = FONT * 1.57 + 32;
const nodeWidth = (text: string) => [...text].length * FONT + 32;
const MARGIN_X = 36;
const GAP_L2 = 24;
const GAP_L3 = 16;

export const MIND_FONT = FONT;

const TREE = {
  root: "专注",
  branches: [
    { text: "改环境", children: ["书桌与光", "手机放远"] },
    { text: "养习惯", children: ["开工仪式", "番茄钟"] },
    { text: "少工具", children: ["只开一个窗口"] },
  ],
};

function layoutMind(rootX: number, centerY: number): MindNode[] {
  const subtreeHeight = (count: number) => count * NODE_H + (count - 1) * GAP_L3;
  const total = TREE.branches.reduce((n, b) => n + subtreeHeight(b.children.length), 0) + GAP_L2 * (TREE.branches.length - 1);
  const rootW = nodeWidth(TREE.root);
  const nodes: MindNode[] = [{ id: "mind-root", text: TREE.root, level: 1, branch: -1, x: rootX, y: centerY - NODE_H / 2, width: rootW, height: NODE_H }];
  const l2X = rootX + rootW + MARGIN_X;
  let top = centerY - total / 2;
  TREE.branches.forEach((branch, b) => {
    const h = subtreeHeight(branch.children.length);
    const w2 = nodeWidth(branch.text);
    const id = `mind-b${b}`;
    nodes.push({ id, text: branch.text, level: 2, branch: b, parent: "mind-root", x: l2X, y: top + h / 2 - NODE_H / 2, width: w2, height: NODE_H });
    branch.children.forEach((text, c) => {
      nodes.push({ id: `${id}-${c}`, text, level: 3, branch: b, parent: id, x: l2X + w2 + MARGIN_X, y: top + c * (NODE_H + GAP_L3), width: nodeWidth(text), height: NODE_H });
    });
    top += h + GAP_L2;
  });
  return nodes;
}

export const MIND_NODES = layoutMind(540, 380);
const MIND_ROOT = MIND_NODES[0];

/** 画框右缘 → 导图根节点的强调箭头 */
export const BOARD_LINK: BoardArrow = {
  id: "arrow-to-mind",
  from: [BOARD_FRAME.x + BOARD_FRAME.width + 8, MIND_ROOT.y + MIND_ROOT.height / 2],
  to: [MIND_ROOT.x - 8, MIND_ROOT.y + MIND_ROOT.height / 2],
  accent: true,
};

/** 嵌入的文章卡（DocumentElement，article 280×360） */
export const BOARD_DOC: ComposeDoc = {
  id: "doc-deepwork",
  kind: "article",
  tags: [],
  title: ARTICLE.title,
  body: ["我们总以为专注是一种意志力。读完 Deep Work 才发现，它更像一种环境：你把什么放在手边，把什么放到另一个房间……"],
  why: "",
  updated: "10月12日",
  cover: 6,
  x: 890,
  y: 200,
  width: 280,
  height: 360,
};

/** 叶子「书桌与光」到文章卡的虚线引用 */
const DESK = MIND_NODES.find(n => n.text === "书桌与光")!;
export const BOARD_REF: BoardArrow = { id: "ref-desk", from: [DESK.x + DESK.width + 6, DESK.y + DESK.height / 2], to: [BOARD_DOC.x - 8, BOARD_DOC.y + 120] };

const bbox = (rects: BoardRect[], pad = 0): BoardRect => {
  const minX = Math.min(...rects.map(r => r.x)) - pad;
  const minY = Math.min(...rects.map(r => r.y)) - pad;
  const maxX = Math.max(...rects.map(r => r.x + r.width)) + pad;
  const maxY = Math.max(...rects.map(r => r.y + r.height)) + pad;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

/** 全部内容（含画框上方的名签） */
export const BOARD_BOUNDS = bbox([{ ...BOARD_FRAME, y: BOARD_FRAME.y - 50, height: BOARD_FRAME.height + 50 }, ...MIND_NODES, BOARD_DOC]);

/** 演示序列：第 1 帧画框（含名签），第 2 帧导图 + 文章卡 */
export const BOARD_SLIDES: BoardRect[] = [{ ...BOARD_FRAME, y: BOARD_FRAME.y - 50, height: BOARD_FRAME.height + 50 }, bbox([...MIND_NODES, BOARD_DOC])];

export const BOARD_TEXT = [BOARD_FRAME.name, ...BOARD_SHAPES.map(s => s.label), ...MIND_NODES.map(n => n.text)].join("");
