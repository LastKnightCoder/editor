/** 代码生成的示意图形：文章封面的山与天空、知识地图点云、日记热力格 */
import { seededRandom } from "../lib/random.ts";

interface CoverPalette {
  sky: [string, string];
  far: string;
  near: string;
  snow: string;
  stars: boolean;
}

// 封面是插画内容，不随站点主题变化
const COVERS: Record<string, CoverPalette> = {
  night: {
    sky: ["#0d1f2a", "#1d4250"],
    far: "#2a4a55",
    near: "#13252d",
    snow: "#c8d6d8",
    stars: true,
  },
  dawn: {
    sky: ["#f2c9a0", "#c98d78"],
    far: "#9b7a74",
    near: "#5d4a4c",
    snow: "#f6e3d0",
    stars: false,
  },
};

function coverSvg(kind: string) {
  const c = COVERS[kind];
  if (!c) throw new Error(`未知封面：${kind}`);
  const r = seededRandom(kind.length * 97);
  const sky = c.stars
    ? Array.from(
        { length: 60 },
        () =>
          `<circle cx="${(r() * 1200).toFixed(0)}" cy="${(r() * 150).toFixed(0)}" r="${(r() * 1.1 + 0.3).toFixed(2)}" fill="#fff" opacity="${(r() * 0.6 + 0.2).toFixed(2)}"/>`
      ).join("")
    : `<circle cx="880" cy="120" r="46" fill="#fbe7cf" opacity=".85"/>`;
  return `<svg viewBox="0 0 1200 300" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="sky-${kind}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.sky[0]}"/><stop offset="1" stop-color="${c.sky[1]}"/></linearGradient></defs>
    <rect width="1200" height="300" fill="url(#sky-${kind})"/>${sky}
    <path d="M0 230 L160 150 L250 190 L420 70 L520 150 L640 110 L760 40 L880 140 L1000 100 L1200 190 L1200 300 L0 300Z" fill="${c.far}"/>
    <path d="M420 70 L455 100 L438 104 L470 128 L392 105 Z M760 40 L800 82 L778 84 L815 112 L725 78 Z" fill="${c.snow}" opacity=".85"/>
    <path d="M0 270 L140 210 L300 250 L470 180 L620 240 L780 200 L960 250 L1100 215 L1200 240 L1200 300 L0 300Z" fill="${c.near}"/></svg>`;
}

interface Cluster {
  label: string;
  x: number;
  y: number;
  count: number;
  radius: number;
  tag: number;
}

const CLUSTERS: Cluster[] = [
  { label: "JavaScript", x: 250, y: 250, count: 320, radius: 66, tag: 1 },
  { label: "写作", x: 400, y: 110, count: 140, radius: 46, tag: 5 },
  { label: "专注与效率", x: 470, y: 250, count: 200, radius: 54, tag: 4 },
  { label: "心理学", x: 150, y: 100, count: 110, radius: 40, tag: 3 },
  { label: "设计", x: 560, y: 390, count: 120, radius: 44, tag: 2 },
  { label: "CSS", x: 330, y: 395, count: 170, radius: 48, tag: 3 },
  { label: "《思考，快与慢》", x: 560, y: 120, count: 60, radius: 30, tag: 5 },
  { label: "经济", x: 90, y: 330, count: 60, radius: 30, tag: 1 },
  { label: "摄影", x: 160, y: 430, count: 40, radius: 24, tag: 4 },
  { label: "Python", x: 290, y: 60, count: 90, radius: 36, tag: 2 },
  { label: "读书笔记", x: 640, y: 260, count: 70, radius: 32, tag: 5 },
];

const CLUSTER_LINKS: [number, number][] = [
  [0, 5],
  [0, 2],
  [1, 2],
  [2, 6],
  [2, 4],
  [3, 1],
  [5, 4],
  [0, 7],
  [9, 0],
  [2, 10],
  [8, 5],
];

function knowledgeMapSvg() {
  const r = seededRandom(7);
  const edges = CLUSTER_LINKS.map(([a, b]) => {
    const [p, q] = [CLUSTERS[a], CLUSTERS[b]];
    return `<line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}" stroke="var(--tau-ink-3)" stroke-width=".6" opacity=".35"/>`;
  }).join("");
  let dots = "";
  let labels = "";
  for (const cl of CLUSTERS) {
    // 每个主题由三个子簇组成，看起来更像真实聚类而不是一个圆
    const subs = Array.from({ length: 3 }, () => [
      cl.x + (r() - 0.5) * cl.radius,
      cl.y + (r() - 0.5) * cl.radius * 0.8,
    ]);
    for (let i = 0; i < cl.count; i++) {
      const [sx, sy] = subs[i % 3];
      const angle = r() * Math.PI * 2;
      const dist = Math.sqrt(r()) * cl.radius * 0.62;
      dots += `<circle cx="${(sx + Math.cos(angle) * dist).toFixed(1)}" cy="${(sy + Math.sin(angle) * dist * 0.85).toFixed(1)}" r="${(1.4 + r() * 1.2).toFixed(2)}" fill="var(--tau-tag-${cl.tag})" opacity="${(0.55 + r() * 0.4).toFixed(2)}"/>`;
    }
    labels += `<text x="${cl.x}" y="${cl.y + 5}" text-anchor="middle">${cl.label}</text>`;
  }
  return edges + dots + labels;
}

function heatCells() {
  return Array.from({ length: 30 }, (_, i) => {
    const v = (i * 7 + 3) % 11;
    return `<i class="${v > 8 ? "l3" : v > 5 ? "l2" : v > 2 ? "l1" : ""}"></i>`;
  }).join("");
}

export function renderIllustrations() {
  document.querySelectorAll<HTMLElement>("[data-cover]").forEach(el => {
    el.innerHTML = coverSvg(el.dataset.cover ?? "");
  });
  document.querySelectorAll("#kmap-svg").forEach(el => (el.innerHTML = knowledgeMapSvg()));
  document.querySelectorAll("#heat").forEach(el => (el.innerHTML = heatCells()));
}
