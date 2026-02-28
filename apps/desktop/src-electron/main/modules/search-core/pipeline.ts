import { blendScore, normalizeRerankScores } from "./blend";
import { parseQuery } from "./query-parser";
import {
  buildQueryRuns,
  calculateLexicalScore,
  normalizeCandidateList,
} from "./retriever";
import { reciprocalRankFusion } from "./rrf";
import {
  DEFAULT_SEARCH_CORE_CONFIG,
  FinalCandidate,
  SearchPipelineLog,
  SearchPipelineParams,
  SearchPipelineResult,
  TypedExpansionQuery,
} from "./types";

const DEFAULT_SNIPPET_LENGTH = 220;
const DEFAULT_CHUNK_LENGTH = 1600;

export async function runSearchPipeline<TPayload extends object, TContext>(
  params: SearchPipelineParams<TPayload, TContext>,
): Promise<SearchPipelineResult<TPayload>> {
  const config = {
    ...DEFAULT_SEARCH_CORE_CONFIG,
    ...params.config,
    topRankBonus: {
      ...DEFAULT_SEARCH_CORE_CONFIG.topRankBonus,
      ...params.config?.topRankBonus,
    },
    blendWeights: {
      ...DEFAULT_SEARCH_CORE_CONFIG.blendWeights,
      ...params.config?.blendWeights,
    },
    strongSignal: {
      ...DEFAULT_SEARCH_CORE_CONFIG.strongSignal,
      ...params.config?.strongSignal,
    },
  };

  const queryId = params.queryId || buildQueryId();
  const latencyByStage: Record<string, number> = {};
  const degradeReasons = new Set<string>();
  let expandUsed = false;
  let rerankUsed = false;
  let ftsCount = 0;
  let vecCount = 0;

  const emitStage = (
    stage:
      | "parse"
      | "strongSignal"
      | "expand"
      | "retrieve"
      | "rrf"
      | "chunk"
      | "rerank"
      | "blend"
      | "finalize"
      | "summary",
    startTime: number,
    detail: Record<string, unknown> = {},
  ) => {
    params.stageLogger?.({
      queryId,
      stage,
      latencyMs: Math.max(0, Date.now() - startTime),
      detail,
    });
  };

  const parseStart = Date.now();
  const parsedQuery = parseQuery(params.query);
  emitStage("parse", parseStart, {
    rawLength: params.query.length,
    normalizedLength: parsedQuery.normalized.length,
    tokenCount: parsedQuery.tokens.length,
    isEmpty: parsedQuery.isEmpty,
  });
  if (parsedQuery.isEmpty) {
    const emptyLog = buildLog({
      queryId,
      expandUsed,
      rerankUsed,
      ftsCount,
      vecCount,
      candidateCount: 0,
      latencyByStage,
      degradeReasons: new Set(["query-empty"]),
    });
    emitStage("summary", Date.now(), {
      resultCount: 0,
      log: emptyLog,
    });
    params.logger?.(emptyLog);
    return {
      results: [],
      log: emptyLog,
    };
  }

  const limit = Math.max(1, params.limit ?? 10);
  const perQueryLimit = Math.max(limit, config.perQueryLimit);

  const probeStart = Date.now();
  let probeCandidates: ReturnType<typeof normalizeCandidateList<TPayload>> = [];
  let topProbeScore = 0;
  let secondProbeScore = 0;
  let hasStrongSignal = false;

  try {
    const probe = await params.adapter.probeStrongSignal(
      parsedQuery,
      params.context,
      perQueryLimit,
    );
    probeCandidates = normalizeCandidateList(probe.candidates || []);
    topProbeScore =
      probe.topScore ??
      probeCandidates[0]?.retrievalScore ??
      calculateLexicalScore(parsedQuery, probeCandidates[0]?.text || "");
    secondProbeScore =
      probe.secondScore ??
      probeCandidates[1]?.retrievalScore ??
      calculateLexicalScore(parsedQuery, probeCandidates[1]?.text || "");
    hasStrongSignal =
      probe.hasStrongSignal ??
      (topProbeScore >= config.strongSignal.minScore &&
        topProbeScore - secondProbeScore >= config.strongSignal.minGap);
  } catch (error) {
    degradeReasons.add("strong-signal-probe-error");
    if (error instanceof Error) {
      degradeReasons.add(`strong-signal-probe:${error.message}`);
    }
  } finally {
    latencyByStage.strongSignal = Date.now() - probeStart;
    emitStage("strongSignal", probeStart, {
      probeCandidateCount: probeCandidates.length,
      topProbeScore,
      secondProbeScore,
      hasStrongSignal,
    });
  }

  const expandStart = Date.now();
  let expansions: TypedExpansionQuery[] = [];
  let expansionMeta: Record<string, unknown> = {};
  let expansionAvailable = false;
  if (hasStrongSignal) {
    degradeReasons.add("strong-signal-skip-expansion");
    expansionMeta = {
      skipped: true,
    };
  } else {
    try {
      const expansionResult = await params.expander.expand(parsedQuery);
      expansionAvailable = expansionResult.available;
      if (!expansionResult.available) {
        degradeReasons.add("expander-unavailable");
      }
      if (expansionResult.reason) {
        degradeReasons.add(`expander:${expansionResult.reason}`);
      }
      expansions = expansionResult.queries;
      expandUsed = expansionResult.used && expansions.length > 0;
      expansionMeta = {
        available: expansionResult.available,
        used: expansionResult.used,
        reason: expansionResult.reason,
        meta: expansionResult.meta || {},
      };
    } catch (error) {
      degradeReasons.add("expander-error");
      if (error instanceof Error) {
        degradeReasons.add(`expander:${error.message}`);
        expansionMeta = {
          available: false,
          error: error.message,
        };
      } else {
        expansionMeta = {
          available: false,
          error: String(error),
        };
      }
    }
  }
  latencyByStage.expand = Date.now() - expandStart;
  emitStage("expand", expandStart, {
    hasStrongSignal,
    expansionAvailable,
    expandUsed,
    expansionCount: expansions.length,
    expansions: expansions.map((item) => ({
      type: item.type,
      text: item.text,
    })),
    ...expansionMeta,
  });

  const retrieveStart = Date.now();
  const rankedLists: Array<
    ReturnType<typeof normalizeCandidateList<TPayload>>
  > = [];
  const weights: number[] = [];

  let originalFts = probeCandidates;
  if (originalFts.length === 0) {
    try {
      originalFts = normalizeCandidateList(
        await params.adapter.searchFTS(
          parsedQuery.normalized,
          params.context,
          perQueryLimit,
          "original",
        ),
      );
    } catch (error) {
      degradeReasons.add("fts-retrieve-error");
      if (error instanceof Error) {
        degradeReasons.add(`fts:${error.message}`);
      }
    }
  }

  if (originalFts.length > 0) {
    rankedLists.push(originalFts);
    weights.push(2);
    ftsCount += originalFts.length;
  }

  const canUseVector = params.adapter.canUseVector(params.context);
  if (!canUseVector) {
    degradeReasons.add("vector-unavailable");
  }

  if (canUseVector) {
    try {
      const originalVec = normalizeCandidateList(
        await params.adapter.searchVec(
          parsedQuery.normalized,
          params.context,
          perQueryLimit,
          "original",
        ),
      );
      if (originalVec.length > 0) {
        rankedLists.push(originalVec);
        weights.push(2);
        vecCount += originalVec.length;
      }
    } catch (error) {
      degradeReasons.add("vec-retrieve-error");
      if (error instanceof Error) {
        degradeReasons.add(`vec:${error.message}`);
      }
    }
  }

  const queryRuns = buildQueryRuns(parsedQuery.normalized, expansions);
  for (const queryRun of queryRuns.slice(1)) {
    if (queryRun.type === "lex") {
      try {
        const ftsList = normalizeCandidateList(
          await params.adapter.searchFTS(
            queryRun.text,
            params.context,
            perQueryLimit,
            queryRun.type,
          ),
        );
        if (ftsList.length > 0) {
          rankedLists.push(ftsList);
          weights.push(1);
          ftsCount += ftsList.length;
        }
      } catch (error) {
        degradeReasons.add("fts-retrieve-error");
        if (error instanceof Error) {
          degradeReasons.add(`fts:${error.message}`);
        }
      }
      continue;
    }

    if (!canUseVector) {
      continue;
    }

    try {
      const vecList = normalizeCandidateList(
        await params.adapter.searchVec(
          queryRun.text,
          params.context,
          perQueryLimit,
          queryRun.type,
        ),
      );
      if (vecList.length > 0) {
        rankedLists.push(vecList);
        weights.push(1);
        vecCount += vecList.length;
      }
    } catch (error) {
      degradeReasons.add("vec-retrieve-error");
      if (error instanceof Error) {
        degradeReasons.add(`vec:${error.message}`);
      }
    }
  }
  latencyByStage.retrieve = Date.now() - retrieveStart;
  emitStage("retrieve", retrieveStart, {
    queryRunCount: queryRuns.length,
    runTypes: queryRuns.map((run) => run.type),
    rankedListCount: rankedLists.length,
    canUseVector,
    ftsCount,
    vecCount,
  });

  if (rankedLists.length === 0) {
    const emptyLog = buildLog({
      queryId,
      expandUsed,
      rerankUsed,
      ftsCount,
      vecCount,
      candidateCount: 0,
      latencyByStage,
      degradeReasons,
    });
    emitStage("summary", Date.now(), {
      resultCount: 0,
      log: emptyLog,
    });
    params.logger?.(emptyLog);
    return {
      results: [],
      log: emptyLog,
    };
  }

  const rrfStart = Date.now();
  const fused = reciprocalRankFusion(rankedLists, weights, {
    k: config.rrfK,
    topBonus: {
      top1: config.topRankBonus.top1,
      top2To3: config.topRankBonus.top2To3,
    },
  });
  const fusedCandidates = fused.slice(0, config.candidateLimit);
  latencyByStage.rrf = Date.now() - rrfStart;
  emitStage("rrf", rrfStart, {
    rankedListCount: rankedLists.length,
    inputCandidateCount: fused.length,
    fusedCandidateCount: fusedCandidates.length,
    weights,
    rrfK: config.rrfK,
  });

  const chunkStart = Date.now();
  const chunkedCandidates = dedupeByDedupeKey(
    fusedCandidates.map((candidate, index) => {
      const selectedChunk = selectBestChunk(candidate.text, parsedQuery.tokens);
      const snippet = buildSnippet(
        candidate.snippet || selectedChunk || candidate.text,
        parsedQuery.tokens,
      );
      return {
        ...candidate,
        rank: index + 1,
        selectedChunk,
        snippet,
      };
    }),
  );
  latencyByStage.chunk = Date.now() - chunkStart;
  emitStage("chunk", chunkStart, {
    fusedCandidateCount: fusedCandidates.length,
    dedupedCandidateCount: chunkedCandidates.length,
  });

  const rerankStart = Date.now();
  const rerankScoresByKey = new Map<string, number>();
  let rerankMeta: Record<string, unknown> = {};
  if (chunkedCandidates.length > 0) {
    try {
      const rerankResult = await params.reranker.rerank(
        parsedQuery,
        chunkedCandidates.map((candidate) => candidate.selectedChunk),
      );
      if (!rerankResult.available) {
        degradeReasons.add("reranker-unavailable");
      }
      if (rerankResult.reason) {
        degradeReasons.add(`reranker:${rerankResult.reason}`);
      }
      rerankMeta = {
        available: rerankResult.available,
        used: rerankResult.used,
        reason: rerankResult.reason,
        meta: rerankResult.meta || {},
        scoreCount: rerankResult.scores.length,
      };

      if (rerankResult.available && rerankResult.scores.length > 0) {
        rerankUsed = true;
        const normalizedScores = normalizeRerankScores(rerankResult.scores);
        normalizedScores.forEach((score, index) => {
          const candidate = chunkedCandidates[index];
          if (!candidate) return;
          rerankScoresByKey.set(candidate.key, score);
        });
      }
    } catch (error) {
      degradeReasons.add("reranker-error");
      if (error instanceof Error) {
        degradeReasons.add(`reranker:${error.message}`);
        rerankMeta = {
          available: false,
          error: error.message,
        };
      } else {
        rerankMeta = {
          available: false,
          error: String(error),
        };
      }
    }
  }
  latencyByStage.rerank = Date.now() - rerankStart;
  emitStage("rerank", rerankStart, {
    rerankUsed,
    inputCandidateCount: chunkedCandidates.length,
    outputScoreCount: rerankScoresByKey.size,
    ...rerankMeta,
  });

  const blendStart = Date.now();
  const blendedCandidates: FinalCandidate<TPayload>[] = chunkedCandidates
    .map((candidate, index) => {
      const rank = index + 1;
      const rerankScore = rerankScoresByKey.get(candidate.key);
      const finalScore = blendScore({
        rank,
        rrfScore: candidate.rrfScore,
        rerankScore,
        config,
      });
      return {
        ...candidate,
        rank,
        rerankScore,
        finalScore,
      };
    })
    .sort((left, right) => right.finalScore - left.finalScore);
  latencyByStage.blend = Date.now() - blendStart;
  emitStage("blend", blendStart, {
    blendedCandidateCount: blendedCandidates.length,
    topScore: blendedCandidates[0]?.finalScore,
  });

  const finalizeStart = Date.now();
  const results: TPayload[] = [];
  for (const candidate of blendedCandidates.slice(0, limit)) {
    results.push(await params.adapter.finalize(candidate, params.context));
  }
  latencyByStage.finalize = Date.now() - finalizeStart;
  emitStage("finalize", finalizeStart, {
    limit,
    outputCount: results.length,
  });

  const log = buildLog({
    queryId,
    expandUsed,
    rerankUsed,
    ftsCount,
    vecCount,
    candidateCount: blendedCandidates.length,
    latencyByStage,
    degradeReasons,
  });
  emitStage("summary", Date.now(), {
    log,
  });
  params.logger?.(log);

  return {
    results,
    log,
  };
}

