import { EArrowLineType, EMarkerType, type ArrowElement, type BoardElement } from "@tau/whiteboard";

// 还原「DOCKER PROCESS GROUP」进程关系图：圆形节点 + 虚线箭头 + 圆角容器。
const RADIUS = 75;

interface ProcessNode {
  id: string;
  name: string[];
  pid: string;
  cx: number;
  cy: number;
  fill: string;
}

const paragraph = (text: string, bold = false) => ({
  type: "paragraph",
  children: [{ type: "formatted", text, ...(bold ? { bold: true } : {}) }],
});

// 段落自带 1.25em 段后距，多行文字用同段软换行（\n）保持紧凑行距。
const nodeLabel = (name: string[], pid: string) => ({
  type: "paragraph",
  children: [
    { type: "formatted", text: `${name.join("\n")}\n`, bold: true },
    { type: "formatted", text: pid },
  ],
});

const nodes: ProcessNode[] = [
  { id: "init", name: ["init"], pid: "1", cx: 195, cy: 295, fill: "#62606b" },
  { id: "dockerd", name: ["dockerd"], pid: "29407", cx: 395, cy: 295, fill: "#76d7c4" },
  {
    id: "containerd",
    name: ["docker", "containerd"],
    pid: "1554",
    cx: 595,
    cy: 295,
    fill: "#fbd667",
  },
  {
    id: "shim",
    name: ["docker", "containerd", "shim"],
    pid: "5006",
    cx: 795,
    cy: 295,
    fill: "#f19c99",
  },
  { id: "bash-1", name: ["/bin/bash"], pid: "1", cx: 1005, cy: 175, fill: "#74a8c3" },
  { id: "bash-9", name: ["/bin/bash"], pid: "9", cx: 1005, cy: 372, fill: "#74a8c3" },
];

const circle = (node: ProcessNode): BoardElement => ({
  id: node.id,
  type: "geometry",
  geometryType: "circle",
  paths: ["M 1,0.5 A 0.5,0.5 0 1,0 0,0.5 A 0.5,0.5 0 1,0 1,0.5"],
  x: node.cx - RADIUS,
  y: node.cy - RADIUS,
  width: RADIUS * 2,
  height: RADIUS * 2,
  fill: node.fill,
  fillOpacity: 1,
  stroke: node.fill,
  strokeWidth: 0,
  strokeOpacity: 0,
  color: "#ffffff",
  extraInfo: {},
  text: {
    align: "center",
    content: [nodeLabel(node.name, node.pid)],
  },
});

const point = (id: string, side: "left" | "right") => {
  const node = nodes.find(item => item.id === id)!;
  return { x: node.cx + (side === "left" ? -RADIUS : RADIUS), y: node.cy };
};

const arrow = (from: string, to: string, lineType: EArrowLineType): ArrowElement => ({
  id: `arrow-${from}-${to}`,
  type: "arrow",
  lineType,
  source: { marker: EMarkerType.None, bindId: from, connectId: "right" },
  target: { marker: EMarkerType.Arrow, bindId: to, connectId: "left" },
  points: [point(from, "right"), point(to, "left")],
  lineWidth: 2,
  dashed: true,
  dashArray: [5, 4],
  themeColorId: "neutral",
});

export const dockerProcessGroup = (): BoardElement[] => [
  {
    id: "title",
    type: "richtext",
    x: 400,
    y: 20,
    width: 400,
    height: 50,
    maxWidth: 400,
    maxHeight: 1000,
    readonly: false,
    resized: false,
    content: [paragraph("DOCKER PROCESS GROUP", true)],
  },
  // 原图为虚线圆角框；图形暂不支持虚线描边，先用实线圆角矩形表达分组边界。
  {
    id: "process-group",
    type: "geometry",
    geometryType: "rectangle",
    paths: ["M 0 0 L 1 0 L 1 1 L 0 1 Z"],
    x: 698,
    y: 92,
    width: 405,
    height: 375,
    fill: "transparent",
    fillOpacity: 0,
    stroke: "#5b6069",
    strokeWidth: 2.5,
    strokeOpacity: 1,
    extraInfo: { cornerRadius: 24 },
    text: { align: "center", content: [paragraph("")] },
  },
  ...nodes.map(circle),
  arrow("init", "dockerd", EArrowLineType.STRAIGHT),
  arrow("dockerd", "containerd", EArrowLineType.STRAIGHT),
  arrow("containerd", "shim", EArrowLineType.STRAIGHT),
  arrow("shim", "bash-1", EArrowLineType.ORTHOGONAL),
  arrow("shim", "bash-9", EArrowLineType.ORTHOGONAL),
];
