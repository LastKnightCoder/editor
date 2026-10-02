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
import { searchResultDetails } from "../search-details";
import { getMarkdown } from "@/utils/markdown.ts";
import { sectionsForIndex, writeContentSections, readContentSection } from "../content-sections";
import { splitSections } from "@/entity/sections";
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
  chunkIndex?: number;
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
      .prepare("SELECT value FROM index_meta WHERE key = 'fts_rebuild_state'")
      .get() as { value?: string } | undefined;
    return migrationState?.value === "done" && rebuildState?.value !== "failed";
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

    const normalizedContent = content.trim();
    if (!normalizedContent) {
      return false;
    }

    const chunks = sectionsForIndex(params);

    try {
      if (chunks.length === 0) {
        return false;
      }

      db.transaction(() => {
        this.removeIndex(db, prefixedId);
        writeContentSections(db, prefixedId, chunks);
        const stmt = db.prepare(`
          INSERT INTO content_fts (prefixed_id, content, update_time, type, title, chunk_index)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        chunks.forEach(chunk => {
          const segmentedText = this.segmentText(chunk.text).trim();
          if (!segmentedText) return;
          stmt.run(
            prefixedId,
            segmentedText,
            updateTime,
            type,
            this.segmentText([params.title, chunk.headingPath].filter(Boolean).join(" › ")),
            chunk.chunkIndex
          );
        });
      })();
    } catch (error) {
      console.error("索引内容失败:", error);
      return false;
    }

    return true;
  }

  static batchIndexContent(db: Database.Database, items: IndexParams[]) {
    return items.map(item => this.indexContent(db, item)).every(Boolean);
  }

  static removeIndex(db: Database.Database, prefixedId: string) {
    if (!this.hasTable(db, "content_fts")) {
      return true;
    }
    const stmt = db.prepare(`
      DELETE FROM content_fts WHERE prefixed_id = ?
    `);

    stmt.run(prefixedId);
    db.prepare("DELETE FROM content_sections WHERE prefixed_id = ?").run(prefixedId);
    // 节位置只有一份；正文重切后旧向量必须失效，避免匹配到新节的位置。
    if (this.hasTable(db, "vec_documents")) {
      db.prepare("DELETE FROM vec_documents WHERE prefixed_id = ?").run(prefixedId);
    }
    return true;
  }

  /**
   * 对账清理：删除这些类型里不在 keep（`type:id`）中的索引——实体已删、摘录软删、剪藏变孤儿。
   * 返回删除的文档数。
   */
  static removeIndexesNotIn(db: Database.Database, keep: Set<string>, types: readonly string[]) {
    if (!this.hasTable(db, "content_fts") || types.length === 0) return 0;
    const rows = db
      .prepare(
        `SELECT DISTINCT prefixed_id FROM content_fts WHERE type IN (${types.map(() => "?").join(",")})`
      )
      .all(...types) as Array<{ prefixed_id: string }>;
    let removed = 0;
    for (const row of rows) {
      if (keep.has(row.prefixed_id)) continue;
      this.removeIndex(db, row.prefixed_id);
      removed += 1;
    }
    return removed;
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
      SELECT prefixed_id, update_time, rank, chunk_index FROM (
        SELECT prefixed_id, update_time, rank, chunk_index,
               ROW_NUMBER() OVER (PARTITION BY prefixed_id ORDER BY rank) as rn
        FROM content_fts
        WHERE content_fts MATCH ?
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
          chunkIndex: result.chunk_index,
        };
      });

      return this.getSearchResultDetails(mainDb, partialResults, indexDb);
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
    results: PartialSearchResult[],
    indexDb?: Database.Database
  ): SearchResult[] {
    const detailedResults = [];

    for (const result of results) {
      const details = searchResultDetails(db, result.type, result.id);

      if (details) {
        const section =
          indexDb && result.chunkIndex != null
            ? splitSections(details.content, details.title, result.type === "card")[
                result.chunkIndex
              ]
            : undefined;
        detailedResults.push({
          ...result,
          ...details,
          type: result.type,
          title: details.title,
          content: details.content,
          ...(indexDb && section
            ? {
                section: readContentSection(
                  indexDb,
                  `${result.type}:${result.id}`,
                  result.chunkIndex,
                  section.text
                ),
              }
            : {}),
          updateTime: result.updateTime,
        });
      }
    }

    return detailedResults;
  }
}

export default FTSTable;
