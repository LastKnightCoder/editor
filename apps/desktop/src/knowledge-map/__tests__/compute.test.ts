/**
 * 知识地图离线管线。合成数据刻意模仿真实卡片库的形状：
 * 按主题成团的向量 + 分层 tag + 绝大多数卡片没有显式链接——
 * 这正是「只靠链接分簇」失败的场景，新管线必须在这里分得出主题。
 */

import { describe, expect, it } from "vitest";
import { computeKnowledgeMap, placeIncrementally, topicAffinity, topicTarget } from "../compute";
import { subtopicLabel, tagPath, topicLabel } from "../labels";
import { NO_COLOR_SLOT, TOPIC_PALETTE_SIZE, type KnowledgeMapNodeInput } from "../types";
import { capInDegree, knn, meanPool, type CardVector } from "../vectors";

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
  const cards: KnowledgeMapNodeInput[] = [];
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
        cards.push({ id, key: `card:${id}`, tags: [`${topic.name}/${sub}`], links: [] });
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

  it("与「每个点独立扫全表」的朴素实现结果一致（只算上三角不改变语义）", () => {
    const random = seeded(11);
    // 刻意造成团的向量：相似度有高有低，前 k 的边界才会被真正考验
    const vectors: CardVector[] = Array.from({ length: 120 }, (_, i) => {
      const v = new Float32Array(24);
      v[i % 6] = 1;
      for (let d = 0; d < 24; d++) v[d] += (random() - 0.5) * 0.8;
      return { id: i, vector: normalize(v) };
    });
    const naive = vectors.map((self, i) => {
      const all = vectors
        .map((other, j) => ({
          index: j,
          similarity: self.vector.reduce((sum, x, d) => sum + x * other.vector[d], 0),
        }))
        .filter(n => n.index !== i && n.similarity >= 0.3);
      all.sort((x, y) => y.similarity - x.similarity || x.index - y.index);
      return all.slice(0, 8).map(n => n.index);
    });
    expect(knn(vectors, 8, 0.3).map(list => list.map(n => n.index))).toEqual(naive);
  });

  // 只留一条时间门禁，而且只在当前真实规模上：更大规模的绝对耗时断言在
  // 全量测试（350 个文件并行）里会被 CPU 抢占拖垮，2000 张那条见过 3.3s / 5.2s 的抖动。
  // 防算法退化主要靠上面那条「与朴素实现结果一致」，性能靠 §7.3 记录的压测数字盯
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
    const topicByCard = new Map(map.nodes.map(n => [n.key, n.topic]));
    for (const topic of LIBRARY) {
      const members = cards.filter(c => c.tags[0].startsWith(`${topic.name}/`));
      const owners = new Set(members.map(c => topicByCard.get(c.key)));
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

  it("子主题沿用父主题色槽", () => {
    const byId = new Map(map.topics.map(t => [t.id, t]));
    for (const sub of subtopics) expect(sub.colorSlot).toBe(byId.get(sub.parent)!.colorSlot);
  });

  it("没有向量的卡片（未配置 embedding）只靠显式链接也能跑，不抛错", () => {
    const linked: KnowledgeMapNodeInput[] = Array.from({ length: 30 }, (_, i) => ({
      id: i + 1,
      key: `card:${i + 1}`,
      tags: [i < 15 ? "甲/一" : "乙/二"],
      links: i % 15 === 0 ? [] : [i],
    }));
    const result = computeKnowledgeMap(linked, [], { now: 0, ticks: 60 });
    expect(result.nodes).toHaveLength(30);
  });

  it("空输入返回空地图", () => {
    expect(computeKnowledgeMap([], [], { now: 5 })).toEqual({
      nodes: [],
      topics: [],
      computedAt: 5,
    });
  });
});

describe("topicTarget：目标主题数随规模按对数变化", () => {
  it("小库少、大库多，但不线性膨胀", () => {
    expect(topicTarget(50).ideal).toBe(5);
    expect(topicTarget(700).ideal).toBe(9);
    expect(topicTarget(20000).ideal).toBe(13);
    expect(topicTarget(1_000_000).ideal).toBe(16);
    expect(topicTarget(3).ideal).toBe(4);
  });

  it("区间包住 ideal", () => {
    for (const n of [10, 674, 20000]) {
      const t = topicTarget(n);
      expect(t.min).toBeLessThanOrEqual(t.ideal);
      expect(t.max).toBeGreaterThanOrEqual(t.ideal);
    }
  });
});

/**
 * 多种数据形状：门槛不能只在一份真实数据上校准。
 * 每种形状都断言三条不变量——不丢卡、名字只来自 tag、每个主题都有颜色（前 10 个互不相同，
 * 多出的循环复用但不与地图上的邻居同色）。
 */
