/**
 * 知识地图离线管线。合成数据刻意模仿真实卡片库的形状：
 * 按主题成团的向量 + 分层 tag + 绝大多数卡片没有显式链接——
 * 这正是「只靠链接分簇」失败的场景，新管线必须在这里分得出主题。
 */

import { describe, expect, it } from "vitest";
import { computeKnowledgeMap, placeIncrementally } from "../compute";
import { subtopicLabel, tagPath, topicLabel } from "../labels";
import { TOPIC_PALETTE_SIZE, type KnowledgeMapCardInput } from "../types";
import { knn, meanPool, type CardVector } from "../vectors";

const DIM = 32;

function seeded(seed: number) {
  let value = seed;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function normalize(v: Float32Array) {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n);
  for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}

/** 每个主题一个方向，子主题在其附近再偏一点，卡片在子主题附近加噪声 */
function syntheticLibrary(
  topics: Array<{ name: string; subs: string[]; perSub: number }>,
  seed = 7
) {
  const random = seeded(seed);
  const cards: KnowledgeMapCardInput[] = [];
  const vectors: CardVector[] = [];
  let id = 1;
  topics.forEach((topic, t) => {
    const topicDir = new Float32Array(DIM);
    topicDir[t % DIM] = 1;
    topicDir[(t + 7) % DIM] = 0.6;
    topic.subs.forEach((sub, s) => {
      const subDir = Float32Array.from(topicDir);
      subDir[(t * 3 + s + 13) % DIM] += 0.55;
      for (let i = 0; i < topic.perSub; i++) {
        const v = Float32Array.from(subDir, x => x + (random() - 0.5) * 0.25);
        vectors.push({ id, vector: normalize(v) });
        cards.push({ id, tags: [`${topic.name}/${sub}`], links: [] });
        id++;
      }
    });
  });
  return { cards, vectors };
}

const LIBRARY = [
  { name: "JavaScript", subs: ["Symbol", "Promise", "原型"], perSub: 14 },
  { name: "CSS", subs: ["定位", "布局", "动画"], perSub: 12 },
  { name: "Python", subs: ["序列", "装饰器"], perSub: 14 },
  { name: "Linux", subs: ["命令", "Shell编程"], perSub: 12 },
  { name: "Canvas", subs: ["变换", "图片"], perSub: 11 },
  { name: "学习方法", subs: ["读书", "费曼"], perSub: 11 },
  { name: "DOM", subs: ["选区", "事件"], perSub: 11 },
];

describe("meanPool", () => {
  it("分块取均值后归一化", () => {
    const [card] = meanPool(new Map([[1, [new Float32Array([1, 0]), new Float32Array([0, 1])]]]));
    expect(card.vector[0]).toBeCloseTo(Math.SQRT1_2, 6);
    expect(card.vector[1]).toBeCloseTo(Math.SQRT1_2, 6);
  });

  it("丢掉维度不一致的残留分块，零向量不参与", () => {
    const pooled = meanPool(
      new Map([
        [1, [new Float32Array([1, 0]), new Float32Array([1, 0, 0])]],
        [2, [new Float32Array([0, 0])]],
      ])
    );
    expect(pooled.map(p => p.id)).toEqual([1]);
    expect(pooled[0].vector[0]).toBeCloseTo(1, 6);
  });
});

describe("knn", () => {
  it("按相似度降序返回最近的 k 个，不含自己", () => {
    const vectors: CardVector[] = [
      { id: 1, vector: normalize(new Float32Array([1, 0])) },
      { id: 2, vector: normalize(new Float32Array([0.9, 0.1])) },
      { id: 3, vector: normalize(new Float32Array([0.6, 0.4])) },
      { id: 4, vector: normalize(new Float32Array([0, 1])) },
    ];
    const result = knn(vectors, 2, 0);
    expect(result[0].map(n => n.index)).toEqual([1, 2]);
    expect(result[0][0].similarity).toBeGreaterThan(result[0][1].similarity);
  });

  it("低于相似度下限的不算近邻（不把无关卡片硬拽进主题）", () => {
    const vectors: CardVector[] = [
      { id: 1, vector: new Float32Array([1, 0]) },
      { id: 2, vector: new Float32Array([0, 1]) },
    ];
    expect(knn(vectors, 3, 0.35)[0]).toEqual([]);
  });

  it("700 张 × 1024 维在 3 秒内（当前真实规模）", () => {
    const random = seeded(3);
    const vectors: CardVector[] = Array.from({ length: 700 }, (_, i) => ({
      id: i,
      vector: normalize(Float32Array.from({ length: 1024 }, () => random() - 0.5)),
    }));
    const start = performance.now();
    knn(vectors, 8, 0);
    expect(performance.now() - start).toBeLessThan(3000);
  });
});

