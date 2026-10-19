/**
 * 知识地图演示数据：8 个主题簇 + 今天新长出的几个节点。
 * 坐标在 1600×900 的地图空间；born 为生长动画中的出现次序（0→1），今天的节点最后出现。
 */
import { random } from "remotion";
import { TOPIC } from "./day";

export const MAP_W = 1600;
export const MAP_H = 900;

export type MapTopic = { id: number; label: string; hue: number; x: number; y: number; spread: number; count: number };
export type MapNode = { id: number; topic: number; x: number; y: number; r: number; born: number; title?: string; today?: boolean };
export type MapEdge = [number, number];

/** 色相取自 LinkGraph core/palette.ts 的 10 槽 */
export const TOPICS: MapTopic[] = [
  { id: 0, label: "认知科学", hue: 258, x: 600, y: 390, spread: 90, count: 70 },
  { id: 1, label: "写作方法", hue: 38, x: 1010, y: 450, spread: 85, count: 58 },
  { id: 2, label: "学习方法", hue: 158, x: 800, y: 680, spread: 90, count: 62 },
  { id: 3, label: "心理学", hue: 350, x: 360, y: 580, spread: 95, count: 54 },
  { id: 4, label: "编程", hue: 210, x: 1290, y: 290, spread: 115, count: 86 },
  { id: 5, label: "产品设计", hue: 88, x: 1220, y: 660, spread: 90, count: 50 },
  { id: 6, label: "阅读笔记", hue: 300, x: 470, y: 190, spread: 90, count: 48 },
  { id: 7, label: "生活随笔", hue: 18, x: 200, y: 330, spread: 75, count: 34 },
];

function gaussian(seed: string) {
  const u = Math.max(1e-6, random(`${seed}u`));
  const v = random(`${seed}v`);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const nodes: MapNode[] = [];
for (const topic of TOPICS) {
  for (let i = 0; i < topic.count; i++) {
    const seed = `n${topic.id}-${i}`;
    nodes.push({
      id: nodes.length,
      topic: topic.id,
      x: topic.x + gaussian(`${seed}x`) * topic.spread,
      y: topic.y + gaussian(`${seed}y`) * topic.spread * 0.8,
      r: 0,
      born: random(`${seed}b`) * 0.86,
    });
  }
}

/** 旧卡片「卡片笔记法」：写作方法簇里离认知科学最近的位置 */
export const OLD_CARD_ID = nodes.length;
nodes.push({ id: OLD_CARD_ID, topic: 1, x: 965, y: 360, r: 0, born: 0.08, title: TOPIC.oldCards[0] });

/** 今天长出的节点：PDF 划线 → 卡片 → 文章草稿 → 闪卡 */
export const TODAY_IDS = {
  highlight: nodes.length,
  card: nodes.length + 1,
  article: nodes.length + 2,
  flashcard: nodes.length + 3,
};
nodes.push(
  { id: TODAY_IDS.highlight, topic: 0, x: 690, y: 345, r: 0, born: 0.9, title: "延展心智 · 第 112 页", today: true },
  { id: TODAY_IDS.card, topic: 0, x: 745, y: 420, r: 0, born: 0.93, title: TOPIC.card, today: true },
  { id: TODAY_IDS.article, topic: 1, x: 850, y: 505, r: 0, born: 0.96, title: "工具如何参与思考", today: true },
  { id: TODAY_IDS.flashcard, topic: 0, x: 665, y: 470, r: 0, born: 0.98, title: "闪卡 · 思考发生在哪里", today: true }
);

const edges: MapEdge[] = [];
const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
const seen = new Set<string>();
const link = (a: number, b: number) => {
  if (a === b || seen.has(key(a, b))) return;
  seen.add(key(a, b));
  edges.push([a, b]);
};
const dist = (a: MapNode, b: MapNode) => Math.hypot(a.x - b.x, a.y - b.y);

for (const node of nodes) {
  if (node.today) continue;
  const near = nodes
    .filter(o => o.id !== node.id && !o.today)
    .map(o => ({ o, d: dist(node, o) * (o.topic === node.topic ? 1 : 2.6) }))
    .sort((a, b) => a.d - b.d);
  const k = random(`k${node.id}`) < 0.45 ? 2 : 1;
  for (let i = 0; i < k; i++) link(node.id, near[i].o.id);
}
link(TODAY_IDS.highlight, TODAY_IDS.card);
link(TODAY_IDS.card, TODAY_IDS.article);
link(TODAY_IDS.card, TODAY_IDS.flashcard);
link(TODAY_IDS.card, OLD_CARD_ID);
link(TODAY_IDS.article, OLD_CARD_ID);
for (const id of Object.values(TODAY_IDS)) {
  const near = nodes.filter(o => !o.today && o.topic === nodes[id].topic).sort((a, b) => dist(nodes[id], a) - dist(nodes[id], b));
  link(id, near[0].id);
}

const degree = new Map<number, number>();
for (const [a, b] of edges) {
  degree.set(a, (degree.get(a) ?? 0) + 1);
  degree.set(b, (degree.get(b) ?? 0) + 1);
}
// 半径公式同 knowledge-map/compute.ts 的 mapNodeRadius
for (const node of nodes) node.r = 3.5 + Math.sqrt(degree.get(node.id) ?? 0) * 1.6;

export const MAP_NODES = nodes;
export const MAP_EDGES = edges;

/** 今天的节点在地图上的「生长」排序后，时间轴上的出现进度 */
export const TODAY_LIST = Object.values(TODAY_IDS).map(id => nodes[id]);