/** 两个主题的岛之间最近的两张卡的距离 */
function islandGap(map: ReturnType<typeof computeKnowledgeMap>, a: number, b: number) {
  const left = map.nodes.filter(n => n.topic === a);
  const right = map.nodes.filter(n => n.topic === b);
  let best = Infinity;
  for (const p of left)
    for (const q of right) best = Math.min(best, Math.hypot(p.x - q.x, p.y - q.y));
  return best;
}

describe("computeKnowledgeMap：多种数据形状", () => {
  const invariants = (cards: KnowledgeMapNodeInput[], vectors: CardVector[]) => {
    const result = computeKnowledgeMap(cards, vectors, { now: 0, ticks: 60 });
    // 不丢卡：每张卡都在地图上，坐标有限
    expect(result.nodes.map(n => n.key).sort()).toEqual(cards.map(c => c.key).sort());
    for (const node of result.nodes) expect(Number.isFinite(node.x + node.y)).toBe(true);
    // 名字只来自 tag：大主题名是某个 tag 首段，子主题名是某个 tag 的某一段
    const heads = new Set(cards.flatMap(c => c.tags.map(t => tagPath(t)[0])));
    const parts = new Set(cards.flatMap(c => c.tags.flatMap(t => tagPath(t))));
    const tops = result.topics.filter(t => t.parent === -1);
    for (const t of tops) if (t.label) expect(heads.has(t.label)).toBe(true);
    for (const t of result.topics.filter(t => t.parent !== -1)) {
      if (t.label) expect(parts.has(t.label)).toBe(true);
    }
    // 色槽：每个主题都有颜色，前 TOPIC_PALETTE_SIZE 大的互不相同
    const ranked = [...tops].sort((a, b) => b.size - a.size || a.id - b.id);
    for (const t of tops) {
      expect(t.colorSlot).toBeGreaterThanOrEqual(0);
      expect(t.colorSlot).toBeLessThan(TOPIC_PALETTE_SIZE);
    }
    const colored = ranked.slice(0, TOPIC_PALETTE_SIZE).map(t => t.colorSlot);
    expect(new Set(colored).size).toBe(colored.length);
    // 同色的两个主题在地图上不挨着：两岛之间最近的两张卡也隔着一段距离
    for (let i = 0; i < tops.length; i++) {
      for (let j = i + 1; j < tops.length; j++) {
        if (tops[i].colorSlot !== tops[j].colorSlot) continue;
        // 相邻的岛之间约 100（圆盘间距 70 + 边缘松弛），同色的至少隔开一个岛
        expect(islandGap(result, tops[i].id, tops[j].id)).toBeGreaterThan(150);
      }
    }
    return { result, tops };
  };

  it("小库（约 50 张）：分出少量主题，不硬凑到 9 个", () => {
    const { cards, vectors } = syntheticLibrary(
      [
        { name: "JavaScript", subs: ["Promise", "原型"], perSub: 9 },
        { name: "CSS", subs: ["布局", "动画"], perSub: 8 },
        { name: "读书", subs: ["方法"], perSub: 16 },
      ],
      21
    );
    const { tops } = invariants(cards, vectors);
    expect(tops.length).toBeGreaterThanOrEqual(2);
    expect(tops.length).toBeLessThanOrEqual(5);
    expect(new Set(tops.map(t => t.label))).toEqual(new Set(["JavaScript", "CSS", "读书"]));
  });

  it("主题天然多于色槽：得到 >10 个主题，颜色循环复用而不是被并掉或变灰", () => {
    // 14 个互不相连的语义孤岛
    const many = syntheticLibrary(
      Array.from({ length: 14 }, (_, i) => ({ name: `主题${i}`, subs: ["甲"], perSub: 10 })),
      11
    );
    const { result, tops } = invariants(many.cards, many.vectors);
    expect(tops.length).toBe(14);
    expect(tops.every(t => t.colorSlot !== NO_COLOR_SLOT)).toBe(true);
    expect(new Set(tops.map(t => t.colorSlot)).size).toBe(TOPIC_PALETTE_SIZE);
    expect(result.nodes.every(n => n.topic >= 0)).toBe(true);
  });

  it("单一主题的库：一个主题，不为了凑数而拆", () => {
    const { cards, vectors } = syntheticLibrary(
      [{ name: "JavaScript", subs: ["Promise", "原型", "Symbol"], perSub: 20 }],
      5
    );
    const { tops } = invariants(cards, vectors);
    expect(tops.map(t => t.label)).toEqual(["JavaScript"]);
  });

  it("没有分层 tag（全是一段）：主题照分，只是没有子主题名", () => {
    const { cards, vectors } = syntheticLibrary(LIBRARY.slice(0, 4), 9);
    for (const card of cards) card.tags = card.tags.map(tag => tagPath(tag)[0]);
    const { result, tops } = invariants(cards, vectors);
    expect(tops.length).toBeGreaterThanOrEqual(3);
    expect(result.topics.filter(t => t.parent !== -1 && t.label)).toHaveLength(0);
  });

  it("tag 很少：取不到名字的主题宁可无名，绝不拿正文凑", () => {
    const { cards, vectors } = syntheticLibrary(LIBRARY.slice(0, 4), 13);
    // 只有前两个主题的一半卡片保留 tag
    cards.forEach((card, i) => {
      if (!card.tags[0].startsWith("JavaScript/") || i % 2 === 1) card.tags = [];
    });
    const { tops } = invariants(cards, vectors);
    expect(tops.some(t => t.label === "JavaScript")).toBe(true);
    expect(tops.every(t => t.label === "" || t.label === "JavaScript")).toBe(true);
  });

  it("名字没因拆分变准就不拆：一片首段分散但语义连成一块的主题保持完整", () => {
    // 同一个语义方向，tag 首段五花八门（真实数据里的人文类卡片）
    const { cards, vectors } = syntheticLibrary(
      [{ name: "杂", subs: ["一", "二", "三"], perSub: 20 }],
      17
    );
    const heads = ["经济", "概念", "随笔", "心理学", "读书"];
    cards.forEach((card, i) => (card.tags = [`${heads[i % heads.length]}/x`]));
    const { tops } = invariants(cards, vectors);
    expect(tops).toHaveLength(1);
  });
});

