import Database from "better-sqlite3";
import { SearchParams, SearchResult } from "@/types";
import { getMarkdownText, mapContentSnapshots } from "../../services/content-conversion";
import { ParsedQuery, SearchAdapter, SearchCandidate } from "./types";
import { calculateLexicalScore, ensureScoreInRange } from "./retriever";

type SearchResultWithRank = SearchResult & {
  rank?: number;
  distance?: number;
  score?: number;
};

export interface MainContentAdapterContext {
  mainDb: Database.Database;
  indexDb: Database.Database;
  searchParams: SearchParams;
  searchFTS: (
    mainDb: Database.Database,
    indexDb: Database.Database,
    searchParams: SearchParams
  ) => SearchResult[] | Promise<SearchResult[]>;
  searchVec: (
    mainDb: Database.Database,
    indexDb: Database.Database,
    searchParams: SearchParams
  ) => Promise<SearchResult[]>;
}

export function createMainContentAdapter(): SearchAdapter<SearchResult, MainContentAdapterContext> {
  return {
    name: "main-content-adapter",
    canUseVector(context) {
      return Boolean(context.searchParams.modelInfo?.model);
    },
    async searchFTS(
      queryText: string,
      context: MainContentAdapterContext,
      limit: number
    ): Promise<SearchCandidate<SearchResult>[]> {
      const parsedQuery: ParsedQuery = {
        raw: queryText,
        normalized: queryText,
        tokens: queryText
          .toLowerCase()
          .split(/\s+/)
          .map(token => token.trim())
          .filter(Boolean),
        isEmpty: !queryText.trim(),
      };
      const results = await context.searchFTS(context.mainDb, context.indexDb, {
        ...context.searchParams,
        query: queryText,
        limit,
      });
      return mapContentSnapshots(results, result =>
        mapResultToCandidate(result, "fts", parsedQuery)
      );
    },
    async searchVec(
      queryText: string,
      context: MainContentAdapterContext,
      limit: number
    ): Promise<SearchCandidate<SearchResult>[]> {
      const parsedQuery: ParsedQuery = {
        raw: queryText,
        normalized: queryText,
        tokens: queryText
          .toLowerCase()
          .split(/\s+/)
          .map(token => token.trim())
          .filter(Boolean),
        isEmpty: !queryText.trim(),
      };
      const results = await context.searchVec(context.mainDb, context.indexDb, {
        ...context.searchParams,
        query: queryText,
        limit,
      });
      return mapContentSnapshots(results, result =>
        mapResultToCandidate(result, "vec", parsedQuery)
      );
    },
    finalize(result) {
      return {
        ...result.payload,
        score: result.finalScore,
        snippet: result.snippet,
        debug: {
          rrfScore: result.rrfScore,
        },
      };
    },
  };
}

async function mapResultToCandidate(
  result: SearchResult,
  source: "fts" | "vec",
  query: ParsedQuery
): Promise<SearchCandidate<SearchResult>> {
  const key = `${result.type}:${result.id}`;
  const text = result.section?.text ?? (await getMarkdownText(result.content || [])).trim();
  const enriched = result as SearchResultWithRank;
  const lexicalScore = calculateLexicalScore(query, text);
  const retrievalScore =
    source === "fts"
      ? (ensureScoreInRange(enriched.score) ?? lexicalScore ?? rankToScore(enriched.rank))
      : (ensureScoreInRange(enriched.score) ?? distanceToSimilarity(enriched.distance));

  return {
    key,
    dedupeKey: key,
    source,
    payload: result,
    text,
    snippet: text,
    retrievalScore,
  };
}

function rankToScore(rank: number | undefined): number {
  if (typeof rank !== "number" || !Number.isFinite(rank)) {
    return 0;
  }
  return 1 / (1 + Math.abs(rank));
}

function distanceToSimilarity(distance: number | undefined): number {
  if (typeof distance !== "number" || !Number.isFinite(distance)) {
    return 0;
  }
  const score = 1 - distance;
  if (score < 0) return 0;
  if (score > 1) return 1;
  return score;
}
