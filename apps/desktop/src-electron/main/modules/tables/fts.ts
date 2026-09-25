import Database from "better-sqlite3";
import { Jieba } from "@node-rs/jieba";
import { dict } from "@node-rs/jieba/dict";
import log from "electron-log";
import { IndexType, SearchResult, IndexParams, SearchParams } from "@/types";
import CardTable from "./card";
import ArticleTable from "./article";
import ProjectTable from "./project";
import DiaryTable from "./diary";
import VecDocumentTable from "./vec-document";
import { getMarkdown } from "@/utils/markdown.ts";
import { smartChunk } from "../../utils/smart-chunk";
import {
  createMainContentAdapter,
  MainContentAdapterContext,
} from "../search-core/main-content-adapter";
import { runSearchPipeline } from "../search-core/pipeline";

const jieba = Jieba.withDict(dict);

const addTypePrefix = (id: number, type: string): string => {
  return `${type}:${id}`;
};

const extractIdFromPrefixed = (prefixedId: string): { id: string; type: string } => {
  const [type, id] = prefixedId.split(":");
  return { id, type };
};

export interface PartialSearchResult {
  id: number;
  type: IndexType;
  source: "fts";
  updateTime: number;
  rank?: number;
}

class FTSTable {
  static segmentText(text: string): string {
    if (!text) return "";
    const result = jieba.cutForSearch(text, true);
    return result.join(" ");
  }

  private static hasTable(db: Database.Database, tableName: string): boolean {
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
      .get(tableName);
    return !!row;
  }

  private static isIndexReady(indexDb: Database.Database): boolean {
    if (!this.hasTable(indexDb, "index_meta")) {
      return false;
    }
    const migrationState = indexDb
      .prepare("SELECT value FROM index_meta WHERE key = 'migration_state'")
      .get() as { value?: string } | undefined;
    const rebuildState = indexDb
      .prepare("SELECT value FROM index_meta WHERE key = 'rebuild_state'")
      .get() as { value?: string } | undefined;
    return migrationState?.value === "done" && rebuildState?.value === "ready";
  }

  static upgradeTable(_db: Database.Database) {
    // 不需要升级
  }

  static getListenEvents() {
    return {
      "fts-index-content": (
        _mainDb: Database.Database,
        indexDb: Database.Database,
        params: IndexParams
      ) => this.indexContent(indexDb, params),
      "fts-batch-index-content": (
        _mainDb: Database.Database,
        indexDb: Database.Database,
        items: IndexParams[]
      ) => this.batchIndexContent(indexDb, items),
      "fts-remove-index": (
        _mainDb: Database.Database,
        indexDb: Database.Database,
        id: number,
        type: IndexType
      ) => this.removeIndexByIdAndType(indexDb, id, type),
      "fts-search-content": (
        mainDb: Database.Database,
        indexDb: Database.Database,
        searchParams: SearchParams
      ) => this.searchContent(mainDb, indexDb, searchParams),
      "search-hybrid-content": (
        mainDb: Database.Database,
        indexDb: Database.Database,
        searchParams: SearchParams
      ) => this.searchHybridContent(mainDb, indexDb, searchParams),
      "fts-check-index-exists": (
        _mainDb: Database.Database,
        indexDb: Database.Database,
        id: number,
        type: IndexType
      ) => this.checkIndexExists(indexDb, id, type),
      "get-all-fts-results": (
        mainDb: Database.Database,
        indexDb: Database.Database,
        type?: IndexType
      ) => this.getAllFTSResults(mainDb, indexDb, type),
    };
  }

  static indexContent(db: Database.Database, params: IndexParams) {
    const { id, content, type, updateTime } = params;
    if (!this.hasTable(db, "content_fts")) {
      return false;
    }

    const prefixedId = addTypePrefix(id, type);
    this.removeIndex(db, prefixedId);

    const normalizedContent = content.trim();
    if (!normalizedContent) {
      return false;
    }

    const chunks = smartChunk(normalizedContent, {
      minLength: 500,
      maxLength: 2000,
      overlap: 0,
      splitter: "paragraph",
    })
      .map(chunkText => chunkText.trim())
      .filter(chunkText => !!chunkText);

    try {
      if (chunks.length === 0) {
        return false;
      }

      const stmt = db.prepare(`
        INSERT INTO content_fts (prefixed_id, content, update_time, type)
        VALUES (?, ?, ?, ?)
      `);

      let insertedCount = 0;
      chunks.forEach(chunkText => {
        const segmentedText = this.segmentText(chunkText).trim();
        if (!segmentedText) return;
        stmt.run(prefixedId, segmentedText, updateTime, type);
        insertedCount += 1;
      });

      if (insertedCount === 0) {
        return false;
      }
    } catch (error) {
      console.error("索引内容失败:", error);
      return false;
    }

    return true;
  }

