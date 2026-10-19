/**
 * 主片 v2 的知识地图（Deep Work 故事线）：10 个大主题、每个主题 2–4 个子主题，共 706 条笔记
 * （卡片 412 · 文章 58 · 项目文档 236，始于 2019年3月，同官网总览示意）。
 * 坐标是地图世界单位，尺度按 LinkGraph 渲染器的校准口径：卡片最近邻间距约 12.6，
 * 半径同 knowledge-map/compute.ts 的 mapNodeRadius（3.5 + √degree × 1.6）。
 * born 是生长回放的出现进度（按创建时间排名均匀铺开，同 core/timeline.ts）。
 */
import { random } from "remotion";

export type MapKind = "card" | "article" | "project-item";
export type DeepTopic = { id: number; label: string; hue: number; x: number; y: number; r: number };
export type DeepSub = { id: number; topic: number; label: string; dx: number; dy: number; share: number; titles: string[] };
export type DeepNode = {
  id: number;
  topic: number;
  sub: number;
  kind: MapKind;
  x: number;
  y: number;
  radius: number;
  degree: number;
  /** 创建月份序号：0 = 2019年3月 */
  month: number;
  born: number;
  title?: string;
  bridge?: boolean;
};
export type ClusterShape = { x: number; y: number; radius: number; count: number };

/** 色槽取自 LinkGraph core/palette.ts 的 TOPIC_HUES，按主题规模依次分配 */
const HUES = [258, 38, 158, 350, 210, 88, 300, 18, 190, 128];

const TOPIC_DEFS = [
  { label: "JavaScript", x: 335, y: 345, count: 150, months: [0, 70], project: 0.45 },
  { label: "专注与效率", x: 640, y: 345, count: 110, months: [55, 91], project: 0.22 },
  { label: "CSS", x: 450, y: 548, count: 85, months: [2, 60], project: 0.45 },
  { label: "写作", x: 536, y: 150, count: 75, months: [30, 91], project: 0.2 },
  { label: "心理学", x: 205, y: 140, count: 60, months: [20, 91], project: 0.1 },
  { label: "设计", x: 752, y: 545, count: 60, months: [15, 85], project: 0.35 },
  { label: "读书笔记", x: 868, y: 352, count: 57, months: [24, 91], project: 0.05 },
  { label: "Python", x: 385, y: 80, count: 45, months: [10, 50], project: 0.4 },
  { label: "《思考，快与慢》", x: 760, y: 160, count: 32, months: [28, 40], project: 0.05 },
  { label: "经济", x: 120, y: 455, count: 32, months: [8, 50], project: 0.1 },
];

/** 主题中心按官网示意的布局摆放，再整体拉开，岛与岛之间留出水道 */
const SPREAD = 1.25;
const ORIGIN = { x: 500, y: 330 };
const spread = (t: { x: number; y: number }) => ({ x: ORIGIN.x + (t.x - ORIGIN.x) * SPREAD, y: ORIGIN.y + (t.y - ORIGIN.y) * SPREAD });

export const DEEP_TOPICS: DeepTopic[] = TOPIC_DEFS.map((t, id) => ({
  id,
  label: t.label,
  hue: HUES[id],
  ...spread(t),
  r: Math.sqrt((t.count * 240) / Math.PI),
}));