function dedupeByDedupeKey<TPayload extends object>(
  candidates: Array<
    ReturnType<typeof normalizeCandidateList<TPayload>>[number] & {
      rank: number;
      selectedChunk: string;
      snippet: string;
      key: string;
      rrfScore: number;
      topRank: number;
    }
  >,
): Array<
  ReturnType<typeof normalizeCandidateList<TPayload>>[number] & {
    rank: number;
    selectedChunk: string;
    snippet: string;
    key: string;
    rrfScore: number;
    topRank: number;
  }
> {
  const unique = new Map<string, (typeof candidates)[number]>();
  for (const candidate of candidates) {
    if (!unique.has(candidate.dedupeKey)) {
      unique.set(candidate.dedupeKey, candidate);
    }
  }
  return Array.from(unique.values());
}

function selectBestChunk(text: string, tokens: string[]): string {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return "";
  }
  if (normalizedText.length <= DEFAULT_CHUNK_LENGTH) {
    return normalizedText;
  }

  const chunks = splitIntoChunks(normalizedText, DEFAULT_CHUNK_LENGTH);
  if (chunks.length === 0) {
    return normalizedText.slice(0, DEFAULT_CHUNK_LENGTH);
  }

  let bestChunk = chunks[0];
  let bestScore = -1;
  for (const chunk of chunks) {
    const lowered = chunk.toLowerCase();
    let score = 0;
    for (const token of tokens) {
      if (token.length <= 1) continue;
      if (lowered.includes(token.toLowerCase())) {
        score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestChunk = chunk;
    }
  }

  return bestChunk;
}

