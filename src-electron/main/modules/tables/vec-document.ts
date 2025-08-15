import Database from "better-sqlite3";
import {
  VecDocument,
  IndexParams,
  SearchParams,
  SearchResult,
  IndexType,
} from "@/types";
import OpenAI from "openai";
import { chunk } from "llm-chunk";
import log from "electron-log";
import CardTable from "./card";
import ArticleTable from "./article";
import ProjectTable from "./project";
import DocumentTable from "./document";
import LogTable from "./log";

// 添加类型前缀到ID
const addTypePrefix = (id: number, type: string): string => {
  return `${type}:${id}`;
};

// 从带前缀的ID中提取原始ID
const extractIdFromPrefixed = (
  prefixedId: string,
): { id: string; type: string } => {
  const [type, id] = prefixedId.split(":");
  return { id, type };
};

export default class VecDocumentTable {
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

  static initTable(db: Database.Database) {
    this.initTableByVecLength(db, 3072);
  }

  static upgradeTable(_db: Database.Database) {
    // 不需要升级
  }

  static getListenEvents() {
    return {
      "vec-document-index-content": this.indexContent.bind(this),
      "vec-document-batch-index-content": this.batchIndexContent.bind(this),
      "vec-document-remove-index": this.removeIndexByIdAndType.bind(this),
      "vec-document-search-content": this.searchContent.bind(this),
      "vec-document-check-index-exists": this.checkIndexExists.bind(this),
      "get-all-vec-document-results": this.getAllVecDocumentResults.bind(this),
      "clear-vec-document-table": this.clearTableData.bind(this),
      "init-vec-document-table": this.initTableByVecLength.bind(this),
    };
  }

  static parseVecDocument(document: any): VecDocument {
    // 从prefixed_id中提取原始ID和类型
    const { id, type } = extractIdFromPrefixed(document.prefixed_id);

    return {
      updateTime: document.update_time,
      id: parseInt(id),
      type,
      content: document.content,
    };
  }

  static clearTableData(db: Database.Database): boolean {
    // 删除数据库
    db.prepare("DROP TABLE IF EXISTS vec_documents").run();
    return true;
  }

  static searchVecDocuments(
    db: Database.Database,
    queryEmbedding: number[],
    topK: number,
    types: IndexType[] = [],
    distance = 0.6,
  ): Array<[document: VecDocument, distance: number]> {
    const typeClause =
      types.length > 0 ? `AND type IN (${types.map(() => "?").join(",")})` : "";

    const searchQuery = `
      SELECT prefixed_id, update_time, content, distance
      FROM vec_documents
      WHERE distance < ? AND vec_embedding match ? ${typeClause} AND k = ?
      ORDER BY distance
    `;

    const searchStmt = db.prepare(searchQuery);

    log.info("params", distance, types, topK);

    const params =
      types.length > 0
        ? [distance, JSON.stringify(queryEmbedding), ...types, topK]
        : [distance, JSON.stringify(queryEmbedding), topK];

    const searchRes = searchStmt.all(...params);

    const res: Array<[document: VecDocument, distance: number]> = [];
    for (const row of searchRes as any[]) {
      const doc = this.parseVecDocument(row);
      const distance = row.distance;
      res.push([doc, distance]);
    }
    return res;
  }