/** 子主题：dx/dy 为相对主题中心的偏移（单位：主题半径），share 为成员占比，titles 为节点标题池 */
const SUB_DEFS: Omit<DeepSub, "id">[] = [
  { topic: 0, label: "React", dx: -0.45, dy: -0.35, share: 0.3, titles: ["useEffect 的依赖数组", "状态提升", "受控与非受控", "列表的 key", "useMemo 什么时候用"] },
  { topic: 0, label: "异步", dx: 0.4, dy: -0.4, share: 0.25, titles: ["Promise 的执行顺序", "事件循环", "async 的错误处理", "防抖与节流"] },
  { topic: 0, label: "工程化", dx: 0.42, dy: 0.42, share: 0.25, titles: ["小黄鸭调试法", "单测先行", "依赖升级清单", "提交信息怎么写", "代码评审的礼仪"] },
  { topic: 0, label: "TypeScript", dx: -0.45, dy: 0.42, share: 0.2, titles: ["类型收窄", "泛型约束", "satisfies 的用法"] },

  {
    topic: 1,
    label: "注意力",
    dx: -0.5,
    dy: -0.38,
    share: 0.27,
    titles: ["注意力残留", "通知的代价", "注意力是会被借走的", "被打断后的二十分钟", "碎片时间不是时间", "浅工作的诱惑", "注意力像肌肉一样会累"],
  },
  {
    topic: 1,
    label: "环境",
    dx: 0.42,
    dy: -0.38,
    share: 0.27,
    titles: ["先改环境，再谈专注", "专注不是意志力问题", "一张安静的纸", "书桌与光", "数字环境（手机、浏览器）", "把常用 App 移出首屏", "关掉所有红点", "声音也是环境"],
  },
  { topic: 1, label: "深度工作", dx: 0.38, dy: 0.45, share: 0.24, titles: ["Deep Work：在喧嚣里保持专注", "单任务比多任务更快", "深度工作的四种节奏", "每天两小时的深度块", "关机仪式", "慢生产力"] },
  { topic: 1, label: "番茄与习惯", dx: -0.48, dy: 0.45, share: 0.22, titles: ["为什么分心", "练习", "番茄钟不是为了计时", "开工仪式", "两分钟法则", "精力比时间更稀缺"] },

  { topic: 2, label: "布局", dx: -0.42, dy: -0.2, share: 0.45, titles: ["Flex 与 Grid 怎么选", "居中的几种写法", "容器查询"] },
  { topic: 2, label: "动画", dx: 0.45, dy: -0.3, share: 0.3, titles: ["缓动曲线", "只动 transform", "View Transitions"] },
  { topic: 2, label: "Tailwind", dx: 0.1, dy: 0.5, share: 0.25, titles: ["原子类的边界", "设计 token 怎么落地"] },

  { topic: 3, label: "写作方法", dx: -0.45, dy: 0.1, share: 0.4, titles: ["写作是思考的外化", "先写烂稿", "每天写三百字", "标题最后再起", "删掉一半"] },
  { topic: 3, label: "卡片笔记", dx: 0.42, dy: -0.25, share: 0.35, titles: ["一张卡片只写一个想法", "用自己的话重写", "卡片之间要连起来", "永久笔记与闪念笔记"] },
  { topic: 3, label: "表达", dx: 0.35, dy: 0.5, share: 0.25, titles: ["把复杂的事讲简单", "先给结论", "例子比道理有用"] },

  { topic: 4, label: "认知偏差", dx: -0.4, dy: -0.3, share: 0.4, titles: ["确认偏误", "计划谬误"] },
  { topic: 4, label: "动机", dx: 0.45, dy: -0.1, share: 0.35, titles: ["自我决定论", "内在动机"] },
  { topic: 4, label: "情绪", dx: -0.1, dy: 0.5, share: 0.25, titles: ["情绪颗粒度", "焦虑是没想清楚"] },

  { topic: 5, label: "交互", dx: -0.42, dy: -0.25, share: 0.4, titles: ["少即是多", "空状态也要设计"] },
  { topic: 5, label: "排版", dx: 0.45, dy: -0.2, share: 0.3, titles: ["中文行高", "字重的层级"] },
  { topic: 5, label: "配色", dx: 0, dy: 0.5, share: 0.3, titles: ["60-30-10 法则", "对比度不是越高越好"] },

  { topic: 6, label: "心流", dx: -0.45, dy: -0.3, share: 0.4, titles: ["心流的八个特征", "挑战与技能的平衡", "心流需要清晰的目标"] },
  { topic: 6, label: "认知天性", dx: 0.45, dy: -0.15, share: 0.35, titles: ["提取练习比重读有效", "间隔重复", "交错练习"] },
  { topic: 6, label: "原则", dx: -0.05, dy: 0.5, share: 0.25, titles: ["痛苦 + 反思 = 进步", "极度透明"] },

  { topic: 7, label: "数据分析", dx: -0.4, dy: 0, share: 0.6, titles: ["pandas 分组聚合", "画图先看分布"] },
  { topic: 7, label: "脚本", dx: 0.5, dy: 0.1, share: 0.4, titles: ["批量重命名", "定时任务"] },

  { topic: 8, label: "两个系统", dx: -0.35, dy: 0, share: 0.55, titles: ["系统 1 与系统 2", "注意力是有限的预算"] },
  { topic: 8, label: "启发式", dx: 0.45, dy: 0.1, share: 0.45, titles: ["锚定效应", "可得性偏差", "峰终定律"] },

  { topic: 9, label: "行为经济学", dx: 0, dy: -0.35, share: 0.6, titles: ["默认选项的力量", "损失厌恶", "助推", "心理账户"] },
  { topic: 9, label: "投资", dx: 0.1, dy: 0.5, share: 0.4, titles: ["复利", "指数基金定投"] },
];

