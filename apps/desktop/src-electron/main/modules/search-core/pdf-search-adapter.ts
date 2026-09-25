import { ParsedQuery, SearchAdapter, SearchCandidate } from "./types";
import { calculateLexicalScore } from "./retriever";
import pdfIndexDBManager from "../pdf-index-db";
import type { PdfSearchResult } from "@/types";

export interface PdfSearchAdapterContext {
  pdfId: number;
  mainDbName: string;
  vector: {
    distance: number;
    embedQuery: (queryText: string) => Promise<number[] | null>;
  } | null;
}

export function createPdfSearchAdapter(): SearchAdapter<PdfSearchResult, PdfSearchAdapterContext> {
  return {
    name: "pdf-search-adapter",
    canUseVector(context) {
      return Boolean(context.vector);
    },
    async searchFTS(
      queryText: string,
      context: PdfSearchAdapterContext,
      limit: number
    ): Promise<SearchCandidate<PdfSearchResult>[]> {
      const query = parseQuery(queryText);
      return pdfIndexDBManager
        .searchFTS(context.mainDbName, context.pdfId, queryText, limit)
        .map(result => mapFtsResultToCandidate(result, query, context.pdfId));
    },
    async searchVec(
      queryText: string,
      context: PdfSearchAdapterContext,
      limit: number
    ): Promise<SearchCandidate<PdfSearchResult>[]> {
      if (!context.vector) {
        return [];
      }
      const queryEmbedding = await context.vector.embedQuery(queryText);
      if (!queryEmbedding?.length) {
        return [];
      }
      return pdfIndexDBManager
        .searchVec(
          context.mainDbName,
          context.pdfId,
          queryEmbedding,
          limit,
          context.vector.distance
        )
        .map(result => {
          const similarity = distanceToSimilarity(result.distance);
          const payload: PdfSearchResult = {
            pdfId: context.pdfId,
            pageNumber: result.pageNumber,
            chunkIndex: result.chunkIndex,
            snippet: result.content,
            content: result.content,
            source: "vec",
            score: similarity,
            charStart: result.charStart,
            charEnd: result.charEnd,
            sectionId: result.sectionId,
            sectionTitle: result.sectionTitle,
            sectionPath: result.sectionPath,
            sectionStartPage: result.sectionStartPage,
            sectionEndPage: result.sectionEndPage,
          };
          return {
            key: `pdf:${context.pdfId}:page:${result.pageNumber}:chunk:${result.chunkIndex}:vec`,
            dedupeKey: `pdf:${context.pdfId}:page:${result.pageNumber}:chunk:${result.chunkIndex}`,
            source: "vec",
            payload,
            text: result.content,
            snippet: result.content,
            retrievalScore: similarity,
          };
        });
    },
    async finalize(result) {
      return {
        ...result.payload,
        snippet: result.snippet,
        content: result.snippet,
        score: result.finalScore,
        rrfScore: result.rrfScore,
      };
    },
  };
}

const parseQuery = (queryText: string): ParsedQuery => ({
  raw: queryText,
  normalized: queryText,
  tokens: queryText
    .toLowerCase()
    .split(/\s+/)
    .map(token => token.trim())
    .filter(Boolean),
  isEmpty: !queryText.trim(),
});

const mapFtsResultToCandidate = (
  result: {
    pageNumber: number;
    chunkIndex: number;
    content: string;
    charStart: number;
    charEnd: number;
    rank?: number;
    sectionId?: string;
    sectionTitle?: string;
    sectionPath?: string[];
    sectionStartPage?: number;
    sectionEndPage?: number;
  },
  query: ParsedQuery,
  pdfId: number
): SearchCandidate<PdfSearchResult> => {
  const lexicalScore = calculateLexicalScore(query, result.content);
  const payload: PdfSearchResult = {
    pdfId,
    pageNumber: result.pageNumber,
    chunkIndex: result.chunkIndex,
    snippet: result.content,
    content: result.content,
    source: "fts",
    score: lexicalScore,
    charStart: result.charStart,
    charEnd: result.charEnd,
    sectionId: result.sectionId,
    sectionTitle: result.sectionTitle,
    sectionPath: result.sectionPath,
    sectionStartPage: result.sectionStartPage,
    sectionEndPage: result.sectionEndPage,
  };
  return {
    key: `pdf:${pdfId}:page:${result.pageNumber}:chunk:${result.chunkIndex}:fts`,
    dedupeKey: `pdf:${pdfId}:page:${result.pageNumber}:chunk:${result.chunkIndex}`,
    source: "fts",
    payload,
    text: result.content,
    snippet: result.content,
    retrievalScore: Math.max(lexicalScore, rankToScore(result.rank)),
  };
};

const rankToScore = (rank: number | undefined): number => {
  if (typeof rank !== "number" || !Number.isFinite(rank)) {
    return 0;
  }
  return 1 / (1 + Math.abs(rank));
};

const distanceToSimilarity = (distance: number): number => {
  if (!Number.isFinite(distance)) {
    return 0;
  }
  const score = 1 - distance;
  if (score < 0) return 0;
  if (score > 1) return 1;
  return score;
};
