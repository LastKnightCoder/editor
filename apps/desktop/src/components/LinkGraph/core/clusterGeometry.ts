/**
 * 每簇的质心与半径（世界坐标）。半径取成员到质心距离的 90 分位再放宽，
 * 用分位数而不是最大值：一个跑远的成员不该把整个色块拉大。
 * 渲染器画簇色块与主题名、宿主在地图上定位主题都用它。
 */

import type { GraphScene } from "./types";
import { isMapScene, type MapScene } from "./mapScene";

const mapGeometry = new WeakMap<GraphScene, ReturnType<typeof computeClusterGeometry>>();

export function clusterGeometry(scene: GraphScene) {
  if (!isMapScene(scene)) return computeClusterGeometry(scene);
  let geometry = mapGeometry.get(scene);
  if (!geometry) {
    geometry = computeClusterGeometry(scene);
    mapGeometry.set(scene, geometry);
  }
  return geometry;
}

function computeClusterGeometry(scene: GraphScene) {
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

const subtopicGeometry = new WeakMap<
  MapScene,
  Map<number, { x: number; y: number; count: number }>
>();

/** 离线场景的世界坐标不随平移、缩放或显现动画变化。 */
export function mapSubtopicGeometry(scene: MapScene) {
  const cached = subtopicGeometry.get(scene);
  if (cached) return cached;
  const shapes = new Map<number, { x: number; y: number; count: number }>();
  for (const sub of [...scene.subtopics].sort((a, b) => b.members.length - a.members.length)) {
    let x = 0;
    let y = 0;
    let count = 0;
    for (const id of sub.members) {
      const node = scene.nodeById.get(id);
      if (!node) continue;
      x += node.x;
      y += node.y;
      count++;
    }
    if (count) shapes.set(sub.id, { x: x / count, y: y / count, count });
  }
  subtopicGeometry.set(scene, shapes);
  return shapes;
}
