import { describe, expect, it } from "vitest";

import {
  pickWalk,
  sampleWalk,
  walkStaleDays,
  type WalkCandidate,
  type WalkSampleOptions,
} from "../random-walk-sampling";

const DAY_MS = 86_400_000;
const NOW = Date.UTC(2026, 9, 13, 12); // 2026-10-13，固定锚点
const TODAY = "2026-10-13";

/** mulberry32：固定种子的确定性随机源 */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const candidate = (overrides: Partial<WalkCandidate>): WalkCandidate => ({
  kind: "card",
  id: 1,
  createTime: NOW - 400 * DAY_MS,
  updateTime: NOW - 400 * DAY_MS,
  lastSeenTime: null,
  dateKey: "2025-03-01",
  ...overrides,
});

const options = (overrides: Partial<WalkSampleOptions> = {}): WalkSampleOptions => ({
  bias: "stale",
  now: NOW,
  today: TODAY,
  random: seededRandom(42),
  ...overrides,
});

describe("walkStaleDays", () => {
  it("从上次漫步与最近更新中取更晚者算天数", () => {
    const item = candidate({ updateTime: NOW - 10 * DAY_MS, lastSeenTime: NOW - 2 * DAY_MS });
    expect(walkStaleDays(item, NOW)).toBeCloseTo(2, 5);
  });

  it("从未更新过且无漫步记录时按创建时间起算，不为负", () => {
    const future = candidate({ createTime: NOW + DAY_MS, updateTime: NOW + DAY_MS });
    expect(walkStaleDays(future, NOW)).toBe(0);
  });
});

describe("sampleWalk 权重方向", () => {
  it("stale 偏好下更久未见的命中率显著更高", () => {
    const stale = candidate({ id: 1, updateTime: NOW - 400 * DAY_MS });
    const fresh = candidate({ id: 2, updateTime: NOW - 1 * DAY_MS });
    let staleHits = 0;
    const rounds = 2000;
    for (let i = 0; i < rounds; i++) {
      const [picked] = sampleWalk([stale, fresh], 1, options({ random: seededRandom(i) }));
      if (picked.candidate.id === 1) staleHits++;
    }
    // log(402) / (log(402) + log(3)) ≈ 85%
    expect(staleHits / rounds).toBeGreaterThan(0.75);
  });

  it("on-this-day 只在往年同月同日里抽，years 为年差", () => {
    const matched = candidate({ id: 1, dateKey: "2024-10-13" });
    const other = candidate({ id: 2, dateKey: "2024-10-12" });
    const thisYear = candidate({ id: 3, dateKey: TODAY });
    for (let i = 0; i < 50; i++) {
      const [picked] = sampleWalk(
        [other, matched, thisYear],
        1,
        options({ bias: "on-this-day", random: seededRandom(i) })
      );
      expect(picked.candidate.id).toBe(1);
      expect(picked.reason).toEqual({ type: "on-this-day", years: 2 });
    }
  });

  it("on-this-day 无候选时回退 stale 并如实标注 reason", () => {
    const onlyFresh = candidate({ id: 2, dateKey: "2026-09-01", updateTime: NOW - DAY_MS });
    const [picked] = sampleWalk([onlyFresh], 1, options({ bias: "on-this-day" }));
    expect(picked.candidate.id).toBe(2);
    expect(picked.reason.type).toBe("stale");
  });

  it("random 偏好等权且 reason 标注为 random", () => {
    const a = candidate({ id: 1, updateTime: NOW - 400 * DAY_MS });
    const b = candidate({ id: 2, updateTime: NOW - DAY_MS });
    let aHits = 0;
    const rounds = 2000;
    for (let i = 0; i < rounds; i++) {
      const [picked] = sampleWalk([a, b], 1, options({ bias: "random", random: seededRandom(i) }));
      expect(picked.reason).toEqual({ type: "random" });
      if (picked.candidate.id === 1) aHits++;
    }
    expect(aHits / rounds).toBeGreaterThan(0.4);
    expect(aHits / rounds).toBeLessThan(0.6);
  });
});

describe("sampleWalk 过滤与边界", () => {
  it("exclude 的实体不被抽中", () => {
    const a = candidate({ id: 1 });
    const b = candidate({ id: 2 });
    for (let i = 0; i < 20; i++) {
      const picked = sampleWalk([a, b], 2, options({ exclude: [{ kind: "card", id: 1 }] }));
      expect(picked.map(p => p.candidate.id)).toEqual([2]);
    }
  });

  it("无放回：count 超过池大小时只返回池内全部", () => {
    const pool = [
      candidate({ id: 1, kind: "article" }),
      candidate({ id: 2, kind: "diary-moment" }),
      candidate({ id: 3, kind: "pdf-annotation" }),
    ];
    const picked = sampleWalk(pool, 5, options());
    expect(picked).toHaveLength(3);
    expect(new Set(picked.map(p => `${p.candidate.kind}:${p.candidate.id}`)).size).toBe(3);
  });

  it("空池：sampleWalk 返回空数组、pickWalk 返回 null", () => {
    expect(sampleWalk([], 3, options())).toEqual([]);
    expect(pickWalk([], options())).toBeNull();
  });

  it("池全部被 exclude 时返回空", () => {
    const a = candidate({ id: 1 });
    expect(pickWalk([a], options({ exclude: [{ kind: "card", id: 1 }] }))).toBeNull();
  });
});