describe("computeKnowledgeMap：主题摆放与跨主题连线", () => {
  const centerOf = (map: ReturnType<typeof computeKnowledgeMap>, topic: number) => {
    const members = map.nodes.filter(n => n.topic === topic);
    return {
      x: members.reduce((s, n) => s + n.x, 0) / members.length,
      y: members.reduce((s, n) => s + n.y, 0) / members.length,
    };
  };

  /**
   * 在 JavaScript/Symbol 与 Linux/命令 之间连几条链接：语义上两个主题互不相关，本来不会挨着。
   * 只连同一对子主题：岛内朝向会把这两个子主题转到相对的一侧；落在背面子主题里的卡片
   * 留在自己的子主题里（锚点力占上风），不在这条断言的范围内
   */
  function linkedLibrary() {
    const { cards, vectors } = syntheticLibrary(LIBRARY);
    const js = cards.filter(c => c.tags[0] === "JavaScript/Symbol");
    const linux = cards.filter(c => c.tags[0] === "Linux/命令");
    const pairs = Array.from({ length: 4 }, (_, i) => [js[i * 3], linux[i * 3]] as const);
    for (const [a, b] of pairs) a.links.push(b.id);
    return { cards, vectors, pairs };
  }

  it("亲近度按较小一方的规模归一：小主题的关系大半指向谁，谁就是它最亲近的", () => {
    // 主题 0、1 各 100 张，互相 30 条边；主题 2 只有 5 张，与主题 0 有 4 条边
    const sizes = [100, 100, 5];
    const topicOf = [0, 1, 2];
    const edges = [
      ...Array.from({ length: 30 }, () => ({ source: 0, target: 1, weight: 1, explicit: false })),
      ...Array.from({ length: 4 }, () => ({ source: 2, target: 0, weight: 1, explicit: false })),
    ];
    const affinity = topicAffinity(edges, topicOf, sizes);
    // 原始边权 30 : 4，归一后 0.3 : 0.8——小主题 2 与 0 才是最亲近的一对
    expect(affinity.get("0-1")!.weight).toBeCloseTo(0.3);
    expect(affinity.get("0-2")!.weight).toBeCloseTo(0.8);
  });

  it("亲近度：显式链接额外加权，主题内部的边与未归类的卡片不计", () => {
    const affinity = topicAffinity(
      [
        { source: 0, target: 1, weight: 1, explicit: true },
        { source: 0, target: 2, weight: 1, explicit: false },
        { source: 0, target: 3, weight: 1, explicit: false },
        { source: 1, target: 4, weight: 1, explicit: false },
      ],
      [0, 1, 2, 0, -1],
      [10, 10, 10]
    );
    expect(affinity.get("0-1")!.weight).toBeGreaterThan(affinity.get("0-2")!.weight * 2);
    expect([...affinity.keys()].sort()).toEqual(["0-1", "0-2"]);
  });

  it("用户亲手连过的两个主题摆在一起", () => {
    const plain = syntheticLibrary(LIBRARY);
    const before = computeKnowledgeMap(plain.cards, plain.vectors, { now: 0, ticks: 80 });
    const { cards, vectors } = linkedLibrary();
    const after = computeKnowledgeMap(cards, vectors, { now: 0, ticks: 80 });
    const topicOf = (map: typeof after, label: string) =>
      map.topics.find(t => t.parent === -1 && t.label === label)!.id;
    const gap = (map: typeof after) =>
      islandGap(map, topicOf(map, "JavaScript"), topicOf(map, "Linux"));
    expect(gap(after)).toBeLessThan(gap(before));
    // 相邻岛约 100（见上方色槽断言的注释）
    expect(gap(after)).toBeLessThan(100);
  });

  it("桥接卡片落在岛上面向对方主题的一侧，连线远短于两岛中心距离", () => {
    const { cards, vectors, pairs } = linkedLibrary();
    const map = computeKnowledgeMap(cards, vectors, { now: 0, ticks: 80 });
    const node = new Map(map.nodes.map(n => [n.key, n]));
    for (const [a, b] of pairs) {
      const p = node.get(a.key)!;
      const q = node.get(b.key)!;
      const cp = centerOf(map, p.topic);
      const cq = centerOf(map, q.topic);
      const span = Math.hypot(cq.x - cp.x, cq.y - cp.y);
      const ux = (cq.x - cp.x) / span;
      const uy = (cq.y - cp.y) / span;
      // 两端各自在「朝向对方」方向上的投影为正
      expect((p.x - cp.x) * ux + (p.y - cp.y) * uy).toBeGreaterThan(0);
      expect((cq.x - q.x) * ux + (cq.y - q.y) * uy).toBeGreaterThan(0);
      // 只靠岛内朝向（不加桥接弱力）时最长的一条约为中心距的 0.53，加上后约 0.33
      expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeLessThan(span * 0.45);
    }
  });
});