  static batchIndexContent(db: Database.Database, items: IndexParams[]) {
    if (!this.hasTable(db, "content_fts")) {
      return false;
    }
    try {
      for (const item of items) {
        const { id, content, type, updateTime } = item;
        const prefixedId = addTypePrefix(id, type);
        this.removeIndex(db, prefixedId);

        const normalizedContent = content.trim();
        if (!normalizedContent) {
          continue;
        }

        const chunks = smartChunk(normalizedContent, {
          minLength: 500,
          maxLength: 2000,
          overlap: 0,
          splitter: "paragraph",
        })
          .map(chunkText => chunkText.trim())
          .filter(chunkText => !!chunkText);

        if (chunks.length === 0) {
          continue;
        }

        const stmt = db.prepare(`
          INSERT INTO content_fts (prefixed_id, content, update_time, type)
          VALUES (?, ?, ?, ?)
        `);

        chunks.forEach(chunkText => {
          const segmentedText = this.segmentText(chunkText).trim();
          if (!segmentedText) return;
          stmt.run(prefixedId, segmentedText, updateTime, type);
        });
      }
    } catch (error) {
      console.error("批量索引失败:", error);
      return false;
    }

    return true;
  }

  static removeIndex(db: Database.Database, prefixedId: string) {
    if (!this.hasTable(db, "content_fts")) {
      return true;
    }
    const stmt = db.prepare(`
      DELETE FROM content_fts WHERE prefixed_id = ?
    `);

    stmt.run(prefixedId);
    return true;
  }

  static removeIndexByIdAndType(db: Database.Database, id: number, type: IndexType) {
    const prefixedId = addTypePrefix(id, type);
    return this.removeIndex(db, prefixedId);
  }

  static removeIndexesByType(db: Database.Database, type: string) {
    if (!this.hasTable(db, "content_fts")) {
      return 0;
    }
    const result = db
      .prepare(
        `
          DELETE FROM content_fts WHERE type = ?
        `
      )
      .run(type);
    return result.changes;
  }

  static checkIndexExists(
    db: Database.Database,
    id: number,
    type: IndexType
  ): { updateTime: number } | null {
    if (!this.hasTable(db, "content_fts")) {
      return null;
    }
    const prefixedId = addTypePrefix(id, type);
    const stmt = db.prepare(`
      SELECT MAX(update_time) as update_time FROM content_fts WHERE prefixed_id = ?
    `);

    const result: any = stmt.get(prefixedId);
    if (!result || result.update_time === null || result.update_time === undefined) {
      return null;
    }
    return {
      updateTime: result.update_time,
    };
  }

  static getAllFTSResults(
    mainDb: Database.Database,
    indexDb: Database.Database,
    type?: IndexType
  ): SearchResult[] {
    if (!this.hasTable(indexDb, "content_fts")) {
      return [];
    }

    let sql = `
      SELECT prefixed_id, update_time
      FROM content_fts
    `;
    if (type) {
      sql += ` WHERE type = ?`;
    }
    sql += ` GROUP BY prefixed_id`;

    const stmt = indexDb.prepare(sql);
    const results = type ? stmt.all(type) : stmt.all();
    const partialResults: PartialSearchResult[] = results.map((result: any) => {
      const { id, type } = extractIdFromPrefixed(result.prefixed_id);
      return {
        id: Number(id),
        type: type as IndexType,
        source: "fts",
        updateTime: result.update_time,
      };
    });

    return this.getSearchResultDetails(mainDb, partialResults);
  }

  private static searchContentByLike(
    mainDb: Database.Database,
    searchParams: SearchParams
  ): SearchResult[] {
    const { query, types = [], limit = 10 } = searchParams;
    if (!query.trim()) {
      return [];
    }

    const normalizedQuery = query.trim().toLowerCase();
    const tokens = jieba
      .cutForSearch(query, true)
      .map(token => token.trim().toLowerCase())
      .filter(token => !!token);

    const typeSet = new Set(types);
    const shouldIncludeType = (type: IndexType): boolean => {
      return typeSet.size === 0 || typeSet.has(type);
    };

    const isMatch = (text: string): boolean => {
      const lowerText = text.toLowerCase();
      if (lowerText.includes(normalizedQuery)) {
        return true;
      }
      return tokens.some(token => lowerText.includes(token));
    };

    const partialResults: PartialSearchResult[] = [];

    for (const card of CardTable.getAllCards(mainDb)) {
      if (!shouldIncludeType("card")) continue;
      const text = getMarkdown(card.content || []).trim();
      if (!text || !isMatch(text)) continue;
      partialResults.push({
        id: card.id,
        type: "card",
        source: "fts",
        updateTime: Number(card.update_time || 0),
      });
    }

    for (const article of ArticleTable.getAllArticles(mainDb)) {
      if (!shouldIncludeType("article")) continue;
      const text = getMarkdown(article.content || []).trim();
      if (!text || !isMatch(text)) continue;
      partialResults.push({
        id: article.id,
        type: "article",
        source: "fts",
        updateTime: Number(article.update_time || 0),
      });
    }

    for (const item of ProjectTable.getAllProjectItems(mainDb)) {
      if (!shouldIncludeType("project-item")) continue;
      const text = getMarkdown(item.content || []).trim();
      if (!text || !isMatch(text)) continue;
      partialResults.push({
        id: item.id,
        type: "project-item",
        source: "fts",
        updateTime: Number(item.updateTime || 0),
      });
    }

    for (const entry of DiaryTable.getAllDiaryEntries(mainDb)) {
      const entryType: IndexType = "diary-daily";
      if (!shouldIncludeType(entryType)) continue;
      const text = getMarkdown(entry.content || []).trim();
      if (!text || !isMatch(text)) continue;
      partialResults.push({
        id: entry.id,
        type: entryType,
        source: "fts",
        updateTime: Number(entry.updateTime || 0),
      });
    }

    partialResults.sort((a, b) => b.updateTime - a.updateTime);
    return this.getSearchResultDetails(mainDb, partialResults.slice(0, limit));
  }

