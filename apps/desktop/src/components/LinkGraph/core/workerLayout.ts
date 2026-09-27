/**
 * Worker 布局代理 —— 主线程侧实现 LayoutHandle，把力模拟整体搬出主线程。
 *
 * 主线程的职责收缩为：发一次初始化、每帧把收到的坐标写回 GraphNode、把缓冲还回去。
 * 于是节点再多，主线程的开销只和「视口里画多少」有关，与模拟规模脱钩。
 */

import type { LayoutCallbacks, LayoutHandle, LayoutRequest, LayoutResponse } from "./layoutTypes";
import type { GraphNode, GraphScene } from "./types";

export type LayoutWorkerFactory = () => Worker;

export class WorkerLayout implements LayoutHandle {
  private worker: Worker;
  private settled = false;
  private disposed = false;
  /** 节点 id → 在 worker 侧的下标（拖拽要按下标寻址） */
  private indexById = new Map<number, number>();

  constructor(
    private scene: GraphScene,
    private callbacks: LayoutCallbacks,
    createWorker: LayoutWorkerFactory
  ) {
    this.worker = createWorker();
    this.worker.onmessage = (event: MessageEvent<LayoutResponse>) => this.receive(event.data);

    const count = scene.nodes.length;
    const radii = new Float32Array(count);
    const x = new Float32Array(count);
    const y = new Float32Array(count);
    const clusters = new Int32Array(count);
    scene.nodes.forEach((node, index) => {
      this.indexById.set(node.id, index);
      radii[index] = node.radius;
      x[index] = node.x;
      y[index] = node.y;
      clusters[index] = node.cluster;
    });

    const edges = new Int32Array(scene.edges.length * 2);
    let cursor = 0;
    for (const edge of scene.edges) {
      const source = this.indexById.get(edge.source);
      const target = this.indexById.get(edge.target);
      if (source === undefined || target === undefined) continue;
      edges[cursor++] = source;
      edges[cursor++] = target;
    }

    this.post(
      {
        type: "init",
        count,
        radii,
        x,
        y,
        edges: edges.subarray(0, cursor),
        clusters,
        clusterCount: scene.clusters.length,
      },
      // subarray 与原 buffer 共享内存，转移整块；其余各自独立
      [radii.buffer, x.buffer, y.buffer, edges.buffer, clusters.buffer]
    );
  }

  start() {
    this.settled = false;
    this.post({ type: "start" });
  }

  reheat(alpha = 0.3) {
    this.settled = false;
    this.post({ type: "reheat", alpha });
  }

  dragTo(node: GraphNode, x: number, y: number) {
    const index = this.indexById.get(node.id);
    if (index === undefined) return;
    // 本地也立刻写一份：拖拽必须跟手，不能等 worker 回帧
    node.x = x;
    node.y = y;
    node.fx = x;
    node.fy = y;
    this.settled = false;
    this.post({ type: "drag", index, x, y });
  }

  endDrag(node: GraphNode, pin: boolean) {
    const index = this.indexById.get(node.id);
    if (index === undefined) return;
    if (!pin) {
      node.fx = null;
      node.fy = null;
    }
    this.post({ type: "endDrag", index, pin });
  }

  stop() {
    this.post({ type: "stop" });
  }

  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    this.worker.onmessage = null;
    this.worker.terminate();
  }

  get isSettled() {
    return this.settled;
  }

  private post(message: LayoutRequest, transfer: Transferable[] = []) {
    if (this.disposed) return;
    this.worker.postMessage(message, transfer);
  }

  private receive(message: LayoutResponse) {
    if (this.disposed) return;
    const { positions } = message;
    const nodes = this.scene.nodes;
    const usable = Math.min(nodes.length, positions.length / 2);
    for (let i = 0; i < usable; i++) {
      const node = nodes[i];
      // 正在被拖的节点以本地为准：worker 的回帧总比指针慢一拍
      if (node.fx !== null && node.fy !== null) continue;
      node.x = positions[i * 2];
      node.y = positions[i * 2 + 1];
    }
    if (message.type === "settled") this.settled = true;
    // 还缓冲（转移回去，不复制）。postMessage 只接受 ArrayBuffer，
    // 而 TypedArray.buffer 的静态类型含 SharedArrayBuffer，这里收窄
    const buffer = positions.buffer as ArrayBuffer;
    this.post({ type: "recycle", buffer }, [buffer]);
    if (message.type === "settled") this.callbacks.onSettle?.();
    else this.callbacks.onTick?.();
  }
}