describe("命名", () => {
  it("分层 tag 按斜杠切，兼容全角与空白", () => {
    expect(tagPath("JavaScript/Symbol")).toEqual(["JavaScript", "Symbol"]);
    expect(tagPath(" CSS ／ 定位 / ")).toEqual(["CSS", "定位"]);
  });

  it("大主题取 tag 首段的众数，只给一个名字", () => {
    const label = topicLabel([
      { tags: ["JavaScript/Symbol"] },
      { tags: ["JavaScript/Promise"] },
      { tags: ["CSS/定位"] },
    ]);
    expect(label).toBe("JavaScript");
  });

  it("子主题取父主题之下的下一段，不重复父主题名", () => {
    const label = subtopicLabel(
      [{ tags: ["JavaScript/Symbol/迭代器"] }, { tags: ["JavaScript/Symbol"] }],
      "JavaScript"
    );
    expect(label).toBe("Symbol");
  });

  it("大主题名永远来自 tag，不会是一句正文；全员无 tag 时为空", () => {
    expect(topicLabel([{ tags: [] }, { tags: ["零星"] }, { tags: [] }])).toBe("零星");
    expect(topicLabel([{ tags: [] }, { tags: [] }])).toBe("");
  });

  it("首段分散的主题也取众数，而不是退化成正文", () => {
    const label = topicLabel([
      { tags: ["学习方法"] },
      { tags: ["学习方法/笔记分类"] },
      { tags: ["读书/驱动力"] },
      { tags: ["随笔"] },
    ]);
    expect(label).toBe("学习方法");
  });

  it("子主题：tag 只有一段的成员不拖累覆盖率", () => {
    const label = subtopicLabel(
      [
        { tags: ["JavaScript"] },
        { tags: ["JavaScript"] },
        { tags: ["JavaScript"] },
        { tags: ["JavaScript/Promise"] },
        { tags: ["JavaScript/Promise"] },
      ],
      "JavaScript"
    );
    expect(label).toBe("Promise");
  });

  it("子主题：混入的别家首段直接作名字（「JavaScript」主题里的「DOM/选区」）", () => {
    expect(subtopicLabel([{ tags: ["DOM/选区"] }, { tags: ["DOM/事件"] }], "JavaScript")).toBe(
      "DOM"
    );
  });

  it("子主题：取不到够格的名字就不显示，绝不拿正文凑", () => {
    expect(subtopicLabel([{ tags: ["JavaScript"] }, { tags: ["JavaScript"] }], "JavaScript")).toBe(
      ""
    );
    expect(
      subtopicLabel([{ tags: ["JavaScript/甲"] }, { tags: ["JavaScript/乙"] }], "JavaScript")
    ).toBe("");
  });
});

