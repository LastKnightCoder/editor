/**
 * 命中检测：d3-quadtree 找最近节点。
 *
 * 力模拟每帧都在动，四叉树每帧重建代价太高；这里按需重建（指针移动时，
 * 且距上次重建超过一帧预算），700 个点的重建在 1ms 量级。
 * 批次 5 上 WebGL 时这层不变——命中永远在 CPU 上做，不走 GPU 拾取。
 */

import { quadtree, type Quadtree } from "d3-quadtree";
import type { GraphNode, GraphScene } from "./types";

/** 指针允许的额外容差（世界坐标），小节点也点得到 */
const TOLERANCE = 6;

export class NodePicker {
  private tree: Quadtree<GraphNode> | null = null;
  private builtAt = 0;

  constructor(private scene: GraphScene) {}

  replaceScene(scene: GraphScene) {
    this.scene = scene;
    this.tree = null;
  }

  invalidate() {
    this.tree = null;
  }

  /**
   * @param worldX 世界坐标
   * @param scale 当前缩放，用于把像素容差换算回世界尺度
   */
  pick(worldX: number, worldY: number, scale: number, now = performance.now()): GraphNode | null {
    if (!this.tree || now - this.builtAt > 16) {
      this.tree = quadtree<GraphNode>()
        .x(node => node.x)
        .y(node => node.y)
        .addAll(this.scene.nodes);
      this.builtAt = now;
    }
    const tolerance = TOLERANCE / Math.max(0.0001, scale);
    // 搜索半径取最大节点半径 + 容差，保证 find 不会漏掉大节点
    let maxRadius = 0;
    for (const node of this.scene.nodes) maxRadius = Math.max(maxRadius, node.radius);
    const candidate = this.tree.find(worldX, worldY, maxRadius + tolerance);
    if (!candidate) return null;
    const dx = candidate.x - worldX;
    const dy = candidate.y - worldY;
    const reach = candidate.radius + tolerance;
    // quadtree.find 返回的是中心最近的点，仍需按各自半径判定是否真的落在圆内
    if (dx * dx + dy * dy > reach * reach) {
      return this.pickExact(worldX, worldY, tolerance);
    }
    return candidate;
  }

  /** 最近点没命中时退化为线性精确扫描（仍然只在指针移动时发生） */
  private pickExact(worldX: number, worldY: number, tolerance: number): GraphNode | null {
    let best: GraphNode | null = null;
    let bestDistance = Infinity;
    for (const node of this.scene.nodes) {
      const dx = node.x - worldX;
      const dy = node.y - worldY;
      const reach = node.radius + tolerance;
      const distance = dx * dx + dy * dy;
      if (distance <= reach * reach && distance < bestDistance) {
        best = node;
        bestDistance = distance;
      }
    }
    return best;
  }
}