  static async indexContent(
    db: Database.Database,
    params: IndexParams,
  ): Promise<boolean> {
    const { id, content, type, updateTime, modelInfo } = params;

    // 如果有 modelInfo，使用 OpenAI API 生成嵌入
    if (modelInfo && modelInfo.key && modelInfo.model && modelInfo.baseUrl) {
      const prefixedId = addTypePrefix(id, type);

      // 先删除可能存在的旧索引
      this.removeIndexByIdAndType(db, id, type);

      // 将内容分块
      const chunks = chunk(content, {
        minLength: 500,
        maxLength: 2000,
        overlap: 0,
        splitter: "paragraph",
      });

      const client = new OpenAI({
        apiKey: modelInfo.key,
        baseURL: modelInfo.baseUrl,
      });

      const embeddingPromises = chunks.map(async (chunkText) => {
        const res = await client.embeddings.create({
          model: modelInfo.model,
          input: chunkText,
          dimensions: modelInfo.dimensions,
        });

        const embedding = res.data[0].embedding;

        // 插入到虚拟表
        const stmt = db.prepare(`
          INSERT INTO vec_documents
          (prefixed_id, update_time, content, type, vec_embedding)
          VALUES (?, ?, ?, ?, vec_f32(?))
        `);

        stmt.run(
          prefixedId,
          updateTime,
          chunkText,
          type,
          JSON.stringify(embedding),
        );
      });

      try {
        const res = await Promise.allSettled(embeddingPromises);
        log.info("res", res);
        return res.every((item) => item.status === "fulfilled");
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
    const results = [];
    for (const item of items) {
      const result = await this.indexContent(db, item);
      results.push(result);
    }
    return results.every(Boolean);
  }

  static removeIndexByIdAndType(
    db: Database.Database,
    id: number,
    type: IndexType,
  ) {
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

  static async searchContent(
    db: Database.Database,
    searchParams: SearchParams,
  ): Promise<SearchResult[]> {
    const { query, types = [], limit = 10, modelInfo } = searchParams;

    if (!query) return [];

    const results: SearchResult[] = [];

    // 如果有 modelInfo，使用 OpenAI API 生成嵌入
    if (modelInfo && modelInfo.key && modelInfo.model && modelInfo.baseUrl) {
      // 使用 OpenAI API 生成嵌入
      const client = new OpenAI({
        apiKey: modelInfo.key,
        baseURL: modelInfo.baseUrl,
      });

      const res = await client.embeddings.create({
        model: modelInfo.model,
        input: query,
        dimensions: modelInfo.dimensions,
      });

      const queryEmbedding = res.data[0].embedding;
      const searchResults = this.searchVecDocuments(
        db,
        queryEmbedding,
        limit,
        types,
        modelInfo.distance || 0.6,
      );

      const processedIds = new Set<string>(); // 用于去重

      for (const [doc, distance] of searchResults) {
        let details = null;
        const uniqueKey = addTypePrefix(doc.id, doc.type);
        if (processedIds.has(uniqueKey)) {
          continue;
        }
        processedIds.add(uniqueKey);

        switch (doc.type as IndexType) {
          case "card":
            details = CardTable.getCardById(db, doc.id);
            break;
          case "article":
            details = ArticleTable.getArticleById(db, doc.id);
            break;
          case "project-item":
            details = ProjectTable.getProjectItem(db, doc.id);
            break;
          case "document-item":
            details = DocumentTable.getDocumentItem(db, doc.id);
            break;
          case "log-entry":
            details = LogTable.getLogById(db, doc.id);
            break;
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
            content: details.content,
            source: "vec-document" as const,
            updateTime: doc.updateTime,
            // @ts-ignore
            distance,
          });
        }
      }
    } else {
      log.error("没有提供模型信息，无法生成嵌入");
    }

    return results;
  }

  static checkIndexExists(
    db: Database.Database,
    id: number,
    type: IndexType,
  ): { updateTime: number } | null {
    const prefixedId = addTypePrefix(id, type);
    const stmt = db.prepare(`
      SELECT update_time FROM vec_documents WHERE prefixed_id = ?
    `);
    const result: any = stmt.get(prefixedId);
    if (!result) {
      return null;
    }
    return {
      updateTime: result.update_time,
    };
  }

  // 获取所有向量索引结果
  static getAllVecDocumentResults(
    db: Database.Database,
    type?: IndexType,
  ): SearchResult[] {
    let query = `
      SELECT prefixed_id, update_time, content, type
      FROM vec_documents
    `;

    // 如果指定了类型，添加类型过滤
    if (type) {
      query += ` WHERE type = ?`;
    }

    // 添加分组，确保每个prefixed_id只返回一次
    query += ` GROUP BY prefixed_id`;

    const stmt = db.prepare(query);
    const documents = type ? stmt.all(type) : stmt.all();
    const vecDocuments = documents.map((doc) => this.parseVecDocument(doc));
    const results: SearchResult[] = [];

    for (const doc of vecDocuments) {
      let details = null;

      switch (doc.type as IndexType) {
        case "card":
          details = CardTable.getCardById(db, doc.id);
          break;
        case "article":
          details = ArticleTable.getArticleById(db, doc.id);
          break;
        case "project-item":
          details = ProjectTable.getProjectItem(db, doc.id);
          break;
        case "document-item":
          details = DocumentTable.getDocumentItem(db, doc.id);
          break;
        case "log-entry":
          details = LogTable.getLogById(db, doc.id);
          break;
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
          content: details.content,
          source: "vec-document" as const,
          updateTime: doc.updateTime,
        });
      }
    }

    return results;
  }
}
