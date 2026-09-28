/**
 * 关联图谱 core 层类型 —— 渲染器与布局的公共契约。
 *
 * 分层约定（见 LinkGraph/README 的分层说明）：
 *  - core 只描述「图结构 + 坐标 + 视觉状态」，不认识 canvas 也不认识 React；
 *  - 渲染器只读 GraphScene + Camera + GraphPalette，不反向驱动布局；
 *  - 因此换渲染器（Canvas2D → WebGL）或换布局（前台 → Worker）互不影响。
 */

import type { ClusterInfo } from "./cluster";

export interface GraphSummary {
  /** 没有任何链接的卡片 */
  isolated: number[];
  /** 有链接但所在社区太小，没单独成簇 */
  scattered: number[];
  /** 模块度；越高说明主题结构越清晰（0.3 以上算有结构） */
  modularity: number;
}

/** 节点视觉状态：互斥的三档强调 + 独立的淡出标记 */
export interface NodeVisualState {
  /** 命中筛选/当前卡片（外部 currentCardIds 驱动） */
  current: boolean;
  /** 指针悬停的那一个 */
  hovered: boolean;
  /** 悬停节点的一度邻居 */
  adjacent: boolean;
  /** 有悬停且自己既非悬停也非邻居 —— 降淡 */
  dimmed: boolean;
}

export interface GraphNode {
  id: number;
  /** 一度邻居数量，决定半径 */
  degree: number;
  /** 标签文本（取正文首段，可能为空） */
  label: string;
  /** 创建时间（毫秒），批次 4 的入场播放按它排序 */
  createdAt: number;
  /** 布局坐标；布局未跑完时为初始猜测值 */
  x: number;
  y: number;
  /** 力模拟速度，由布局维护 */
  vx: number;
  vy: number;
  /** 被拖拽固定时的锚点，null 表示自由 */
  fx: number | null;
  fy: number | null;
  /** 渲染半径（由 degree 派生，sqrt 增长） */
  radius: number;
  /** 所属主题簇 id；-1 表示孤立或太零散、不单独成簇 */
  cluster: number;
  /** 是否连接了别的主题簇（桥接卡片，往往是洞见所在） */
  isBridge: boolean;
}

export interface GraphEdge {
  source: number;
  target: number;
}

export interface GraphScene {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** 主题簇（规模降序）；空数组表示没跑社区发现或图太小 */
  clusters: ClusterInfo[];
  /** 簇划分的整体情况，供宿主做提示（孤立卡片、零散卡片、划分质量） */
  summary: GraphSummary;
  /** id → 节点，渲染与命中都要按 id 取 */
  nodeById: Map<number, GraphNode>;
  /** id → 一度邻居 id 集合，hover 高亮用 */
  adjacency: Map<number, Set<number>>;
}

/** 视口变换：canvas 坐标 = (world + offset) * scale */
export interface CameraTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/** 从 --tau-* 语义 token 解析出的画布调色板 */
export interface GraphPalette {
  background: string;
  nodeFill: string;
  nodeStroke: string;
  nodeFillHover: string;
  nodeFillCurrent: string;
  nodeStrokeCurrent: string;
  edge: string;
  edgeHighlight: string;
  label: string;
  /** 悬停时的辉光色（accent 的低透明度形态） */
  glow: string;
  /** 标签字体栈；canvas 的 ctx.font 不认 var()，必须解析成字面值 */
  fontFamily: string;
}
