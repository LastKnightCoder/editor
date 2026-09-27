/**
 * 布局的公共契约 —— 前台版（ForceLayout）与 Worker 版（WorkerLayout）互换的基础。
 *
 * 宿主只认这个接口，不知道力模拟跑在哪个线程；档位（见 createLayout）据节点数选实现。
 * 坐标一律就地写回 GraphNode，渲染器每帧直接读，中间不再多一层数据同步。
 */

import type { GraphNode } from "./types";

export interface LayoutCallbacks {
  /** 坐标有更新，宿主据此标脏 */
  onTick?: () => void;
  /** 自然收敛一次 */
  onSettle?: () => void;
}

export interface LayoutHandle {
  /** 从满 alpha 跑一轮（首次布局） */
  start(): void;
  /** 局部扰动后小幅加热（拖拽、增删节点），不重排整张图 */
  reheat(alpha?: number): void;
  dragTo(node: GraphNode, x: number, y: number): void;
  endDrag(node: GraphNode, pin: boolean): void;
  stop(): void;
  destroy(): void;
  readonly isSettled: boolean;
}

/** 主线程 → worker */
export type LayoutRequest =
  | {
      type: "init";
      /** 节点数 */
      count: number;
      radii: Float32Array;
      x: Float32Array;
      y: Float32Array;
      /** 连线按「节点下标」成对排列：[s0, t0, s1, t1, ...] */
      edges: Int32Array;
      /** 每个节点所属簇（-1 = 不属于任何簇）；簇力靠它，漏传则大图退化成一团云 */
      clusters: Int32Array;
      clusterCount: number;
    }
  | { type: "start" }
  | { type: "reheat"; alpha: number }
  | { type: "drag"; index: number; x: number; y: number }
  | { type: "endDrag"; index: number; pin: boolean }
  | { type: "stop" }
  /** 主线程消费完坐标后把缓冲还回来（双缓冲，避免每帧分配） */
  | { type: "recycle"; buffer: ArrayBuffer };

/** worker → 主线程 */
export type LayoutResponse =
  { type: "tick"; positions: Float32Array } | { type: "settled"; positions: Float32Array };
