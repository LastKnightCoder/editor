import { describe, expect, it } from "vitest";
import { reciprocalRankFusion } from "../rrf";
import type { SearchCandidate } from "../types";

type Payload = {
  id: string;
};

const candidate = (id: string, dedupeKey = id): SearchCandidate<Payload> => ({
  key: dedupeKey,
  dedupeKey,
  source: "fts",
  payload: { id },
  text: id,
});

describe("search-core/rrf", () => {
  it("应按 RRF 分数融合并排序", () => {
    const listA = [candidate("a"), candidate("b"), candidate("c")];
    const listB = [candidate("b"), candidate("a"), candidate("d")];
    const merged = reciprocalRankFusion([listA, listB], [1, 1], {
      k: 60,
      topBonus: { top1: 0.05, top2To3: 0.02 },
    });
    expect(merged[0]?.dedupeKey).toBe("a");
    expect(merged.some((item) => item.dedupeKey === "d")).toBe(true);
  });

  it("应给 top rank 结果加 bonus", () => {
    const merged = reciprocalRankFusion(
      [[candidate("a"), candidate("b")]],
      [1],
      {
        k: 60,
        topBonus: { top1: 0.05, top2To3: 0.02 },
      },
    );
    const a = merged.find((item) => item.dedupeKey === "a");
    const b = merged.find((item) => item.dedupeKey === "b");
    expect((a?.rrfScore || 0) > (b?.rrfScore || 0)).toBe(true);
  });
});
