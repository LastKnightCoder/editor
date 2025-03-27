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

  static upgradeTable(db: Database.Database) {
    // 检查是否是旧表结构
    try {
      const res: any = db
        .prepare(
          `
        SELECT sql FROM sqlite_master 
        WHERE type='table' AND name=?
      `,
        )
        .get("vec_documents");

      // 如果表不存在，直接返回
      if (!res) return;

      const sql = res.sql?.toLowerCase() || "";

      if (sql.includes("virtual table") && sql.includes("vec0")) {
        return;
      }

      log.info("需要升级vec_documents表结构，从旧表迁移到vec0虚拟表");

      // 迁移数据
      this.migrateData(db);
    } catch (error) {
      log.error("检查表结构失败:", error);
    }
  }

  static migrateData(db: Database.Database) {
    try {
      // 1. 获取所有旧数据
      interface OldVecDocument {
        id?: number;
        update_time?: number;
        ref_type?: string;
        ref_id?: number;
        ref_update_time?: number;
        contents?: string;
        contents_embedding_json?: string;
      }

      let oldData: OldVecDocument[] = [];

      try {
        // 尝试读取旧表结构的数据
        oldData = db
          .prepare(
            `
          SELECT id, update_time, ref_type, ref_id, ref_update_time, contents, 
                 vec_to_json(contents_embedding) as contents_embedding_json
          FROM vec_documents
        `,
          )
          .all() as OldVecDocument[];
      } catch (error) {
        log.error("读取旧表数据失败，可能表结构不匹配:", error);
        oldData = [];
      }

      // 2. 重命名旧表
      try {
        db.prepare(
          `ALTER TABLE vec_documents RENAME TO vec_documents_old`,
        ).run();
      } catch (error) {
        log.error("重命名旧表失败:", error);
        // 如果重命名失败，尝试直接删除旧表
        try {
          db.prepare(`DROP TABLE IF EXISTS vec_documents`).run();
        } catch (dropError) {
          log.error("删除旧表失败:", dropError);
          return;
        }
      }

      // 3. 创建新的虚拟表
      this.initTable(db);

      // 4. 迁移数据到新表
      if (oldData.length > 0) {
        const insertStmt = db.prepare(`
          INSERT INTO vec_documents 
          (prefixed_id, type, update_time, content, vec_embedding)
          VALUES (?, ?, ?, ?, vec_f32(?))
        `);

        const migrationTransaction = db.transaction(() => {
          for (const item of oldData) {
            try {
              const prefixedId = addTypePrefix(
                item.ref_id || 0,
                item.ref_type || "",
              );
              if (!item.contents_embedding_json) {
                log.error("迁移单条数据失败:", item);
                continue;
              }
              insertStmt.run(
                prefixedId,
                item.ref_type,
                item.ref_update_time,
                item.contents || "",
                item.contents_embedding_json,
              );
            } catch (itemError) {
              log.error("迁移单条数据失败:", itemError);
            }
          }
        });

        try {
          migrationTransaction();
          log.info(`成功迁移 ${oldData.length} 条数据`);
        } catch (transactionError) {
          log.error("事务迁移失败:", transactionError);
        }
      }
      try {
        db.prepare(`DROP TABLE IF EXISTS vec_documents_old`).run();
        log.info("vec_documents表迁移完成，已删除旧表");
      } catch (error) {
        log.error("删除旧表失败:", error);
      }
    } catch (error) {
      log.error("迁移vec_documents表失败:", error);
      // 把新表删掉，把旧表改回原名
      try {
        db.prepare(`DROP TABLE IF EXISTS vec_documents`).run();
        db.prepare(
          `ALTER TABLE vec_documents_old RENAME TO vec_documents`,
        ).run();
      } catch (error) {
        log.error("恢复表结构失败:", error);
      }
    }
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
    // 清空虚拟表数据，但是保留虚拟表
    db.prepare("DELETE FROM vec_documents; VACUUM").run();
    log.info("向量索引表已清空");
    return true;
  }

  static searchVecDocuments(
    db: Database.Database,
    queryEmbedding: number[],
    topK: number,
    types: IndexType[] = [],
  ): Array<[document: VecDocument, distance: number]> {
    const typeClause =
      types.length > 0 ? `AND type IN (${types.map(() => "?").join(",")})` : "";

    const searchQuery = `
      SELECT prefixed_id, update_time, content, distance
      FROM vec_documents
      WHERE distance < 0.6 AND vec_embedding match ? ${typeClause} AND k = ?
      ORDER BY distance
    `;

    const searchStmt = db.prepare(searchQuery);

    const params =
      types.length > 0
        ? [JSON.stringify(queryEmbedding), ...types, topK]
        : [JSON.stringify(queryEmbedding), topK];

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
        });

        const embedding = res.data[0].embedding;

        // 插入到虚拟表
        const stmt = db.prepare(`
          INSERT INTO vec_documents
          (prefixed_id, update_time, content, vec_embedding)
          VALUES (?, ?, ?, vec_f32(?))
        `);

        stmt.run(prefixedId, updateTime, chunkText, JSON.stringify(embedding));
      });

      try {
        await Promise.all(embeddingPromises);
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

    // 如果有 modelInfo，使用 OpenAI API 生成嵌入
    if (modelInfo && modelInfo.key && modelInfo.model && modelInfo.baseUrl) {
      // 使用 OpenAI API 生成嵌入
      const client = new OpenAI({
        apiKey: modelInfo.key,
        baseURL: modelInfo.baseUrl,
      });

      const start = Date.now();
      const res = await client.embeddings.create({
        model: modelInfo.model,
        input: query,
      });

      const queryEmbedding = res.data[0].embedding;
      const searchResults = this.searchVecDocuments(
        db,
        queryEmbedding,
        limit,
        types,
      );

      const end = Date.now();
      log.info("embedding time", end - start);
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
          default:
            break;
        }

        if (details) {
          results.push({
            id: doc.id,
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
      log.info("search time", Date.now() - start);
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

    log.info("query: ", query, type);

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
        default:
          break;
      }

      if (details) {
        results.push({
          id: doc.id,
          type: doc.type as IndexType,
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
