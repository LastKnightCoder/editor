import {
  ParsedQuery,
  QueryVariantType,
  SearchAdapter,
  SearchCandidate,
  StrongSignalProbeResult,
} from "./types";
import { calculateLexicalScore } from "./retriever";
import videoNoteIndexDBManager from "../video-note-index-db";

export interface VideoNoteSearchPayload extends Record<string, unknown> {
  videoNoteId: number;
  chunkIndex: number;
  start: number;
  end: number;
  text: string;
  score: number;
  rrfScore?: number;
  rerankScore?: number;
}

export interface VideoNoteAdapterContext {
  videoNoteId: number;
  mainDbName: string;
  vector: {
    distance: number;
    embedQuery: (queryText: string) => Promise<number[] | null>;
  } | null;
}

export function createVideoNoteAdapter(): SearchAdapter<
  VideoNoteSearchPayload,
  VideoNoteAdapterContext
> {
  return {
    name: "video-note-adapter",
    canUseVector(context) {
      return Boolean(context.vector);
    },
    async probeStrongSignal(
      query: ParsedQuery,
      context: VideoNoteAdapterContext,
      limit: number,
    ): Promise<StrongSignalProbeResult<VideoNoteSearchPayload>> {
      const ftsResults = queryFTS(context, query.normalized, limit);
      const candidates = ftsResults.map((result) =>
        mapFTSRowToCandidate(result, query, context.videoNoteId),
      );
      return {
        candidates,
        topScore: candidates[0]?.retrievalScore,
        secondScore: candidates[1]?.retrievalScore,
      };
    },
    async searchFTS(
      queryText: string,
      context: VideoNoteAdapterContext,
      limit: number,
      _variant: QueryVariantType,
    ): Promise<SearchCandidate<VideoNoteSearchPayload>[]> {
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
      return ftsResults.map((result) =>
        mapFTSRowToCandidate(result, query, context.videoNoteId),
      );
    },
    async searchVec(
      queryText: string,
      context: VideoNoteAdapterContext,
      limit: number,
      _variant: QueryVariantType,
    ): Promise<SearchCandidate<VideoNoteSearchPayload>[]> {
      if (!context.vector) {
        return [];
      }
      const queryEmbedding = await context.vector.embedQuery(queryText);
      if (!queryEmbedding || queryEmbedding.length === 0) {
        return [];
      }
      const vecResults = videoNoteIndexDBManager.searchVec(
        context.mainDbName,
        context.videoNoteId,
        queryEmbedding,
        limit,
        context.vector.distance,
      );
      return vecResults.map((result) => {
        const payload: VideoNoteSearchPayload = {
          videoNoteId: context.videoNoteId,
          chunkIndex: result.chunkIndex,
          start: result.startMs,
          end: result.endMs,
          text: result.content,
          score: distanceToSimilarity(result.distance),
        };
        return {
          key: `video-note:${context.videoNoteId}:chunk:${result.chunkIndex}:vec`,
          dedupeKey: `video-note:${context.videoNoteId}:chunk:${result.chunkIndex}`,
          source: "vec",
          payload,
          text: result.content,
          snippet: result.content,
          retrievalScore: distanceToSimilarity(result.distance),
        };
      });
    },
    async finalize(result) {
      return {
        ...result.payload,
        text: result.snippet,
        score: result.finalScore,
        rrfScore: result.rrfScore,
        rerankScore: result.rerankScore,
      };
    },
  };
}

function queryFTS(
  context: VideoNoteAdapterContext,
  queryText: string,
  limit: number,
): Array<{
  chunkIndex: number;
  startMs: number;
  endMs: number;
  content: string;
  rank?: number;
}> {
  const ftsQuery = buildFTSQuery(queryText);
  if (!ftsQuery) {
    return [];
  }
  return videoNoteIndexDBManager.searchFTS(
    context.mainDbName,
    context.videoNoteId,
    ftsQuery,
    limit,
  );
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
  result: {
    chunkIndex: number;
    startMs: number;
    endMs: number;
    content: string;
    rank?: number;
  },
  query: ParsedQuery,
  videoNoteId: number,
): SearchCandidate<VideoNoteSearchPayload> {
  const lexicalScore = calculateLexicalScore(query, result.content);
  const payload: VideoNoteSearchPayload = {
    videoNoteId,
    chunkIndex: result.chunkIndex,
    start: result.startMs,
    end: result.endMs,
    text: result.content,
    score: lexicalScore,
  };
  return {
    key: `video-note:${videoNoteId}:chunk:${result.chunkIndex}:fts`,
    dedupeKey: `video-note:${videoNoteId}:chunk:${result.chunkIndex}`,
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
