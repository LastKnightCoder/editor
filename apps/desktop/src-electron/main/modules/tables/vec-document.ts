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
import pythonService from "../python-service";
import { app } from "electron";
import path from "node:path";
import CardTable from "./card";
import ArticleTable from "./article";
import ProjectTable from "./project";
import DocumentTable from "./document";
import DiaryTable from "./diary";

const LOCAL_EMBEDDING_CONFIG_ID = "embedding-default-local";

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
  private static async createEmbeddings(
    texts: string[],
    modelInfo: NonNullable<IndexParams["modelInfo"]>,
  ): Promise<number[][]> {
    if (!texts.length) {
      return [];
    }

    const resolvedProviderType: "remote_openai" | "local_python" =
      modelInfo.providerType === "local_python" ||
      modelInfo.configId === LOCAL_EMBEDDING_CONFIG_ID
        ? "local_python"
        : "remote_openai";

    if (resolvedProviderType === "local_python") {
      const resolvedModelDir =
        modelInfo.localModelDir ||
        path.join(app.getPath("userData"), "embedding-models");

      const client = await pythonService.ensureStarted();
      const result = await client.request<{
        embeddings: number[][];
        dimensions?: number;
      }>("embed_texts", {
        texts,
        modelDir: resolvedModelDir,
        modelName: modelInfo.model,
        batchSize: modelInfo.batchSize || 8,
        devicePolicy: modelInfo.devicePolicy || "auto",
      });

      const embeddings = result.embeddings || [];
      if (!embeddings.length) {
        return [];
      }

      if (
        modelInfo.dimensions &&
        embeddings[0] &&
        embeddings[0].length !== modelInfo.dimensions
      ) {
        throw new Error(
          `Embedding 维度不匹配：配置 ${modelInfo.dimensions}，实际 ${embeddings[0].length}`,
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

    return res.data.map((item) => item.embedding);
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

    if (modelInfo && modelInfo.model) {
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
            stmt.run(
              prefixedId,
              updateTime,
              chunkBatch[j],
              type,
              JSON.stringify(embeddings[j]),
            );
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

    console.log("modelInfo", modelInfo);

    if (modelInfo && modelInfo.model) {
      const embeddings = await this.createEmbeddings([query], modelInfo);
      const queryEmbedding = embeddings[0];
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
          case "diary-daily":
          case "diary-weekly":
          case "diary-monthly": {
            const diaryEntry = DiaryTable.getDiaryEntryById(db, doc.id);
            if (diaryEntry) {
              const typeLabels = {
                daily: "日记",
                weekly: "周记",
                monthly: "月记",
              };
              details = {
                ...diaryEntry,
                title: `${diaryEntry.date} ${typeLabels[diaryEntry.type] || "日记"}`,
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
        case "diary-daily":
        case "diary-weekly":
        case "diary-monthly": {
          const diaryEntry = DiaryTable.getDiaryEntryById(db, doc.id);
          if (diaryEntry) {
            const typeLabels = {
              daily: "日记",
              weekly: "周记",
              monthly: "月记",
            };
            details = {
              ...diaryEntry,
              title: `${diaryEntry.date} ${typeLabels[diaryEntry.type] || "日记"}`,
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
