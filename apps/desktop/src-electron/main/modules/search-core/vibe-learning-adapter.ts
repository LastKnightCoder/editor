import databaseModule from "../database";
import vibeLearningDBManager from "../vibe-learning-db";
import VibeLearningResourceTable from "../tables/vibe-learning-resource";
import { ParsedQuery, SearchAdapter, SearchCandidate } from "./types";
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
  displayContent?: string;
  searchContent?: string;
  score: number;
  chunkIndex?: number;
  chunkLevel?: "resource" | "passage";
  chunkStartLine?: number;
  chunkEndLine?: number;
  startOffset?: number;
  endOffset?: number;
  charCount?: number;
  rrfScore?: number;
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
    async searchFTS(
      queryText: string,
      context: VibeLearningAdapterContext,
      limit: number
    ): Promise<SearchCandidate<VibeLearningSearchPayload>[]> {
      const query: ParsedQuery = {
        raw: queryText,
        normalized: queryText,
        tokens: queryText
          .toLowerCase()
          .split(/\s+/)
          .map(token => token.trim())
          .filter(Boolean),
        isEmpty: !queryText.trim(),
      };
      const ftsResults = queryFTS(context, queryText, limit);
      return ftsResults.map(result => mapFTSRowToCandidate(result, query, context));
    },
    async searchVec(
      queryText: string,
      context: VibeLearningAdapterContext,
      limit: number
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
        context.vector.distance
      );

      return vecResults.map(result => {
        const chunkMetadata = getChunkMetadata(context, result.resourceId, result.chunkIndex);
        const payload: VibeLearningSearchPayload = {
          resourceId: result.resourceId,
          resourceName: "",
          content: result.content,
          displayContent: chunkMetadata?.displayContent || result.content,
          searchContent: chunkMetadata?.searchContent || result.content,
          score: distanceToSimilarity(result.distance),
          chunkIndex: result.chunkIndex,
          chunkLevel: "passage",
          chunkStartLine: chunkMetadata?.chunkStartLine,
          chunkEndLine: chunkMetadata?.chunkEndLine,
          startOffset: chunkMetadata?.startOffset,
          endOffset: chunkMetadata?.endOffset,
          charCount: chunkMetadata?.charCount,
        };
        return {
          key: `resource:${result.resourceId}:chunk:${result.chunkIndex}:vec`,
          dedupeKey: `resource:${result.resourceId}:chunk:${result.chunkIndex}`,
          source: "vec",
          payload,
          text: chunkMetadata?.displayContent || result.content,
          snippet: chunkMetadata?.displayContent || result.content,
          retrievalScore: distanceToSimilarity(result.distance),
        };
      });
    },
    async finalize(result, context) {
      const resourceName = await resolveResourceName(
        context.mainDbName,
        result.payload.resourceId,
        resourceNameCache
      );

      return {
        ...result.payload,
        resourceName,
        content: result.snippet,
        score: result.finalScore,
        rrfScore: result.rrfScore,
      };
    },
  };
}

function queryFTS(
  context: VibeLearningAdapterContext,
  queryText: string,
  limit: number
): VibeLearningFTSRow[] {
  const ftsQuery = buildFTSQuery(queryText);
  if (!ftsQuery) {
    return [];
  }
  return vibeLearningDBManager.searchFTS(
    context.mainDbName,
    context.projectId,
    ftsQuery,
    limit
  ) as VibeLearningFTSRow[];
}

function getChunkMetadata(
  context: VibeLearningAdapterContext,
  resourceId: number,
  chunkIndex: number
) {
  return vibeLearningDBManager.getChunkMetadata(
    context.mainDbName,
    context.projectId,
    resourceId,
    chunkIndex
  );
}

function buildFTSQuery(queryText: string): string {
  const normalized = queryText.trim();
  if (!normalized) {
    return "";
  }
  const tokens = normalized
    .split(/[^\p{L}\p{N}\u4e00-\u9fff]+/u)
    .map(token => token.trim())
    .filter(Boolean);
  if (tokens.length === 0) {
    return normalized;
  }
  return tokens.join(" ");
}

function mapFTSRowToCandidate(
  result: VibeLearningFTSRow,
  query: ParsedQuery,
  context?: VibeLearningAdapterContext
): SearchCandidate<VibeLearningSearchPayload> {
  const lexicalScore = calculateLexicalScore(query, result.content);
  const chunkMetadata =
    context && typeof result.chunkIndex === "number"
      ? getChunkMetadata(context, result.resourceId, result.chunkIndex)
      : null;
  const payload: VibeLearningSearchPayload = {
    resourceId: result.resourceId,
    resourceName: "",
    content: result.content,
    displayContent: chunkMetadata?.displayContent || result.content,
    searchContent: chunkMetadata?.searchContent || result.content,
    score: lexicalScore,
    chunkIndex: result.chunkIndex,
    chunkLevel: "passage",
    chunkStartLine: chunkMetadata?.chunkStartLine,
    chunkEndLine: chunkMetadata?.chunkEndLine,
    startOffset: chunkMetadata?.startOffset,
    endOffset: chunkMetadata?.endOffset,
    charCount: chunkMetadata?.charCount,
  };
  return {
    key: `resource:${result.resourceId}:chunk:${result.chunkIndex}:fts`,
    dedupeKey: `resource:${result.resourceId}:chunk:${result.chunkIndex}`,
    source: "fts",
    payload,
    text: chunkMetadata?.displayContent || result.content,
    snippet: chunkMetadata?.displayContent || result.content,
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
  cache: Map<number, string>
): Promise<string> {
  const existing = cache.get(resourceId);
  if (existing) {
    return existing;
  }

  const db = databaseModule.getDatabase(mainDbName);
  if (!db) {
    return `资源 ${resourceId}`;
  }

  const resources = VibeLearningResourceTable.getResourcesByIds(db, [resourceId]);
  const resourceName = resources[0]?.name || `资源 ${resourceId}`;
  cache.set(resourceId, resourceName);
  return resourceName;
}
