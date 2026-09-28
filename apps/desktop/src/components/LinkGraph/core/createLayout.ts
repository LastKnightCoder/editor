/**
 * 按规模选布局实现（档位的落点之一）。
 *
 * 小图留在主线程：跨线程的初始化、消息往返与缓冲回收本身有固定成本，
 * 几十个节点时这些开销比模拟本身还大，而且前台版调试直观。
 * 到了几百个节点以上，模拟才是主线程掉帧的主因，这时搬进 Worker 收益压倒开销。
 */

import { ForceLayout } from "./layout";
import type { LayoutCallbacks, LayoutHandle } from "./layoutTypes";
import type { GraphScene } from "./types";
import { WorkerLayout, type LayoutWorkerFactory } from "./workerLayout";

/** 超过这个节点数就把力模拟搬进 Worker */
export const WORKER_MIN_NODES = 300;

export interface CreateLayoutOptions extends LayoutCallbacks {
  /** worker 构造器；缺省表示当前环境没有可用 worker（测试、降级），一律走前台 */
  createWorker?: LayoutWorkerFactory;
  /** 强制指定实现，用于样板间对照与测试 */
  mode?: "sync" | "worker";
}

export function createLayout(scene: GraphScene, options: CreateLayoutOptions = {}): LayoutHandle {
  const { createWorker, mode, ...callbacks } = options;
  const wantsWorker =
    mode === "worker" || (mode === undefined && scene.nodes.length >= WORKER_MIN_NODES);

  if (wantsWorker && createWorker) {
    try {
      return new WorkerLayout(scene, callbacks, createWorker);
    } catch (error) {
      // worker 起不来（打包路径、CSP、沙箱）不能让图谱瘫掉，退回前台
      console.warn("[LinkGraph] worker 布局不可用，退回主线程", error);
    }
  }
  return new ForceLayout(scene, callbacks);
}
