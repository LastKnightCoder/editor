import databaseModule from "../database";
import vibeLearningDBManager from "../vibe-learning-db";
import VibeLearningResourceTable from "../tables/vibe-learning-resource";
import {
  ParsedQuery,
  QueryVariantType,
  SearchAdapter,
  SearchCandidate,
  StrongSignalProbeResult,
} from "./types";
import { calculateLexicalScore } from "./retriever";

type VibeLearningFTSRow = {
  resourceId: number;
  chunkIndex: number;
  content: string;
  rank?: number;
};

export interface VibeLearningSearchPayload extends Record<string, unknown> {
  resourceId: number;
  resourceName: string;
  content: string;
  score: number;
  chunkIndex?: number;
  rrfScore?: number;
  rerankScore?: number;
}

export interface VibeLearningAdapterContext {
  projectId: number;
  mainDbName: string;
  vector: {
    distance: number;
    embedQuery: (queryText: string) => Promise<number[] | null>;
  } | null;
}

export function createVibeLearningAdapter(): SearchAdapter<
  VibeLearningSearchPayload,
  VibeLearningAdapterContext
> {
  const resourceNameCache = new Map<number, string>();

  return {
    name: "vibe-learning-adapter",
    canUseVector(context) {
      return Boolean(context.vector);
    },
    async probeStrongSignal(
      query: ParsedQuery,
      context: VibeLearningAdapterContext,
      limit: number,
    ): Promise<StrongSignalProbeResult<VibeLearningSearchPayload>> {
      const ftsResults = queryFTS(context, query.normalized, limit);
      const candidates = ftsResults.map((result) =>
        mapFTSRowToCandidate(result, query),
      );
      return {
        candidates,
        topScore: candidates[0]?.retrievalScore,
        secondScore: candidates[1]?.retrievalScore,
      };
    },
    async searchFTS(
      queryText: string,
      context: VibeLearningAdapterContext,
      limit: number,
      _variant: QueryVariantType,
    ): Promise<SearchCandidate<VibeLearningSearchPayload>[]> {
      const query: ParsedQuery = {
        raw: queryText,
        normalized: queryText,
        tokens: queryText
          .toLowerCase()
          .split(/\s+/)
          .map((token) => token.trim())
          .filter(Boolean),
        isEmpty: !queryText.trim(),
      };
      const ftsResults = queryFTS(context, queryText, limit);
      return ftsResults.map((result) => mapFTSRowToCandidate(result, query));
    },
    async searchVec(
      queryText: string,
      context: VibeLearningAdapterContext,
      limit: number,
      _variant: QueryVariantType,
    ): Promise<SearchCandidate<VibeLearningSearchPayload>[]> {
      if (!context.vector) {
        return [];
      }

      const queryEmbedding = await context.vector.embedQuery(queryText);
      if (!queryEmbedding || queryEmbedding.length === 0) {
        return [];
      }

      const vecResults = vibeLearningDBManager.searchVec(
        context.mainDbName,
        context.projectId,
        queryEmbedding,
        limit,
        context.vector.distance,
      );

      return vecResults.map((result) => {
        const payload: VibeLearningSearchPayload = {
          resourceId: result.resourceId,
          resourceName: "",
          content: result.content,
          score: distanceToSimilarity(result.distance),
          chunkIndex: result.chunkIndex,
        };
        return {
          key: `resource:${result.resourceId}:chunk:${result.chunkIndex}:vec`,
          dedupeKey: `resource:${result.resourceId}:chunk:${result.chunkIndex}`,
          source: "vec",
          payload,
          text: result.content,
          snippet: result.content,
          retrievalScore: distanceToSimilarity(result.distance),
        };
      });
    },
    async finalize(result, context) {
      const resourceName = await resolveResourceName(
        context.mainDbName,
        result.payload.resourceId,
        resourceNameCache,
      );

      return {
        ...result.payload,
        resourceName,
        content: result.snippet,
        score: result.finalScore,
        rrfScore: result.rrfScore,
        rerankScore: result.rerankScore,
      };
    },
  };
}

function queryFTS(
  context: VibeLearningAdapterContext,
  queryText: string,
  limit: number,
): VibeLearningFTSRow[] {
  const ftsQuery = buildFTSQuery(queryText);
  if (!ftsQuery) {
    return [];
  }
  return vibeLearningDBManager.searchFTS(
    context.mainDbName,
    context.projectId,
    ftsQuery,
    limit,
  ) as VibeLearningFTSRow[];
}

function buildFTSQuery(queryText: string): string {
  const normalized = queryText.trim();
  if (!normalized) {
    return "";
  }
  const tokens = normalized
    .split(/[^\p{L}\p{N}\u4e00-\u9fff]+/u)
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length === 0) {
    return normalized;
  }
  return tokens.join(" ");
}

function mapFTSRowToCandidate(
  result: VibeLearningFTSRow,
  query: ParsedQuery,
): SearchCandidate<VibeLearningSearchPayload> {
  const lexicalScore = calculateLexicalScore(query, result.content);
  const payload: VibeLearningSearchPayload = {
    resourceId: result.resourceId,
    resourceName: "",
    content: result.content,
    score: lexicalScore,
    chunkIndex: result.chunkIndex,
  };
  return {
    key: `resource:${result.resourceId}:chunk:${result.chunkIndex}:fts`,
    dedupeKey: `resource:${result.resourceId}:chunk:${result.chunkIndex}`,
    source: "fts",
    payload,
    text: result.content,
    snippet: result.content,
    retrievalScore: Math.max(lexicalScore, rankToScore(result.rank)),
  };
}

function rankToScore(rank: number | undefined): number {
  if (typeof rank !== "number" || !Number.isFinite(rank)) {
    return 0;
  }
  return 1 / (1 + Math.abs(rank));
}

function distanceToSimilarity(distance: number): number {
  if (!Number.isFinite(distance)) {
    return 0;
  }
  const score = 1 - distance;
  if (score < 0) return 0;
  if (score > 1) return 1;
  return score;
}

async function resolveResourceName(
  mainDbName: string,
  resourceId: number,
  cache: Map<number, string>,
): Promise<string> {
  const existing = cache.get(resourceId);
  if (existing) {
    return existing;
  }

  const db = databaseModule.getDatabase(mainDbName);
  if (!db) {
    return `资源 ${resourceId}`;
  }

  const resources = VibeLearningResourceTable.getResourcesByIds(db, [
    resourceId,
  ]);
  const resourceName = resources[0]?.name || `资源 ${resourceId}`;
  cache.set(resourceId, resourceName);
  return resourceName;
}
