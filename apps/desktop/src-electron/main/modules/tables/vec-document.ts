import Database from "better-sqlite3";
import { VecDocument, IndexParams, SearchParams, SearchResult, IndexType } from "@/types";
import type { EmbeddingProviderType } from "@/types/embedding";
import OpenAI from "openai";
import log from "electron-log";
import localInference from "../local-inference";
import CardTable from "./card";
import ArticleTable from "./article";
import ProjectTable from "./project";
import DocumentTable from "./document";
import DiaryTable from "./diary";
import { smartChunk } from "../../utils/smart-chunk";

const LOCAL_EMBEDDING_CONFIG_ID = "embedding-default-local";

const addTypePrefix = (id: number, type: string): string => {
  return `${type}:${id}`;
};

const extractIdFromPrefixed = (prefixedId: string): { id: string; type: string } => {
  const [type, id] = prefixedId.split(":");
  return { id, type };
};

export default class VecDocumentTable {
  private static getIndexMeta(indexDb: Database.Database, key: string): string | null {
    if (!this.hasTable(indexDb, "index_meta")) {
      return null;
    }
    const row = indexDb.prepare("SELECT value FROM index_meta WHERE key = ?").get(key) as
      { value?: string } | undefined;
    return row?.value || null;
  }

  private static async createEmbeddings(
    texts: string[],
    modelInfo: NonNullable<IndexParams["modelInfo"]>
  ): Promise<number[][]> {
    if (!texts.length) {
      return [];
    }

    const resolvedProviderType: EmbeddingProviderType =
      modelInfo.providerType === "local_python" || modelInfo.configId === LOCAL_EMBEDDING_CONFIG_ID
        ? "local_python"
        : "remote_openai";

    if (resolvedProviderType === "local_python") {
      const result = await localInference.embedTexts(texts, {
        modelDir: modelInfo.localModelDir,
        modelName: modelInfo.model,
        batchSize: modelInfo.batchSize || 8,
        devicePolicy: modelInfo.devicePolicy || "auto",
      });

      const embeddings = result.embeddings || [];
      if (!embeddings.length) {
        return [];
      }

      if (modelInfo.dimensions && embeddings[0] && embeddings[0].length !== modelInfo.dimensions) {
        throw new Error(
          `Embedding 维度不匹配：配置 ${modelInfo.dimensions}，实际 ${embeddings[0].length}`
        );
      }

      return embeddings;
    }

    if (!modelInfo.key || !modelInfo.baseUrl) {
      throw new Error("远端 embedding 缺少 key/baseUrl");
    }

    const client = new OpenAI({
      apiKey: modelInfo.key,
      baseURL: modelInfo.baseUrl,
    });

    const res = await client.embeddings.create({
      model: modelInfo.model,
      input: texts,
      dimensions: modelInfo.dimensions,
    });

    return res.data.map(item => item.embedding);
  }

  private static hasTable(db: Database.Database, tableName: string): boolean {
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
      .get(tableName);
    return !!row;
  }

  private static getIndexAvailability(indexDb: Database.Database): {
    hasVecTable: boolean;
    migrationState: string;
    vecRebuildState: string;
    searchable: boolean;
    partial: boolean;
  } {
    const hasVecTable = this.hasTable(indexDb, "vec_documents");
    const migrationState = this.getIndexMeta(indexDb, "migration_state") || "init";
    const vecRebuildState =
      this.getIndexMeta(indexDb, "vec_rebuild_state") ||
      this.getIndexMeta(indexDb, "rebuild_state") ||
      "pending";

    return {
      hasVecTable,
      migrationState,
      vecRebuildState,
      searchable: hasVecTable && migrationState === "done" && vecRebuildState !== "failed",
      partial: vecRebuildState === "building",
    };
  }

