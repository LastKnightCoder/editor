/**
 * 簇力：让同一主题的卡片聚成可辨认的「岛」，不同主题互相推开。
 *
 * 为什么不给每个簇指定固定坐标：那样图会像排好的格子，失去有机感，
 * 而且卡片一增删、簇的规模一变，指定的位置就得重排，用户熟悉的形状全变。
 * 这里只施加两种相对力，位置由模拟自己长出来：
 *  1) 内聚：成员向本簇质心靠（质心每帧重算，不是外部给的目标点）；
 *  2) 互斥：两簇质心太近时按连线方向把两边整体推开，推力平摊到成员上。
 *
 * 强度都很弱（内聚 0.08、互斥 0.35），只做「倾向」；真正决定节点间距的仍是
 * link/charge/collide，否则簇内会被压成一个点。
 */

import type { GraphNode } from "./types";

/** 成员向质心的内聚强度 */
const COHESION = 0.08;
/** 簇间互斥强度 */
const SEPARATION = 0.35;
/** 两簇的「安全距离」在各自半径之和上再加的余量 */
const GAP = 60;

export interface ClusterForce {
  (alpha: number): void;
  initialize(nodes: GraphNode[]): void;
}

/**
 * @param clusterCount 簇数量；节点的 cluster 为 -1（孤立/零散）不参与任何簇力
 */
export function clusterForce(clusterCount: number): ClusterForce {
  let nodes: GraphNode[] = [];
  // 按簇累加的中间量，长度固定，每帧复用不分配
  let sumX = new Float64Array(0);
  let sumY = new Float64Array(0);
  let count = new Int32Array(0);
  let centerX = new Float64Array(0);
  let centerY = new Float64Array(0);
  let radius = new Float64Array(0);
  let pushX = new Float64Array(0);
  let pushY = new Float64Array(0);

  const force = ((alpha: number) => {
    if (clusterCount === 0 || nodes.length === 0) return;

    sumX.fill(0);
    sumY.fill(0);
    count.fill(0);
    for (const node of nodes) {
      const cluster = node.cluster;
      if (cluster < 0 || cluster >= clusterCount) continue;
      sumX[cluster] += node.x;
      sumY[cluster] += node.y;
      count[cluster] += 1;
    }
    for (let i = 0; i < clusterCount; i++) {
      if (count[i] === 0) continue;
      centerX[i] = sumX[i] / count[i];
      centerY[i] = sumY[i] / count[i];
    }

    // 簇半径按成员数估（面密度大致恒定），用于判定两簇是否挨得太近
    for (let i = 0; i < clusterCount; i++) {
      radius[i] = count[i] === 0 ? 0 : Math.sqrt(count[i]) * 22 + 20;
    }

    // 1) 内聚
    for (const node of nodes) {
      const cluster = node.cluster;
      if (cluster < 0 || cluster >= clusterCount || count[cluster] === 0) continue;
      node.vx += (centerX[cluster] - node.x) * COHESION * alpha;
      node.vy += (centerY[cluster] - node.y) * COHESION * alpha;
    }

    // 2) 互斥。先按簇两两算出推力累加起来（O(簇²)），最后一次性施加到节点（O(节点)）。
    // 不要在簇对循环里遍历节点——那是 O(簇² × 节点)，2 万节点时每帧上亿次运算。
    pushX.fill(0);
    pushY.fill(0);
    for (let i = 0; i < clusterCount; i++) {
      if (count[i] === 0) continue;
      for (let j = i + 1; j < clusterCount; j++) {
        if (count[j] === 0) continue;
        let dx = centerX[j] - centerX[i];
        let dy = centerY[j] - centerY[i];
        let distance = Math.hypot(dx, dy);
        const minimum = radius[i] + radius[j] + GAP;
        if (distance >= minimum) continue;
        // 两簇质心完全重合时给一个确定的方向，避免除零且结果可复现
        if (distance < 1e-6) {
          dx = Math.cos(i * 2.39996);
          dy = Math.sin(i * 2.39996);
          distance = 1;
        }
        const push = ((minimum - distance) / distance) * SEPARATION * alpha;
        // 推力按成员数平摊：大簇更「重」，不会被小簇顶着满场跑
        const total = count[i] + count[j];
        pushX[i] -= dx * push * (count[j] / total);
        pushY[i] -= dy * push * (count[j] / total);
        pushX[j] += dx * push * (count[i] / total);
        pushY[j] += dy * push * (count[i] / total);
      }
    }
    for (const node of nodes) {
      const cluster = node.cluster;
      if (cluster < 0 || cluster >= clusterCount) continue;
      node.vx += pushX[cluster];
      node.vy += pushY[cluster];
    }
  }) as ClusterForce;

  force.initialize = (incoming: GraphNode[]) => {
    nodes = incoming;
    sumX = new Float64Array(clusterCount);
    sumY = new Float64Array(clusterCount);
    count = new Int32Array(clusterCount);
    centerX = new Float64Array(clusterCount);
    centerY = new Float64Array(clusterCount);
    radius = new Float64Array(clusterCount);
    pushX = new Float64Array(clusterCount);
    pushY = new Float64Array(clusterCount);
  };

  return force;
}
