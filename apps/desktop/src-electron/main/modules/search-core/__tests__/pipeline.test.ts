import { describe, expect, it, vi } from "vitest";
import { runSearchPipeline } from "../pipeline";
import type {
  ParsedQuery,
  QueryExpander,
  Reranker,
  SearchAdapter,
  SearchCandidate,
} from "../types";

type Payload = {
  id: string;
  title: string;
  content: string;
  score?: number;
};

const toCandidate = (
  id: string,
  source: "fts" | "vec",
  score: number,
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
    async probeStrongSignal(_query: ParsedQuery) {
      return {
        candidates: [
          toCandidate("a", "fts", 0.7),
          toCandidate("b", "fts", 0.5),
        ],
        topScore: 0.7,
        secondScore: 0.5,
      };
    },
    async searchFTS(queryText: string) {
      if (queryText.includes("expand")) {
        return [toCandidate("c", "fts", 0.4)];
      }
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
  it("应在 reranker 不可用时降级到 RRF-only", async () => {
    const expander: QueryExpander = {
      name: "noop-expander",
      async expand() {
        return {
          available: false,
          used: false,
          queries: [],
          reason: "test noop",
        };
      },
    };
    const reranker: Reranker = {
      name: "noop-reranker",
      async rerank() {
        return {
          available: false,
          used: false,
          scores: [],
          reason: "test noop",
        };
      },
    };

    const result = await runSearchPipeline({
      query: "test query",
      limit: 5,
      context: { enableVec: true },
      adapter: createAdapter(),
      expander,
      reranker,
    });

    expect(result.results.length).toBeGreaterThan(0);
    expect(result.log.degradeReason.includes("reranker-unavailable")).toBe(
      true,
    );
  });

  it("强信号时应跳过扩展", async () => {
    const expander = {
      name: "local-query-expander" as const,
      expand: vi.fn(async () => ({
        available: true,
        used: true,
        queries: [{ type: "lex" as const, text: "expand query" }],
      })),
    };
    const reranker: Reranker = {
      name: "noop-reranker",
      async rerank() {
        return {
          available: false,
          used: false,
          scores: [],
        };
      },
    };

    const adapter = createAdapter();
    adapter.probeStrongSignal = async () => ({
      candidates: [toCandidate("a", "fts", 0.95), toCandidate("b", "fts", 0.7)],
      topScore: 0.95,
      secondScore: 0.7,
    });

    const result = await runSearchPipeline({
      query: "strong signal",
      limit: 5,
      context: { enableVec: false },
      adapter,
      expander,
      reranker,
    });

    expect(expander.expand).not.toHaveBeenCalled();
    expect(
      result.log.degradeReason.includes("strong-signal-skip-expansion"),
    ).toBe(true);
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
      expander: {
        name: "noop-expander",
        async expand() {
          return { available: false, used: false, queries: [] };
        },
      },
      reranker: {
        name: "noop-reranker",
        async rerank() {
          return { available: false, used: false, scores: [] };
        },
      },
    });

    const ids = result.results.map((item) => item.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
  });
});
