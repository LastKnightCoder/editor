import { getDataAccess, closeDataAccess } from "../data-access/index.js";
import { getActiveDbName } from "./path.js";
import { isAppRunning } from "../data-access/notify.js";
import { rpcRequest } from "../data-access/rpc-client.js";
import {
  searchFTS,
  searchVec,
  type IndexType,
  type FTSResult,
  type VecResult,
} from "../data-access/index-db.js";
import {
  embedTexts,
  getEmbeddingConfig,
  closeEmbeddingRuntime,
  isEmbeddingAvailable,
} from "../data-access/local-embedding.js";
import { extractPlainText, truncateToWidth } from "./text.js";

export type { IndexType } from "../data-access/index-db.js";

export interface SearchResult {
  id: number;
  type: IndexType;
  title: string;
  snippet: string;
  updateTime: number;
  score?: number;
  source: "hybrid" | "vec+fts" | "fts" | "like";
}

export interface SearchOptions {
  query: string;
  types?: IndexType[];
  limit?: number;
  snippetWidth?: number;
}

export function getTypeBadge(type: string): { text: string; color: string } {
  switch (type) {
    case "card":
      return { text: "card", color: "green" };
    case "article":
      return { text: "article", color: "cyan" };
    case "project-item":
      return { text: "project", color: "yellow" };
    case "diary-daily":
      return { text: "diary", color: "blue" };
    default:
      return { text: type, color: "gray" };
  }
}

function loadDetails(ftsResults: FTSResult[], snippetWidth: number): SearchResult[] {
  const dbName = getActiveDbName();
  const da = getDataAccess(dbName);
  const results: SearchResult[] = [];

  for (const r of ftsResults) {
    let title = "";
    let content: string | null = null;

    switch (r.type) {
      case "card": {
        const row = da.queryOne<{ content: string | null }>(
          `SELECT ct.content FROM cards c LEFT JOIN contents ct ON c.content_id = ct.id WHERE c.id = ?`,
          r.id
        );
        title = `Card #${r.id}`;
        content = row?.content ?? null;
        break;
      }
      case "article": {
        const row = da.queryOne<{ title: string; content: string | null }>(
          `SELECT a.title, ct.content FROM articles a LEFT JOIN contents ct ON a.content_id = ct.id WHERE a.id = ?`,
          r.id
        );
        title = row?.title || `Article #${r.id}`;
        content = row?.content ?? null;
        break;
      }
      case "project-item": {
        const row = da.queryOne<{ title: string; content: string | null }>(
          `SELECT pi.title, ct.content FROM project_item pi LEFT JOIN contents ct ON pi.content_id = ct.id WHERE pi.id = ?`,
          r.id
        );
        title = row?.title || `ProjectItem #${r.id}`;
        content = row?.content ?? null;
        break;
      }
      default:
        title = `${r.type} #${r.id}`;
    }

    results.push({
      id: r.id,
      type: r.type,
      title,
      snippet: truncateToWidth(extractPlainText(content), snippetWidth),
      updateTime: r.updateTime,
      source: "fts",
    });
  }

  return results;
}

function searchByLike(
  query: string,
  types: IndexType[] | undefined,
  limit: number,
  snippetWidth: number
): SearchResult[] {
  const dbName = getActiveDbName();
  const da = getDataAccess(dbName);
  const likePattern = `%${query}%`;
  const results: SearchResult[] = [];
  const shouldInclude = (type: IndexType) => !types || types.length === 0 || types.includes(type);

  if (shouldInclude("article")) {
    const rows = da.query<{
      id: number;
      title: string;
      content: string | null;
      update_time: number;
    }>(
      `SELECT a.id, a.title, ct.content, a.update_time FROM articles a
       LEFT JOIN contents ct ON a.content_id = ct.id
       WHERE a.is_delete = 0 AND (a.title LIKE ? OR ct.content LIKE ?)
       ORDER BY a.update_time DESC LIMIT ?`,
      likePattern,
      likePattern,
      limit
    );
    for (const row of rows) {
      results.push({
        id: row.id,
        type: "article",
        title: row.title || `Article #${row.id}`,
        snippet: truncateToWidth(extractPlainText(row.content), snippetWidth),
        updateTime: row.update_time,
        source: "like",
      });
    }
  }

  if (shouldInclude("card")) {
    const rows = da.query<{
      id: number;
      content: string | null;
      update_time: number;
    }>(
      `SELECT c.id, ct.content, c.update_time FROM cards c
       LEFT JOIN contents ct ON c.content_id = ct.id
       WHERE ct.content LIKE ?
       ORDER BY c.update_time DESC LIMIT ?`,
      likePattern,
      limit
    );
    for (const row of rows) {
      results.push({
        id: row.id,
        type: "card",
        title: `Card #${row.id}`,
        snippet: truncateToWidth(extractPlainText(row.content), snippetWidth),
        updateTime: row.update_time,
        source: "like",
      });
    }
  }

  if (shouldInclude("project-item")) {
    const rows = da.query<{
      id: number;
      title: string;
      content: string | null;
      update_time: number;
    }>(
      `SELECT pi.id, pi.title, ct.content, pi.update_time FROM project_item pi
       LEFT JOIN contents ct ON pi.content_id = ct.id
       WHERE pi.title LIKE ? OR ct.content LIKE ? OR pi.tags LIKE ?
       ORDER BY pi.update_time DESC LIMIT ?`,
      likePattern,
      likePattern,
      likePattern,
      limit
    );
    for (const row of rows) {
      results.push({
        id: row.id,
        type: "project-item",
        title: row.title || `ProjectItem #${row.id}`,
        snippet: truncateToWidth(extractPlainText(row.content), snippetWidth),
        updateTime: row.update_time,
        source: "like",
      });
    }
  }

  results.sort((a, b) => b.updateTime - a.updateTime);
  return results.slice(0, limit);
}

