/**
 * 条目集合 → GraphScene。
 *
 * 坐标的初始猜测很重要：d3-force 从随机点起步会先「炸开」再收拢，观感很差。
 * 这里先按连通分量分组，用黄金角螺旋把每个分量铺在各自的圆盘里，
 * 分量圆盘再按面积做一遍环形排布——力模拟接手时已经接近最终形态。
 */

import type { Descendant } from "slate";
import { detectClusters } from "./cluster";
import type { GraphEdge, GraphItem, GraphNode, GraphScene } from "./types";

/** 标签取正文前若干字符；过长在渲染时再截断 */
const LABEL_LENGTH = 24;
/** 黄金角，螺旋铺点最均匀 */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export const nodeRadius = (degree: number): number => 6 + Math.sqrt(degree) * 4.5;

/**
 * 取正文首段文本做标签。
 * 不复用 utils/editor 的 getEditorText：那份在 .tsx 里、依赖 React，
 * 而 core 层要能整体搬进 Worker（批次 2），必须保持无 DOM 无 React。
 */
export const labelFromContent = (content: Descendant[] | undefined): string => {
  if (!content || content.length === 0) return "";
  let text = "";
  const walk = (node: unknown) => {
    if (text.length >= LABEL_LENGTH || !node || typeof node !== "object") return;
    const candidate = node as { text?: unknown; children?: unknown };
    if (typeof candidate.text === "string") {
      text += candidate.text;
      return;
    }
    if (Array.isArray(candidate.children)) for (const child of candidate.children) walk(child);
  };
  for (const node of content) walk(node);
  return text.replace(/\s+/g, " ").trim().slice(0, LABEL_LENGTH);
};

/** 按 BFS 切连通分量，大的排前面（后续环形排布从中心往外放） */
function connectedComponents(nodes: GraphNode[], adjacency: Map<number, Set<number>>): number[][] {
  const visited = new Set<number>();
  const components: number[][] = [];
  for (const node of nodes) {
    if (visited.has(node.id)) continue;
    const queue = [node.id];
    const component: number[] = [];
    visited.add(node.id);
    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);
      for (const neighbor of adjacency.get(current) ?? []) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
    components.push(component);
  }
  components.sort((a, b) => b.length - a.length);
  return components;
}

/** 分量内部：黄金角螺旋，半径随 sqrt 增长保证面密度均匀 */
function seedComponent(
  ids: number[],
  nodeById: Map<number, GraphNode>,
  centerX: number,
  centerY: number,
  radius: number
) {
  ids.forEach((id, index) => {
    const node = nodeById.get(id);
    if (!node) return;
    if (ids.length === 1) {
      node.x = centerX;
      node.y = centerY;
      return;
    }
    const angle = index * GOLDEN_ANGLE;
    const r = Math.sqrt((index + 1) / ids.length) * radius;
    node.x = centerX + r * Math.cos(angle);
    node.y = centerY + r * Math.sin(angle);
  });
}

/**
 * 分量圆盘排布：最大的分量占中心，其余按面积依次绕圈。
 * 每圈的周长用上一圈半径估算，圈内按弧长累加放置，圆盘之间自然不重叠。
 */
function seedComponents(components: number[][], nodeById: Map<number, GraphNode>) {
  const radii = components.map(ids => Math.sqrt(ids.length) * 26 + 24);
  if (components.length === 0) return;

  seedComponent(components[0], nodeById, 0, 0, radii[0] * 0.85);

  let ringRadius = radii[0] + 90;
  let angle = 0;
  let index = 1;
  while (index < components.length) {
    let maxInRing = 0;
    const ringStart = index;
    // 沿当前圈铺，弧长累加超过一整圈就换下一圈
    while (index < components.length) {
      const r = radii[index];
      const step = ((r + 40) * 2) / ringRadius;
      if (index > ringStart && angle + step > Math.PI * 2) break;
      seedComponent(
        components[index],
        nodeById,
        Math.cos(angle + step / 2) * ringRadius,
        Math.sin(angle + step / 2) * ringRadius,
        r * 0.85
      );
      angle += step;
      maxInRing = Math.max(maxInRing, r);
      index += 1;
    }
    ringRadius += maxInRing * 2 + 90;
    angle = 0;
  }
}