export const DEEP_SUBS: DeepSub[] = SUB_DEFS.map((s, id) => ({ ...s, id }));

/** 故事里的节点：标题、类型、创建月份、固定坐标（今天的卡片排在最后出现） */
const STORY: { title: string; kind: MapKind; month: number; x: number; y: number }[] = [
  { title: "先改环境，再谈专注", kind: "card", month: 91.9, x: 668, y: 322 },
  { title: "注意力残留", kind: "card", month: 60, x: 602, y: 302 },
  { title: "通知的代价", kind: "card", month: 91.5, x: 586, y: 330 },
  { title: "专注不是意志力问题", kind: "article", month: 91.8, x: 699, y: 298 },
  { title: "一张安静的纸", kind: "article", month: 88, x: 703, y: 338 },
  { title: "书桌与光", kind: "project-item", month: 86, x: 652, y: 290 },
  { title: "数字环境（手机、浏览器）", kind: "project-item", month: 86, x: 690, y: 360 },
  { title: "Deep Work：在喧嚣里保持专注", kind: "article", month: 91.6, x: 662, y: 386 },
  { title: "单任务比多任务更快", kind: "card", month: 89, x: 694, y: 404 },
  { title: "为什么分心", kind: "project-item", month: 85, x: 585, y: 372 },
  { title: "练习", kind: "project-item", month: 87, x: 606, y: 402 },
  { title: "写作是思考的外化", kind: "card", month: 40, x: 500, y: 158 },
  { title: "默认选项的力量", kind: "card", month: 14, x: 122, y: 432 },
  { title: "注意力是有限的预算", kind: "card", month: 28, x: 742, y: 160 },
  { title: "小黄鸭调试法", kind: "card", month: 2, x: 376, y: 384 },
];

const KIND_TOTAL = { card: 412, article: 58, "project-item": 236 };

