/**
 * 离线知识地图 → GraphScene。
 *
 * 地图里已经有坐标、主题、子主题，这里不再跑社区发现和力布局，只做三件事：
 *  1) 把地图主题翻译成渲染层的簇（大主题 = 簇，色槽随行）；
 *  2) 连线仍然只画用户建的显式链接（语义边只用来算地图，不画）；
 *  3) 地图之后新建、还没被对账放进地图的卡片，暂放到它显式链接的邻居旁边，
 *     没有邻居就放外圈——下次打开图谱时主进程会按语义把它放到正确的位置。
 */

import type { ICard } from "@/types";
import { mapNodeRadius } from "@/knowledge-map/compute";
import type { KnowledgeMap } from "@/knowledge-map/types";
import type { ClusterInfo } from "./cluster";
import { buildScene } from "./graph";
import type { GraphScene } from "./types";

/** 子主题（渲染层用于中等缩放下的标签） */
export interface MapSubtopic {
  id: number;
  /** 所属大主题在 scene.clusters 里的 id */
  cluster: number;
  label: string;
  members: number[];
}

export interface MapScene extends GraphScene {
  /** 大主题 id（簇 id）→ 色槽 */
  colorSlots: Map<number, number>;
  subtopics: MapSubtopic[];
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export function buildMapScene(
  cards: ICard[],
  getCardLinks: (card: ICard) => number[],
  map: KnowledgeMap
): MapScene {
  // 复用链接图的建图（边、邻接、度数、标签），再用地图覆盖坐标与归属
  const base = buildScene(cards, getCardLinks);
  const byCard = new Map(map.nodes.map(node => [node.cardId, node]));
  const topics = map.topics.filter(topic => topic.parent === -1);
  const topicCluster = new Map(topics.map((topic, index) => [topic.id, index]));

  let extent = 0;
  for (const node of map.nodes) extent = Math.max(extent, Math.hypot(node.x, node.y));

  const pending = [];
  for (const node of base.nodes) {
    node.radius = mapNodeRadius(node.degree);
    node.isBridge = false;
    const placed = byCard.get(node.id);
    if (!placed) {
      node.cluster = -1;
      pending.push(node);
      continue;
    }
    node.x = placed.x;
    node.y = placed.y;
    node.cluster = topicCluster.get(placed.topic) ?? -1;
  }

  // 地图之后新建的卡片：挨着已在地图上的显式链接邻居，否则按黄金角散在外圈
  pending.forEach((node, index) => {
    const anchors = [...(base.adjacency.get(node.id) ?? [])]
      .map(id => base.nodeById.get(id)!)
      .filter(other => byCard.has(other.id));
    if (anchors.length > 0) {
      const angle = node.id * GOLDEN_ANGLE;
      node.x = anchors.reduce((sum, n) => sum + n.x, 0) / anchors.length + Math.cos(angle) * 10;
      node.y = anchors.reduce((sum, n) => sum + n.y, 0) / anchors.length + Math.sin(angle) * 10;
      node.cluster = anchors[0].cluster;
      return;
    }
    const angle = index * GOLDEN_ANGLE;
    const radius = extent + 50 + Math.sqrt(index) * 8;
    node.x = Math.cos(angle) * radius;
    node.y = Math.sin(angle) * radius;
  });

  const membersOf = new Map<number, number[]>();
  for (const node of base.nodes) {
    if (node.cluster < 0) continue;
    const list = membersOf.get(node.cluster) ?? [];
    list.push(node.id);
    membersOf.set(node.cluster, list);
  }

  const clusters: ClusterInfo[] = topics.map((topic, index) => {
    const members = (membersOf.get(index) ?? []).sort((a, b) => {
      const left = base.nodeById.get(a)!;
      const right = base.nodeById.get(b)!;
      return right.degree - left.degree || a - b;
    });
    return {
      id: index,
      members,
      label: topic.label,
      anchor: members.length > 0 ? Math.min(...members) : topic.id,
      bridges: [],
    };
  });

  const subtopics: MapSubtopic[] = map.topics
    .filter(topic => topic.parent !== -1 && topic.label)
    .map(topic => ({
      id: topic.id,
      cluster: topicCluster.get(topic.parent) ?? -1,
      label: topic.label,
      members: map.nodes
        .filter(node => node.subtopic === topic.id && base.nodeById.has(node.cardId))
        .map(node => node.cardId),
    }))
    .filter(sub => sub.cluster >= 0 && sub.members.length > 0);

  const isolated = base.nodes.filter(node => node.degree === 0).map(node => node.id);
  return {
    ...base,
    clusters,
    summary: { isolated, scattered: [], modularity: base.summary.modularity },
    colorSlots: new Map(topics.map((topic, index) => [index, topic.colorSlot])),
    subtopics,
  };
}

export function isMapScene(scene: GraphScene): scene is MapScene {
  return (scene as MapScene).colorSlots instanceof Map;
}
