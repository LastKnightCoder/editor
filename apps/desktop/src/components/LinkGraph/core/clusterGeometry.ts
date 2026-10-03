/**
 * 每簇的质心与半径（世界坐标）。半径取成员到质心距离的 90 分位再放宽，
 * 用分位数而不是最大值：一个跑远的成员不该把整个色块拉大。
 * 渲染器画簇色块与主题名、宿主在地图上定位主题都用它。
 */

import type { GraphScene } from "./types";

export function clusterGeometry(scene: GraphScene) {
  const groups = new Map<number, { x: number; y: number; radius: number }>();
  if (scene.clusters.length === 0) return groups;

  for (const cluster of scene.clusters) {
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    for (const id of cluster.members) {
      const node = scene.nodeById.get(id);
      if (!node) continue;
      sumX += node.x;
      sumY += node.y;
      count += 1;
    }
    if (count === 0) continue;
    const x = sumX / count;
    const y = sumY / count;
    const distances: number[] = [];
    for (const id of cluster.members) {
      const node = scene.nodeById.get(id);
      if (node) distances.push(Math.hypot(node.x - x, node.y - y));
    }
    distances.sort((a, b) => a - b);
    const percentile = distances[Math.floor(distances.length * 0.9)] ?? 0;
    groups.set(cluster.id, { x, y, radius: percentile * 1.35 + 24 });
  }
  return groups;
}