describe("computeKnowledgeMap", () => {
  const { cards, vectors } = syntheticLibrary(LIBRARY);
  const map = computeKnowledgeMap(cards, vectors, { now: 0 });
  const topics = map.topics.filter(t => t.parent === -1);
  const subtopics = map.topics.filter(t => t.parent !== -1);

  it("没有任何显式链接，也按语义分出了大主题", () => {
    expect(cards.every(c => c.links.length === 0)).toBe(true);
    expect(topics.length).toBeGreaterThanOrEqual(6);
    expect(topics.length).toBeLessThanOrEqual(TOPIC_PALETTE_SIZE);
  });

  it("大主题名就是 tag 首段，一个主题一个完整的名字", () => {
    const names = new Set(topics.map(t => t.label));
    for (const topic of LIBRARY) expect(names.has(topic.name)).toBe(true);
    for (const t of topics) expect(t.label).not.toContain("·");
  });

  it("绝大多数卡片归入了主题（不再是外圈一大片孤点）", () => {
    const assigned = map.nodes.filter(n => n.topic >= 0).length;
    expect(assigned / map.nodes.length).toBeGreaterThan(0.95);
  });

  it("同一 tag 首段的卡片落在同一个大主题里", () => {
    const topicByCard = new Map(map.nodes.map(n => [n.cardId, n.topic]));
    for (const topic of LIBRARY) {
      const members = cards.filter(c => c.tags[0].startsWith(`${topic.name}/`));
      const owners = new Set(members.map(c => topicByCard.get(c.id)));
      expect(owners.size).toBe(1);
    }
  });

  it("子主题挂在大主题下、名字是 tag 的下一段且不重复父名", () => {
    expect(subtopics.length).toBeGreaterThan(0);
    const byId = new Map(map.topics.map(t => [t.id, t]));
    for (const sub of subtopics) {
      const parent = byId.get(sub.parent)!;
      expect(parent.parent).toBe(-1);
      expect(sub.label).not.toBe(parent.label);
      expect(sub.colorSlot).toBe(parent.colorSlot);
    }
    const jsSubs = subtopics
      .filter(s => byId.get(s.parent)!.label === "JavaScript")
      .map(s => s.label);
    expect(jsSubs).toEqual(expect.arrayContaining(["Symbol", "Promise", "原型"]));
  });

  it("大主题的色槽互不相同", () => {
    const slots = topics.map(t => t.colorSlot);
    expect(new Set(slots).size).toBe(slots.length);
  });

  it("同一主题的卡片在空间上聚在一起，不同主题之间有距离", () => {
    const centroid = (topicId: number) => {
      const members = map.nodes.filter(n => n.topic === topicId);
      return {
        x: members.reduce((s, n) => s + n.x, 0) / members.length,
        y: members.reduce((s, n) => s + n.y, 0) / members.length,
        spread: members.reduce((s, n) => s + Math.hypot(n.x, n.y), 0) / members.length,
      };
    };
    const spreadOf = (topicId: number) => {
      const c = centroid(topicId);
      const members = map.nodes.filter(n => n.topic === topicId);
      return members.reduce((s, n) => s + Math.hypot(n.x - c.x, n.y - c.y), 0) / members.length;
    };
    const [a, b] = topics;
    const ca = centroid(a.id);
    const cb = centroid(b.id);
    const between = Math.hypot(ca.x - cb.x, ca.y - cb.y);
    expect(between).toBeGreaterThan(spreadOf(a.id) + spreadOf(b.id));
  });

  it("结果确定：同样的输入得到同样的地图", () => {
    const again = computeKnowledgeMap(cards, vectors, { now: 0 });
    expect(again).toEqual(map);
  });

  it("坐标全部有限", () => {
    for (const node of map.nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
    }
  });

  it("主题名不变则颜色不变：加一个新主题不会让已有主题换色", () => {
    const extended = syntheticLibrary([
      ...LIBRARY,
      { name: "Rust", subs: ["所有权", "生命周期"], perSub: 12 },
    ]);
    const next = computeKnowledgeMap(extended.cards, extended.vectors, { now: 0 });
    const slotOf = (m: typeof map, label: string) =>
      m.topics.find(t => t.parent === -1 && t.label === label)?.colorSlot;
    for (const topic of LIBRARY) {
      expect(slotOf(next, topic.name)).toBe(slotOf(map, topic.name));
    }
  });

  it("没有向量的卡片（未配置 embedding）只靠显式链接也能跑，不抛错", () => {
    const linked: KnowledgeMapCardInput[] = Array.from({ length: 30 }, (_, i) => ({
      id: i + 1,
      tags: [i < 15 ? "甲/一" : "乙/二"],
      links: i % 15 === 0 ? [] : [i],
    }));
    const result = computeKnowledgeMap(linked, [], { now: 0, ticks: 60 });
    expect(result.nodes).toHaveLength(30);
  });

  it("主题数超过色槽、且主题间在图上互不相连时，合并靠向量相似度，绝不丢卡片", () => {
    // 14 个互不相连的语义孤岛，远超 10 个色槽
    const many = syntheticLibrary(
      Array.from({ length: 14 }, (_, i) => ({ name: `主题${i}`, subs: ["甲"], perSub: 10 })),
      11
    );
    const result = computeKnowledgeMap(many.cards, many.vectors, { now: 0, ticks: 60 });
    const topicCount = result.topics.filter(t => t.parent === -1).length;
    expect(topicCount).toBeLessThanOrEqual(TOPIC_PALETTE_SIZE);
    expect(result.nodes.every(n => n.topic >= 0)).toBe(true);
  });

  it("空输入返回空地图", () => {
    expect(computeKnowledgeMap([], [], { now: 5 })).toEqual({
      nodes: [],
      topics: [],
      computedAt: 5,
    });
  });
});

describe("placeIncrementally", () => {
  const { cards, vectors } = syntheticLibrary(LIBRARY.slice(0, 3));
  const map = computeKnowledgeMap(cards, vectors, { now: 0, ticks: 80 });

  it("落在语义近邻附近，并继承它们的多数主题", () => {
    const near = map.nodes.filter(n => n.topic === 0).slice(0, 5);
    const placed = placeIncrementally(map, {
      id: 9999,
      neighbors: near.map(n => ({ cardId: n.cardId, similarity: 0.8 })),
    });
    expect(placed.topic).toBe(0);
    const cx = near.reduce((s, n) => s + n.x, 0) / near.length;
    const cy = near.reduce((s, n) => s + n.y, 0) / near.length;
    expect(Math.hypot(placed.x - cx, placed.y - cy)).toBeLessThan(20);
  });

  it("子主题只从选中的大主题里取", () => {
    const near = map.nodes.filter(n => n.topic === 0).slice(0, 4);
    const placed = placeIncrementally(map, {
      id: 9998,
      neighbors: near.map(n => ({ cardId: n.cardId, similarity: 0.9 })),
    });
    if (placed.subtopic >= 0) {
      expect(map.topics.find(t => t.id === placed.subtopic)!.parent).toBe(placed.topic);
    }
  });

  it("没有已在图上的近邻时放到外圈、未归类", () => {
    const placed = placeIncrementally(map, { id: 9997, neighbors: [] });
    expect(placed.topic).toBe(-1);
    const extent = Math.max(...map.nodes.map(n => Math.hypot(n.x, n.y)));
    expect(Math.hypot(placed.x, placed.y)).toBeGreaterThan(extent);
  });
});
