import { blendScore } from "./blend";
import { parseQuery } from "./query-parser";
import { normalizeCandidateList } from "./retriever";
import { reciprocalRankFusion } from "./rrf";
import {
  DEFAULT_SEARCH_CORE_CONFIG,
  FinalCandidate,
  SearchPipelineLog,
  SearchPipelineParams,
  SearchPipelineResult,
} from "./types";

const DEFAULT_SNIPPET_LENGTH = 220;
const DEFAULT_CHUNK_LENGTH = 1600;

export async function runSearchPipeline<TPayload extends object, TContext>(
  params: SearchPipelineParams<TPayload, TContext>
): Promise<SearchPipelineResult<TPayload>> {
  const config = {
    ...DEFAULT_SEARCH_CORE_CONFIG,
    ...params.config,
    topRankBonus: {
      ...DEFAULT_SEARCH_CORE_CONFIG.topRankBonus,
      ...params.config?.topRankBonus,
    },
  };

  const queryId = params.queryId || buildQueryId();
  const latencyByStage: Record<string, number> = {};
  const degradeReasons = new Set<string>();
  let ftsCount = 0;
  let vecCount = 0;

  const emitStage = (
    stage: "parse" | "retrieve" | "rrf" | "chunk" | "blend" | "finalize" | "summary",
    startTime: number,
    detail: Record<string, unknown> = {}
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

  const retrieveStart = Date.now();
  const rankedLists: Array<ReturnType<typeof normalizeCandidateList<TPayload>>> = [];
  const weights: number[] = [];

  try {
    const originalFts = normalizeCandidateList(
      await params.adapter.searchFTS(parsedQuery.normalized, params.context, perQueryLimit)
    );
    if (originalFts.length > 0) {
      rankedLists.push(originalFts);
      weights.push(2);
      ftsCount += originalFts.length;
    }
  } catch (error) {
    degradeReasons.add("fts-retrieve-error");
    if (error instanceof Error) {
      degradeReasons.add(`fts:${error.message}`);
    }
  }

  const canUseVector = params.adapter.canUseVector(params.context);
  if (!canUseVector) {
    degradeReasons.add("vector-unavailable");
  }

  if (canUseVector) {
    try {
      const originalVec = normalizeCandidateList(
        await params.adapter.searchVec(parsedQuery.normalized, params.context, perQueryLimit)
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
  latencyByStage.retrieve = Date.now() - retrieveStart;
  emitStage("retrieve", retrieveStart, {
    rankedListCount: rankedLists.length,
    canUseVector,
    ftsCount,
    vecCount,
  });

  if (rankedLists.length === 0) {
    const emptyLog = buildLog({
      queryId,
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
        parsedQuery.tokens
      );
      return {
        ...candidate,
        rank: index + 1,
        selectedChunk,
        snippet,
      };
    })
  );
  latencyByStage.chunk = Date.now() - chunkStart;
  emitStage("chunk", chunkStart, {
    fusedCandidateCount: fusedCandidates.length,
    dedupedCandidateCount: chunkedCandidates.length,
  });

  const blendStart = Date.now();
  const blendedCandidates: FinalCandidate<TPayload>[] = chunkedCandidates
    .map((candidate, index) => ({
      ...candidate,
      rank: index + 1,
      finalScore: blendScore({
        rrfScore: candidate.rrfScore,
        config,
        structureLevel:
          typeof candidate.payload === "object" &&
          candidate.payload &&
          "chunkLevel" in candidate.payload
            ? (
                candidate.payload as {
                  chunkLevel?: "resource" | "summary" | "section" | "chapter" | "passage";
                }
              ).chunkLevel
            : undefined,
      }),
    }))
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
  >
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
    .map(paragraph => paragraph.trim())
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
  ftsCount: number;
  vecCount: number;
  candidateCount: number;
  latencyByStage: Record<string, number>;
  degradeReasons: Set<string>;
}): SearchPipelineLog {
  return {
    queryId: params.queryId,
    ftsCount: params.ftsCount,
    vecCount: params.vecCount,
    candidateCount: params.candidateCount,
    latencyByStage: params.latencyByStage,
    degradeReason:
      params.degradeReasons.size > 0 ? Array.from(params.degradeReasons).join(",") : "none",
  };
}

function buildQueryId(): string {
  return `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