export function buildScene(items: GraphItem[]): GraphScene {
  const ids = new Set(items.map(item => item.id));
  const adjacency = new Map<number, Set<number>>();
  for (const id of ids) adjacency.set(id, new Set());

  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    for (const target of new Set(item.links)) {
      // 悬空链接（目标不在本次集合里）不成边；自环无意义
      if (!ids.has(target) || target === item.id) continue;
      const [a, b] = item.id < target ? [item.id, target] : [target, item.id];
      const key = `${a}-${b}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ source: a, target: b });
      adjacency.get(a)!.add(b);
      adjacency.get(b)!.add(a);
    }
  }

  const nodes: GraphNode[] = items.map(item => {
    const degree = adjacency.get(item.id)!.size;
    return {
      id: item.id,
      degree,
      label: item.label.replace(/\s+/g, " ").trim().slice(0, LABEL_LENGTH),
      createdAt: item.createdAt,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      fx: null,
      fy: null,
      radius: nodeRadius(degree),
      cluster: -1,
      isBridge: false,
    };
  });

  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const scene: GraphScene = {
    nodes,
    edges,
    clusters: [],
    summary: { isolated: [], scattered: [], modularity: 0 },
    nodeById,
    adjacency,
  };

  // 社区发现要先有边表与邻接表，拿到划分后回填到节点上
  const detected = detectClusters(scene, items);
  scene.clusters = detected.clusters;
  const bridges = new Set(detected.clusters.flatMap(cluster => cluster.bridges));
  for (const node of nodes) {
    node.cluster = detected.clusterOf.get(node.id) ?? -1;
    node.isBridge = bridges.has(node.id);
  }
  scene.summary = {
    isolated: detected.isolated,
    scattered: detected.scattered,
    modularity: detected.modularity,
  };

  // 种子位置按簇铺，而不是按连通分量：分量常常只有一个（卡片一多就都连上了），
  // 按簇铺一开始就接近最终形态，力模拟只需要微调
  seedComponents(clusterGroups(scene), nodeById);

  return scene;
}

/**
 * 铺种子位用的分组：优先按主题簇（附带把孤立卡片单独成组，铺到外围），
 * 没跑出簇时退回连通分量。
 */
function clusterGroups(scene: GraphScene): number[][] {
  if (scene.clusters.length === 0) {
    return connectedComponents(scene.nodes, scene.adjacency);
  }
  const groups = scene.clusters.map(cluster => [...cluster.members]);
  const loose = scene.nodes.filter(node => node.cluster === -1).map(node => node.id);
  // 零散与孤立卡片切成小组，避免几百张挤成一坨盖住主题簇
  for (let i = 0; i < loose.length; i += 24) groups.push(loose.slice(i, i + 24));
  return groups;
}

/**
 * 增量复用：把旧场景里同 id 节点的坐标搬到新场景。
 * 新增节点若有已存在的邻居，落在邻居质心附近（而不是螺旋种子位），
 * 这样卡片增删不会让用户已经熟悉的布局整体重排。
 */
export function inheritPositions(next: GraphScene, previous: GraphScene): GraphScene {
  const fresh: GraphNode[] = [];
  for (const node of next.nodes) {
    const old = previous.nodeById.get(node.id);
    if (!old) {
      fresh.push(node);
      continue;
    }
    node.x = old.x;
    node.y = old.y;
    node.fx = old.fx;
    node.fy = old.fy;
  }
  for (const node of fresh) {
    const anchors = [...(next.adjacency.get(node.id) ?? [])]
      .map(id => previous.nodeById.get(id))
      .filter((n): n is GraphNode => !!n);
    if (anchors.length === 0) continue;
    const cx = anchors.reduce((sum, n) => sum + n.x, 0) / anchors.length;
    const cy = anchors.reduce((sum, n) => sum + n.y, 0) / anchors.length;
    const angle = Math.random() * Math.PI * 2;
    node.x = cx + Math.cos(angle) * 40;
    node.y = cy + Math.sin(angle) * 40;
  }
  return next;
}

/** 场景包围盒，fitView 用；空图返回单位盒避免除零 */
export function sceneBounds(scene: GraphScene) {
  if (scene.nodes.length === 0) return { minX: -1, minY: -1, maxX: 1, maxY: 1 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of scene.nodes) {
    minX = Math.min(minX, node.x - node.radius);
    minY = Math.min(minY, node.y - node.radius);
    maxX = Math.max(maxX, node.x + node.radius);
    maxY = Math.max(maxY, node.y + node.radius);
  }
  return { minX, minY, maxX, maxY };
}