  static searchContent(
    mainDb: Database.Database,
    indexDb: Database.Database,
    searchParams: SearchParams
  ): SearchResult[] {
    const { query, types = [], limit = 10 } = searchParams;

    if (!query) return [];

    if (!this.hasTable(indexDb, "content_fts") || !this.isIndexReady(indexDb)) {
      return this.searchContentByLike(mainDb, searchParams);
    }

    const segmentedQuery = jieba
      .cutForSearch(query, true)
      .filter(item => !!item.trim())
      .join(" OR ");

    if (!segmentedQuery.trim()) {
      return this.searchContentByLike(mainDb, searchParams);
    }

    const sql = `
      SELECT prefixed_id, update_time, rank FROM (
        SELECT prefixed_id, update_time, rank,
               ROW_NUMBER() OVER (PARTITION BY prefixed_id ORDER BY rank) as rn
        FROM content_fts
        WHERE content MATCH ?
        ${
          types && types.length > 0
            ? ` AND type IN (${types.map(() => "?").join(",")}) AND rank < -2`
            : ""
        }
      ) WHERE rn = 1
      ORDER BY rank
      LIMIT ?
    `;

    try {
      const stmt = indexDb.prepare(sql);
      const params = [segmentedQuery];
      if (types && types.length > 0) {
        params.push(...types);
      }
      params.push(String(limit));

      const results = stmt.all(...params);
      const partialResults: PartialSearchResult[] = results.map((result: any) => {
        const { id, type } = extractIdFromPrefixed(result.prefixed_id);
        return {
          id: Number(id),
          type: type as IndexType,
          source: "fts",
          updateTime: result.update_time,
          rank: result.rank,
        };
      });

      return this.getSearchResultDetails(mainDb, partialResults);
    } catch (error) {
      console.warn("[FTS] search failed, fallback like:", error);
      return this.searchContentByLike(mainDb, searchParams);
    }
  }

  static async searchHybridContent(
    mainDb: Database.Database,
    indexDb: Database.Database,
    searchParams: SearchParams
  ): Promise<SearchResult[]> {
    const adapter = createMainContentAdapter();
    log.info("[SearchCore][main-content][config]", {
      query: searchParams.query,
      limit: searchParams.limit || 10,
      hasEmbeddingModelInfo: Boolean(searchParams.modelInfo?.model),
    });

    const context: MainContentAdapterContext = {
      mainDb,
      indexDb,
      searchParams,
      searchFTS: this.searchContent.bind(this),
      searchVec: VecDocumentTable.searchContent.bind(VecDocumentTable),
    };

    const { results } = await runSearchPipeline({
      query: searchParams.query,
      limit: searchParams.limit || 10,
      context,
      adapter,
      logger: pipelineLog => {
        log.info("[SearchCore][main-content]", pipelineLog);
      },
      stageLogger: stageLog => {
        log.info(`[SearchCore][main-content][${stageLog.stage}]`, stageLog);
      },
    });

    return results;
  }

  static getSearchResultDetails(
    db: Database.Database,
    results: PartialSearchResult[]
  ): SearchResult[] {
    const detailedResults = [];

    for (const result of results) {
      let details = null;

      switch (result.type) {
        case "card":
          details = CardTable.getCardById(db, result.id);
          break;
        case "article":
          details = ArticleTable.getArticleById(db, result.id);
          break;
        case "project-item":
          details = ProjectTable.getProjectItem(db, result.id);
          break;
        case "diary-daily": {
          const diaryEntry = DiaryTable.getDiaryEntryById(db, result.id);
          if (diaryEntry) {
            details = {
              ...diaryEntry,
              contentId: diaryEntry.segments[0]?.contentId ?? 0,
              title: DiaryTable.getDiarySearchTitle(diaryEntry),
            };
          }
          break;
        }
        default:
          break;
      }

      if (details) {
        detailedResults.push({
          ...result,
          ...details,
          type: result.type,
          // @ts-ignore
          title: details.title || "",
          content: details.content || [],
          updateTime: result.updateTime,
        });
      }
    }

    return detailedResults;
  }
}

export default FTSTable;