function splitIntoChunks(text: string, chunkLength: number): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return [text.slice(0, chunkLength)];
  }

  const chunks: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if (!current) {
      current = paragraph;
      continue;
    }

    if ((current + "\n\n" + paragraph).length <= chunkLength) {
      current += `\n\n${paragraph}`;
      continue;
    }

    chunks.push(current);
    current = paragraph;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function buildSnippet(text: string, queryTokens: string[]): string {
  const normalizedText = text.replace(/\s+/g, " ").trim();
  if (normalizedText.length <= DEFAULT_SNIPPET_LENGTH) {
    return normalizedText;
  }

  const lowered = normalizedText.toLowerCase();
  let hitIndex = -1;
  for (const token of queryTokens) {
    if (token.length <= 1) continue;
    const index = lowered.indexOf(token.toLowerCase());
    if (index >= 0) {
      hitIndex = index;
      break;
    }
  }

  if (hitIndex < 0) {
    return `${normalizedText.slice(0, DEFAULT_SNIPPET_LENGTH)}...`;
  }

  const start = Math.max(0, hitIndex - Math.floor(DEFAULT_SNIPPET_LENGTH / 3));
  const end = Math.min(normalizedText.length, start + DEFAULT_SNIPPET_LENGTH);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < normalizedText.length ? "..." : "";
  return `${prefix}${normalizedText.slice(start, end)}${suffix}`;
}

function buildLog(params: {
  queryId: string;
  expandUsed: boolean;
  rerankUsed: boolean;
  ftsCount: number;
  vecCount: number;
  candidateCount: number;
  latencyByStage: Record<string, number>;
  degradeReasons: Set<string>;
}): SearchPipelineLog {
  return {
    queryId: params.queryId,
    expandUsed: params.expandUsed,
    rerankUsed: params.rerankUsed,
    ftsCount: params.ftsCount,
    vecCount: params.vecCount,
    candidateCount: params.candidateCount,
    latencyByStage: params.latencyByStage,
    degradeReason:
      params.degradeReasons.size > 0
        ? Array.from(params.degradeReasons).join(",")
        : "none",
  };
}

function buildQueryId(): string {
  return `q-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}