function mergeAndLoadDetails(
  vecResults: VecResult[],
  ftsResults: FTSResult[] | null,
  limit: number,
  snippetWidth: number
): SearchResult[] {
  const scoreMap = new Map<
    string,
    {
      id: number;
      type: IndexType;
      updateTime: number;
      content: string;
      score: number;
    }
  >();

  for (let i = 0; i < vecResults.length; i++) {
    const r = vecResults[i];
    const key = `${r.type}:${r.id}`;
    scoreMap.set(key, {
      id: r.id,
      type: r.type,
      updateTime: r.updateTime,
      content: r.content,
      score: 1 / (60 + i + 1),
    });
  }

  if (ftsResults) {
    for (let i = 0; i < ftsResults.length; i++) {
      const r = ftsResults[i];
      const key = `${r.type}:${r.id}`;
      const existing = scoreMap.get(key);
      if (existing) {
        existing.score += 1 / (60 + i + 1);
      } else {
        scoreMap.set(key, {
          id: r.id,
          type: r.type,
          updateTime: r.updateTime,
          content: "",
          score: 1 / (60 + i + 1),
        });
      }
    }
  }

  const sorted = [...scoreMap.values()].sort((a, b) => b.score - a.score).slice(0, limit);

  const dbName = getActiveDbName();
  const da = getDataAccess(dbName);
  const results: SearchResult[] = [];

  for (const item of sorted) {
    let title = "";
    let content: string | null = item.content || null;

    switch (item.type) {
      case "card":
        title = `Card #${item.id}`;
        if (!content) {
          const row = da.queryOne<{ content: string | null }>(
            `SELECT ct.content FROM cards c LEFT JOIN contents ct ON c.content_id = ct.id WHERE c.id = ?`,
            item.id
          );
          content = row?.content ?? null;
        }
        break;
      case "article": {
        const row = da.queryOne<{ title: string; content: string | null }>(
          `SELECT a.title, ct.content FROM articles a LEFT JOIN contents ct ON a.content_id = ct.id WHERE a.id = ?`,
          item.id
        );
        title = row?.title || `Article #${item.id}`;
        if (!content) content = row?.content ?? null;
        break;
      }
      case "project-item": {
        const row = da.queryOne<{ title: string; content: string | null }>(
          `SELECT pi.title, ct.content FROM project_item pi LEFT JOIN contents ct ON pi.content_id = ct.id WHERE pi.id = ?`,
          item.id
        );
        title = row?.title || `ProjectItem #${item.id}`;
        if (!content) content = row?.content ?? null;
        break;
      }
      default:
        title = `${item.type} #${item.id}`;
    }

    results.push({
      id: item.id,
      type: item.type,
      title,
      snippet: truncateToWidth(extractPlainText(content), snippetWidth),
      updateTime: item.updateTime,
      score: item.score,
      source: "vec+fts",
    });
  }

  return results;
}

export async function executeSearch(
  options: SearchOptions
): Promise<{ results: SearchResult[]; source: string }> {
  const { query, types, limit = 10, snippetWidth = 50 } = options;

  // Strategy 1: RPC to running desktop app (hybrid: FTS + Vec)
  const appRunning = await isAppRunning();
  if (appRunning) {
    try {
      const rpcResults = await rpcRequest<any[]>("search-content", [{ query, types, limit }], {
        timeoutMs: 10000,
      });
      if (rpcResults && rpcResults.length > 0) {
        const results: SearchResult[] = rpcResults.map((r: any) => ({
          id: r.id,
          type: r.type as IndexType,
          title: r.title || `${r.type} #${r.id}`,
          snippet: truncateToWidth(
            typeof r.content === "string" ? r.content : extractPlainText(JSON.stringify(r.content)),
            snippetWidth
          ),
          updateTime: r.updateTime,
          score: r.score,
          source: "hybrid" as const,
        }));
        return { results, source: "hybrid" };
      }
    } catch {
      // fall through
    }
  }

  // Strategy 2: Local Vec + FTS (independent Python embedding)
  const embeddingConfig = getEmbeddingConfig();
  if (embeddingConfig && isEmbeddingAvailable()) {
    try {
      const embeddings = await embedTexts([query]);
      if (embeddings.length > 0 && embeddings[0].length > 0) {
        const vecResults = searchVec(embeddings[0], {
          types,
          limit,
          distance: embeddingConfig.distance,
        });
        if (vecResults && vecResults.length > 0) {
          const ftsResults = searchFTS(query, { types, limit });
          const results = mergeAndLoadDetails(vecResults, ftsResults, limit, snippetWidth);
          closeEmbeddingRuntime();
          closeDataAccess();
          return { results, source: "vec+fts" };
        }
      }
    } catch {
      // fall through
    } finally {
      closeEmbeddingRuntime();
    }
  }

  // Strategy 3: Direct FTS search on index DB
  const ftsResults = searchFTS(query, { types, limit });
  if (ftsResults && ftsResults.length > 0) {
    const results = loadDetails(ftsResults, snippetWidth);
    closeDataAccess();
    return { results, source: "fts" };
  }

  // Strategy 4: LIKE fallback on main DB
  const results = searchByLike(query, types, limit, snippetWidth);
  closeDataAccess();
  return { results, source: "like" };
}