function gaussian(seed: string) {
  const u = Math.max(1e-6, random(`${seed}u`));
  const v = random(`${seed}v`);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const subCenter = (sub: DeepSub) => {
  const topic = DEEP_TOPICS[sub.topic];
  return { x: topic.x + sub.dx * topic.r * 0.8, y: topic.y + sub.dy * topic.r * 0.7 };
};

// —— 节点：故事节点钉在固定位置，其余按子主题高斯散布
const nodes: DeepNode[] = [];
const pinned = new Set<number>();
const storyId = new Map<string, number>();
for (const s of STORY) {
  const sub = DEEP_SUBS.find(d => d.titles.includes(s.title))!;
  storyId.set(s.title, nodes.length);
  pinned.add(nodes.length);
  // 故事坐标写的是拉开前的位置，跟着所属主题一起平移
  const def = TOPIC_DEFS[sub.topic];
  const shift = { x: DEEP_TOPICS[sub.topic].x - def.x, y: DEEP_TOPICS[sub.topic].y - def.y };
  nodes.push({ id: nodes.length, topic: sub.topic, sub: sub.id, kind: s.kind, x: s.x + shift.x, y: s.y + shift.y, radius: 0, degree: 0, month: s.month, born: 0, title: s.title });
}
TOPIC_DEFS.forEach((def, topicId) => {
  const subs = DEEP_SUBS.filter(s => s.topic === topicId);
  const topic = DEEP_TOPICS[topicId];
  const already = nodes.filter(n => n.topic === topicId).length;
  let remaining = def.count - already;
  subs.forEach((sub, k) => {
    const placed = nodes.filter(n => n.sub === sub.id).length;
    const want = k === subs.length - 1 ? remaining : Math.max(0, Math.round(def.count * sub.share) - placed);
    remaining -= want;
    const pool = sub.titles.filter(t => !storyId.has(t));
    const c = subCenter(sub);
    for (let i = 0; i < want; i++) {
      const seed = `dm${sub.id}-${i}`;
      const u = random(`${seed}m`);
      nodes.push({
        id: nodes.length,
        topic: topicId,
        sub: sub.id,
        kind: "card",
        x: c.x + gaussian(`${seed}x`) * topic.r * 0.34,
        y: c.y + gaussian(`${seed}y`) * topic.r * 0.3,
        radius: 0,
        degree: 0,
        month: def.months[0] + (def.months[1] - def.months[0]) * Math.pow(u, 0.7),
        born: 0,
        title: pool[i],
      });
    }
  });
});

// —— 松弛：最近邻不小于约 12 个单位，节点被拉回自己的子主题中心
const MIN_GAP = 13;
for (let iter = 0; iter < 60; iter++) {
  const grid = new Map<string, number[]>();
  const cell = (v: number) => Math.floor(v / MIN_GAP);
  for (const n of nodes) {
    const key = `${cell(n.x)},${cell(n.y)}`;
    (grid.get(key) ?? grid.set(key, []).get(key)!).push(n.id);
  }
  for (const n of nodes) {
    const cx = cell(n.x);
    const cy = cell(n.y);
    for (let gx = cx - 1; gx <= cx + 1; gx++)
      for (let gy = cy - 1; gy <= cy + 1; gy++)
        for (const j of grid.get(`${gx},${gy}`) ?? []) {
          if (j <= n.id) continue;
          const o = nodes[j];
          const dx = o.x - n.x;
          const dy = o.y - n.y;
          const d = Math.hypot(dx, dy) || 0.01;
          if (d >= MIN_GAP) continue;
          const push = (MIN_GAP - d) / 2;
          const ux = dx / d;
          const uy = dy / d;
          const pn = pinned.has(n.id);
          const po = pinned.has(j);
          if (!pn) {
            n.x -= ux * push * (po ? 2 : 1);
            n.y -= uy * push * (po ? 2 : 1);
          }
          if (!po) {
            o.x += ux * push * (pn ? 2 : 1);
            o.y += uy * push * (pn ? 2 : 1);
          }
        }
  }
  for (const n of nodes) {
    if (pinned.has(n.id)) continue;
    const c = subCenter(DEEP_SUBS[n.sub]);
    n.x += (c.x - n.x) * 0.012;
    n.y += (c.y - n.y) * 0.012;
  }
}

// —— 类型：项目文档偏向成体系的主题，凑满卡片 412 · 文章 58 · 项目文档 236
{
  const generic = nodes.filter(n => !pinned.has(n.id));
  const storyCount = (kind: MapKind) => STORY.filter(s => s.kind === kind).length;
  const byProject = [...generic].sort((a, b) => random(`p${a.id}`) - TOPIC_DEFS[a.topic].project - (random(`p${b.id}`) - TOPIC_DEFS[b.topic].project));
  const projectIds = new Set(byProject.slice(0, KIND_TOTAL["project-item"] - storyCount("project-item")).map(n => n.id));
  const rest = generic.filter(n => !projectIds.has(n.id)).sort((a, b) => random(`a${a.id}`) - random(`a${b.id}`));
  const articleIds = new Set(rest.slice(0, KIND_TOTAL.article - storyCount("article")).map(n => n.id));
  for (const n of generic) n.kind = projectIds.has(n.id) ? "project-item" : articleIds.has(n.id) ? "article" : "card";
}

// —— 生长次序：按创建月份排名，均匀铺在 0→1 上
[...nodes].sort((a, b) => a.month - b.month || random(`o${a.id}`) - random(`o${b.id}`)).forEach((n, rank, all) => (n.born = rank / (all.length - 1)));

export const DEEP_IDS = Object.fromEntries([...storyId]) as Record<string, number>;
const id = (title: string) => DEEP_IDS[title];

/** 片中现场连上的那条（卡片里敲 [[ 连到「注意力残留」） */
export const NEW_LINK: [number, number] = [id("先改环境，再谈专注"), id("注意力残留")];

/** 地图洞见：三处「呼应」弧线 + 一处「问了没写」 */
export const DEEP_INSIGHTS = {
  arcs: [
    { a: id("注意力残留"), b: id("注意力是有限的预算") },
    { a: id("先改环境，再谈专注"), b: id("默认选项的力量") },
    { a: id("写作是思考的外化"), b: id("小黄鸭调试法") },
  ],
  pin: { x: 560 + (SPREAD - 1) * (640 - ORIGIN.x), y: 262 + (SPREAD - 1) * (345 - ORIGIN.y) },
};

// —— 连线：就近连同子主题、同主题的节点；故事节点之间的关联手动给，洞见两端与片中新连线不预连
const edges: [number, number][] = [];
const seen = new Set<string>();
const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
const reserved = new Set([NEW_LINK, ...DEEP_INSIGHTS.arcs.map(m => [m.a, m.b] as [number, number])].map(([a, b]) => key(a, b)));
const link = (a: number, b: number) => {
  const k = key(a, b);
  if (a === b || seen.has(k) || reserved.has(k)) return;
  seen.add(k);
  edges.push([a, b]);
};
[
  ["先改环境，再谈专注", "专注不是意志力问题"],
  ["先改环境，再谈专注", "Deep Work：在喧嚣里保持专注"],
  ["先改环境，再谈专注", "书桌与光"],
  ["注意力残留", "通知的代价"],
  ["注意力残留", "为什么分心"],
  ["Deep Work：在喧嚣里保持专注", "单任务比多任务更快"],
  ["一张安静的纸", "专注不是意志力问题"],
  ["数字环境（手机、浏览器）", "通知的代价"],
].forEach(([a, b]) => link(id(a), id(b)));
for (const n of nodes) {
  const near = nodes
    .filter(o => o.id !== n.id)
    .map(o => ({ o, d: Math.hypot(n.x - o.x, n.y - o.y) * (o.sub === n.sub ? 1 : o.topic === n.topic ? 1.6 : 3.2) }))
    .sort((a, b) => a.d - b.d);
  const k = random(`k${n.id}`) < 0.45 ? 2 : 1;
  for (let i = 0; i < k; i++) link(n.id, near[i].o.id);
}

for (const [a, b] of edges) {
  nodes[a].degree++;
  nodes[b].degree++;
  if (nodes[a].topic !== nodes[b].topic) nodes[a].bridge = nodes[b].bridge = true;
}
for (const n of nodes) n.radius = 3.5 + Math.sqrt(n.degree) * 1.6;

export const DEEP_NODES = nodes;
export const DEEP_EDGES = edges;

/** 岛的几何（同 LinkGraph core/clusterGeometry：质心 + 分位半径 × 1.35 + 24） */
function shapeOf(members: DeepNode[]): ClusterShape {
  const x = members.reduce((s, n) => s + n.x, 0) / members.length;
  const y = members.reduce((s, n) => s + n.y, 0) / members.length;
  const ds = members.map(n => Math.hypot(n.x - x, n.y - y)).sort((a, b) => a - b);
  return { x, y, radius: ds[Math.floor(ds.length * 0.75)] * 1.35 + 24, count: members.length };
}
export const TOPIC_SHAPES = DEEP_TOPICS.map(t => shapeOf(nodes.filter(n => n.topic === t.id)));
export const SUB_SHAPES = DEEP_SUBS.map(s => {
  const members = nodes.filter(n => n.sub === s.id);
  const x = members.reduce((sum, n) => sum + n.x, 0) / members.length;
  const y = members.reduce((sum, n) => sum + n.y, 0) / members.length;
  return { x, y, radius: 0, count: members.length };
});

export const DEEP_BOUNDS = (() => {
  const xs = nodes.map(n => n.x);
  const ys = nodes.map(n => n.y);
  return { minX: Math.min(...xs) - 10, maxX: Math.max(...xs) + 10, minY: Math.min(...ys) - 10, maxY: Math.max(...ys) + 10 };
})();

export const DEEP_STATS = {
  card: nodes.filter(n => n.kind === "card").length,
  article: nodes.filter(n => n.kind === "article").length,
  project: nodes.filter(n => n.kind === "project-item").length,
  total: nodes.length,
  since: "2019年3月",
};

/** 生长进度 → 说明行的月份（「2019年3月 · N 条」） */
export function monthLabel(month: number) {
  const m = Math.floor(month) + 2;
  return `${2019 + Math.floor(m / 12)}年${(m % 12) + 1}月`;
}
