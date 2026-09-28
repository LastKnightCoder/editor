/**
 * Worker 侧的布局执行体 —— 与 worker 入口分离，纯逻辑可在主线程直接单测。
 * （项目既有约定：*.worker.ts 只做消息分发，逻辑放同目录的普通模块，见 treeFilter。）
 *
 * 双缓冲协议：worker 只在手上有空闲缓冲时发坐标，主线程消费完再还回来。
 * 这样天然形成背压——主线程忙不过来时自动丢帧，而不是堆积消息把内存打满。
 */

import { ForceLayout } from "./layout";
import type { GraphNode, GraphScene } from "./types";
import type { LayoutRequest, LayoutResponse } from "./layoutTypes";

/** 缓冲池大小：2 块足够让「发送中」与「填充中」错开 */
const POOL_SIZE = 2;

export interface RunnerPort {
  post(message: LayoutResponse, transfer: Transferable[]): void;
}

/** 只有坐标与半径有意义的精简场景：worker 不需要标签、时间、邻接表 */
function sceneFromBuffers(
  count: number,
  radii: Float32Array,
  x: Float32Array,
  y: Float32Array,
  edges: Int32Array,
  clusters: Int32Array
): GraphScene {
  const nodes: GraphNode[] = [];
  for (let i = 0; i < count; i++) {
    nodes.push({
      id: i,
      degree: 0,
      label: "",
      createdAt: 0,
      x: x[i],
      y: y[i],
      vx: 0,
      vy: 0,
      fx: null,
      fy: null,
      radius: radii[i],
      cluster: clusters[i] ?? -1,
      isBridge: false,
    });
  }
  const adjacency = new Map<number, Set<number>>(nodes.map(node => [node.id, new Set<number>()]));
  const list = [];
  for (let i = 0; i + 1 < edges.length; i += 2) {
    const source = edges[i];
    const target = edges[i + 1];
    list.push({ source, target });
    adjacency.get(source)?.add(target);
    adjacency.get(target)?.add(source);
    nodes[source].degree += 1;
    nodes[target].degree += 1;
  }
  return {
    nodes,
    edges: list,
    clusters: [],
    summary: { isolated: [], scattered: [], modularity: 0 },
    nodeById: new Map(nodes.map(n => [n.id, n])),
    adjacency,
  };
}

export class LayoutRunner {
  private layout: ForceLayout | null = null;
  private scene: GraphScene | null = null;
  private pool: Float32Array[] = [];

  constructor(private port: RunnerPort) {}

  handle(message: LayoutRequest) {
    switch (message.type) {
      case "init": {
        this.layout?.destroy();
        this.scene = sceneFromBuffers(
          message.count,
          message.radii,
          message.x,
          message.y,
          message.edges,
          message.clusters
        );
        this.pool = Array.from({ length: POOL_SIZE }, () => new Float32Array(message.count * 2));
        this.layout = new ForceLayout(this.scene, {
          clusterCount: message.clusterCount,
          onTick: () => this.flush("tick"),
          onSettle: () => this.flush("settled"),
        });
        break;
      }
      case "start":
        this.layout?.start();
        break;
      case "reheat":
        this.layout?.reheat(message.alpha);
        break;
      case "drag": {
        const node = this.scene?.nodes[message.index];
        if (node && this.layout) this.layout.dragTo(node, message.x, message.y);
        break;
      }
      case "endDrag": {
        const node = this.scene?.nodes[message.index];
        if (node && this.layout) this.layout.endDrag(node, message.pin);
        break;
      }
      case "stop":
        this.layout?.stop();
        break;
      case "recycle":
        // 缓冲回收；超出池容量的丢弃（init 换了规模时旧缓冲长度不对）
        if (this.pool.length < POOL_SIZE) {
          const expected = (this.scene?.nodes.length ?? 0) * 2;
          const recycled = new Float32Array(message.buffer);
          if (recycled.length === expected) this.pool.push(recycled);
        }
        break;
    }
  }

  destroy() {
    this.layout?.destroy();
    this.layout = null;
    this.scene = null;
    this.pool = [];
  }

  /**
   * 把当前坐标装进一块空闲缓冲并发出。没有空闲缓冲说明主线程还没消费完上一帧，
   * 直接丢掉这次（收敛帧例外——它必须送达，否则宿主等不到最终坐标）。
   */
  private flush(kind: "tick" | "settled") {
    const scene = this.scene;
    if (!scene) return;
    let buffer = this.pool.pop();
    if (!buffer) {
      if (kind === "tick") return;
      buffer = new Float32Array(scene.nodes.length * 2);
    }
    for (let i = 0; i < scene.nodes.length; i++) {
      buffer[i * 2] = scene.nodes[i].x;
      buffer[i * 2 + 1] = scene.nodes[i].y;
    }
    this.port.post({ type: kind, positions: buffer }, [buffer.buffer]);
  }
}