  static initTableByVecLength(db: Database.Database, vecLength: number) {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_documents USING vec0(
        prefixed_id TEXT,
        update_time FLOAT,
        content TEXT,
        type TEXT,
        vec_embedding FLOAT[${vecLength}] distance_metric=cosine
      )
    `);
  }

  static upgradeTable(_db: Database.Database) {
    // 不需要升级
  }

  static getListenEvents() {
    return {
      "vec-document-index-content": (
        _mainDb: Database.Database,
        indexDb: Database.Database,
        params: IndexParams
      ) => this.indexContent(indexDb, params),
      "vec-document-batch-index-content": (
        _mainDb: Database.Database,
        indexDb: Database.Database,
        items: IndexParams[]
      ) => this.batchIndexContent(indexDb, items),
      "vec-document-remove-index": (
        _mainDb: Database.Database,
        indexDb: Database.Database,
        id: number,
        type: IndexType
      ) => this.removeIndexByIdAndType(indexDb, id, type),
      "vec-document-search-content": (
        mainDb: Database.Database,
        indexDb: Database.Database,
        searchParams: SearchParams
      ) => this.searchContent(mainDb, indexDb, searchParams),
      "vec-document-check-index-exists": (
        _mainDb: Database.Database,
        indexDb: Database.Database,
        id: number,
        type: IndexType
      ) => this.checkIndexExists(indexDb, id, type),
      "get-all-vec-document-results": (
        mainDb: Database.Database,
        indexDb: Database.Database,
        type?: IndexType
      ) => this.getAllVecDocumentResults(mainDb, indexDb, type),
      "clear-vec-document-table": (_mainDb: Database.Database, indexDb: Database.Database) =>
        this.clearTableData(indexDb),
      "init-vec-document-table": (
        _mainDb: Database.Database,
        indexDb: Database.Database,
        vecLength: number
      ) => this.initTableByVecLength(indexDb, vecLength),
    };
  }

  static parseVecDocument(document: any): VecDocument {
    const { id, type } = extractIdFromPrefixed(document.prefixed_id);

    return {
      updateTime: document.update_time,
      id: parseInt(id),
      type,
      content: document.content,
    };
  }

  static clearTableData(db: Database.Database): boolean {
    if (!this.hasTable(db, "vec_documents")) {
      return true;
    }
    db.prepare("DROP TABLE IF EXISTS vec_documents").run();
    return true;
  }

  static searchVecDocuments(
    db: Database.Database,
    queryEmbedding: number[],
    topK: number,
    types: IndexType[] = [],
    distance = 0.6
  ): Array<[document: VecDocument, distance: number]> {
    if (!this.hasTable(db, "vec_documents")) {
      return [];
    }

    const typeClause = types.length > 0 ? `AND type IN (${types.map(() => "?").join(",")})` : "";

    const searchQuery = `
      SELECT prefixed_id, update_time, content, distance
      FROM vec_documents
      WHERE distance < ? AND vec_embedding match ? ${typeClause} AND k = ?
      ORDER BY distance
    `;

    const searchStmt = db.prepare(searchQuery);

    const params =
      types.length > 0
        ? [distance, JSON.stringify(queryEmbedding), ...types, topK]
        : [distance, JSON.stringify(queryEmbedding), topK];

    const searchRes = searchStmt.all(...params);

    const res: Array<[document: VecDocument, distance: number]> = [];
    for (const row of searchRes as any[]) {
      const doc = this.parseVecDocument(row);
      const docDistance = row.distance;
      res.push([doc, docDistance]);
    }
    return res;
  }

  static async indexContent(db: Database.Database, params: IndexParams): Promise<boolean> {
    const { id, content, type, updateTime, modelInfo } = params;
    if (!this.hasTable(db, "vec_documents")) {
      return false;
    }

    if (modelInfo && modelInfo.model) {
      const prefixedId = addTypePrefix(id, type);

      this.removeIndexByIdAndType(db, id, type);

      const chunks = smartChunk(content, {
        minLength: 500,
        maxLength: 2000,
        overlap: 0,
        splitter: "paragraph",
      });

      try {
        const batchSize = modelInfo.batchSize || 8;
        for (let i = 0; i < chunks.length; i += batchSize) {
          const chunkBatch = chunks.slice(i, i + batchSize);
          const embeddings = await this.createEmbeddings(chunkBatch, modelInfo);

          if (embeddings.length !== chunkBatch.length) {
            throw new Error("Embedding 数量与分块数量不一致");
          }

          const stmt = db.prepare(`
            INSERT INTO vec_documents
            (prefixed_id, update_time, content, type, vec_embedding)
            VALUES (?, ?, ?, ?, vec_f32(?))
          `);

          for (let j = 0; j < chunkBatch.length; j++) {
            stmt.run(prefixedId, updateTime, chunkBatch[j], type, JSON.stringify(embeddings[j]));
          }
        }

        return true;
      } catch (error) {
        log.error("生成嵌入失败:", error);
        return false;
      }
    } else {
      log.error("没有提供模型信息，无法生成嵌入");
      return false;
    }
  }

  static async batchIndexContent(db: Database.Database, items: IndexParams[]) {
    if (!this.hasTable(db, "vec_documents")) {
      return false;
    }
    const results = [];
    for (const item of items) {
      const result = await this.indexContent(db, item);
      results.push(result);
    }
    return results.every(Boolean);
  }

  static removeIndexByIdAndType(db: Database.Database, id: number, type: IndexType) {
    if (!this.hasTable(db, "vec_documents")) {
      return true;
    }
    try {
      const prefixedId = addTypePrefix(id, type);
      const stmt = db.prepare(`
        DELETE FROM vec_documents WHERE prefixed_id = ?
      `);
      stmt.run(prefixedId);
      return true;
    } catch (error) {
      log.error("移除向量索引失败:", error);
      return false;
    }
  }

  static removeIndexesByType(db: Database.Database, type: string) {
    if (!this.hasTable(db, "vec_documents")) {
      return 0;
    }
    try {
      const result = db
        .prepare(
          `
            DELETE FROM vec_documents WHERE type = ?
          `
        )
        .run(type);
      return result.changes;
    } catch (error) {
      log.error("按类型移除向量索引失败:", error);
      return 0;
    }
  }

  static async searchContent(
    mainDb: Database.Database,
    indexDb: Database.Database,
    searchParams: SearchParams
  ): Promise<SearchResult[]> {
    const { query, types = [], limit = 10, modelInfo } = searchParams;

    if (!query) return [];

    const availability = this.getIndexAvailability(indexDb);
    if (!availability.searchable) {
      log.warn("[VecDocument] search skipped:", availability);
      return [];
    }

    log.info("[VecDocument] search start:", {
      model: modelInfo?.model,
      distance: modelInfo?.distance,
      typesFilter: types,
      vecRebuildState: availability.vecRebuildState,
      partial: availability.partial,
      vecAvailableDuringBuilding: availability.vecRebuildState === "building",
    });

    const results: SearchResult[] = [];

    if (modelInfo && modelInfo.model) {
      try {
        const embeddings = await this.createEmbeddings([query], modelInfo);
        const queryEmbedding = embeddings[0];
        if (!queryEmbedding || queryEmbedding.length === 0) {
          log.warn("[VecDocument] embedding 生成为空");
          return [];
        }
        log.info("[VecDocument] embedding 生成成功:", {
          dimensions: queryEmbedding.length,
        });
        const searchResults = this.searchVecDocuments(
          indexDb,
          queryEmbedding,
          limit,
          types,
          modelInfo.distance || 0.6
        );
        log.info("[VecDocument] searchVecDocuments 结果:", {
          count: searchResults.length,
          vecRebuildState: availability.vecRebuildState,
          partial: availability.partial,
        });

        const processedIds = new Set<string>();

        for (const [doc, distance] of searchResults) {
          let details = null;
          const uniqueKey = addTypePrefix(doc.id, doc.type);
          if (processedIds.has(uniqueKey)) {
            continue;
          }
          processedIds.add(uniqueKey);

          switch (doc.type as IndexType) {
            case "card":
              details = CardTable.getCardById(mainDb, doc.id);
              break;
            case "article":
              details = ArticleTable.getArticleById(mainDb, doc.id);
              break;
            case "project-item":
              details = ProjectTable.getProjectItem(mainDb, doc.id);
              break;
            case "document-item":
              details = DocumentTable.getDocumentItem(mainDb, doc.id);
              break;
            case "diary-daily": {
              const diaryEntry = DiaryTable.getDiaryEntryById(mainDb, doc.id);
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
            results.push({
              id: doc.id,
              contentId: details.contentId,
              type: doc.type as IndexType,
              // @ts-ignore
              title: details.title || "",
              content: details.content || [],
              source: "vec-document" as const,
              updateTime: doc.updateTime,
              // @ts-ignore
              distance,
            });
          }
        }
      } catch (error) {
        log.warn("[VecDocument] search failed:", error);
        return [];
      }
    } else {
      log.error("没有提供模型信息，无法生成嵌入");
    }

    return results;
  }

  static checkIndexExists(
    db: Database.Database,
    id: number,
    type: IndexType
  ): { updateTime: number } | null {
    if (!this.hasTable(db, "vec_documents")) {
      return null;
    }
    const prefixedId = addTypePrefix(id, type);
    const stmt = db.prepare(`
      SELECT update_time FROM vec_documents WHERE prefixed_id = ?
    `);
    const result: any = stmt.get(prefixedId);
    if (!result || result.update_time === null || result.update_time === undefined) {
      return null;
    }
    return {
      updateTime: result.update_time,
    };
  }

  static getAllVecDocumentResults(
    mainDb: Database.Database,
    indexDb: Database.Database,
    type?: IndexType
  ): SearchResult[] {
    if (!this.hasTable(indexDb, "vec_documents")) {
      return [];
    }

    let query = `
      SELECT prefixed_id, update_time, content, type
      FROM vec_documents
    `;

    if (type) {
      query += ` WHERE type = ?`;
    }

    query += ` GROUP BY prefixed_id`;

    const stmt = indexDb.prepare(query);
    const documents = type ? stmt.all(type) : stmt.all();
    const vecDocuments = documents.map(doc => this.parseVecDocument(doc));
    const results: SearchResult[] = [];

    for (const doc of vecDocuments) {
      let details = null;

      switch (doc.type as IndexType) {
        case "card":
          details = CardTable.getCardById(mainDb, doc.id);
          break;
        case "article":
          details = ArticleTable.getArticleById(mainDb, doc.id);
          break;
        case "project-item":
          details = ProjectTable.getProjectItem(mainDb, doc.id);
          break;
        case "document-item":
          details = DocumentTable.getDocumentItem(mainDb, doc.id);
          break;
        case "diary-daily": {
          const diaryEntry = DiaryTable.getDiaryEntryById(mainDb, doc.id);
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
        results.push({
          id: doc.id,
          type: doc.type as IndexType,
          contentId: details.contentId,
          // @ts-ignore
          title: details.title || "",
          content: details.content || [],
          source: "vec-document" as const,
          updateTime: doc.updateTime,
        });
      }
    }

    return results;
  }
}
