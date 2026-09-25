import { describe, expect, it } from "vitest";
import { runSearchPipeline } from "../pipeline";
import type { SearchAdapter, SearchCandidate } from "../types";

type Payload = {
  id: string;
  title: string;
  content: string;
  score?: number;
};

const toCandidate = (
  id: string,
  source: "fts" | "vec",
  score: number
): SearchCandidate<Payload> => ({
  key: id,
  dedupeKey: id,
  source,
  payload: {
    id,
    title: id,
    content: `${id} content`,
  },
  text: `${id} content`,
  snippet: `${id} snippet`,
  retrievalScore: score,
});

function createAdapter(): SearchAdapter<Payload, { enableVec: boolean }> {
  return {
    name: "test-adapter",
    canUseVector(context) {
      return context.enableVec;
    },
    async searchFTS() {
      return [toCandidate("a", "fts", 0.7), toCandidate("b", "fts", 0.5)];
    },
    async searchVec() {
      return [toCandidate("b", "vec", 0.8), toCandidate("d", "vec", 0.6)];
    },
    finalize(result) {
      return {
        ...result.payload,
        score: result.finalScore,
      };
    },
  };
}

describe("search-core/pipeline", () => {
  it("应在向量不可用时降级到 FTS-only", async () => {
    const result = await runSearchPipeline({
      query: "test query",
      limit: 5,
      context: { enableVec: false },
      adapter: createAdapter(),
    });

    expect(result.results.length).toBeGreaterThan(0);
    expect(result.log.degradeReason.includes("vector-unavailable")).toBe(true);
  });

  it("FTS 与向量双路均不可用时应返回空结果", async () => {
    const result = await runSearchPipeline({
      query: "test query",
      limit: 5,
      context: { enableVec: false },
      adapter: {
        ...createAdapter(),
        async searchFTS() {
          return [];
        },
      },
    });

    expect(result.results).toEqual([]);
  });

  it("应按 dedupeKey 稳定去重", async () => {
    const adapter = createAdapter();
    adapter.searchFTS = async () => [
      toCandidate("dup", "fts", 0.8),
      {
        ...toCandidate("dup-2", "fts", 0.7),
        dedupeKey: "dup",
      },
    ];
    adapter.searchVec = async () => [
      {
        ...toCandidate("dup-vec", "vec", 0.9),
        dedupeKey: "dup",
      },
      toCandidate("x", "vec", 0.5),
    ];

    const result = await runSearchPipeline({
      query: "dedupe test",
      limit: 10,
      context: { enableVec: true },
      adapter,
    });

    const ids = result.results.map(item => item.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
  });
});