describe("placeIncrementally", () => {
  const { cards, vectors } = syntheticLibrary(LIBRARY.slice(0, 3));
  const map = computeKnowledgeMap(cards, vectors, { now: 0, ticks: 80 });

  it("落在语义近邻附近，并继承它们的多数主题", () => {
    const near = map.nodes.filter(n => n.topic === 0).slice(0, 5);
    const placed = placeIncrementally(map, {
      key: "card:9999",
      seed: 9999,
      neighbors: near.map(n => ({ key: n.key, similarity: 0.8 })),
    });
    expect(placed.topic).toBe(0);
    const cx = near.reduce((s, n) => s + n.x, 0) / near.length;
    const cy = near.reduce((s, n) => s + n.y, 0) / near.length;
    expect(Math.hypot(placed.x - cx, placed.y - cy)).toBeLessThan(20);
  });

  it("子主题只从选中的大主题里取", () => {
    const near = map.nodes.filter(n => n.topic === 0).slice(0, 4);
    const placed = placeIncrementally(map, {
      key: "card:9998",
      seed: 9998,
      neighbors: near.map(n => ({ key: n.key, similarity: 0.9 })),
    });
    if (placed.subtopic >= 0) {
      expect(map.topics.find(t => t.id === placed.subtopic)!.parent).toBe(placed.topic);
    }
  });

  it("没有已在图上的近邻时放到外圈、未归类", () => {
    const placed = placeIncrementally(map, { key: "card:9997", seed: 9997, neighbors: [] });
    expect(placed.topic).toBe(-1);
    const extent = Math.max(...map.nodes.map(n => Math.hypot(n.x, n.y)));
    expect(Math.hypot(placed.x, placed.y)).toBeGreaterThan(extent);
  });
});

describe("capInDegree", () => {
  it("每个向量只保留相似度最高的 cap 条入边，其余入边删掉", () => {
    const neighbors = [
      [{ index: 3, similarity: 0.9 }],
      [
        { index: 3, similarity: 0.5 },
        { index: 2, similarity: 0.4 },
      ],
      [{ index: 3, similarity: 0.7 }],
      [],
    ];
    expect(capInDegree(neighbors, 2)).toEqual([
      [{ index: 3, similarity: 0.9 }],
      [{ index: 2, similarity: 0.4 }],
      [{ index: 3, similarity: 0.7 }],
      [],
    ]);
  });

  it("没有超限时原样返回", () => {
    const neighbors = [[{ index: 1, similarity: 0.6 }], [{ index: 0, similarity: 0.6 }]];
    expect(capInDegree(neighbors, 2)).toBe(neighbors);
  });
});
