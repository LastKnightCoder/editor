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
import CardTable from "./card";
import ArticleTable from "./article";
import ProjectTable from "./project";
import DocumentTable from "./document";

export default class VecDocumentTable {
  static initTable(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS vec_documents (
          id INTEGER PRIMARY KEY,
          create_time INTEGER,
          update_time INTEGER,
          ref_type TEXT,
          ref_id INTEGER,
          ref_update_time INTEGER,
          contents TEXT,
          contents_embedding blob check(vec_length(contents_embedding) == 3072)
      ) strict
    `);
  }

  static upgradeTable(_db: Database.Database) {
    // TODO 暂无升级
  }

  static getListenEvents() {
    return {
      "create-vec-document": this.createVecDocument.bind(this),
      "update-vec-document": this.updateVecDocument.bind(this),
      "delete-vec-document": this.deleteVecDocument.bind(this),
      "delete-vec-documents-by-ref": this.deleteVecDocumentsByRef.bind(this),
      "get-vec-document": this.getVecDocument.bind(this),
      "get-vec-documents-by-ref": this.getVecDocumentsByRef.bind(this),
      "get-vec-documents-by-ref-type": this.getVecDocumentsByRefType.bind(this),
      "get-all-vec-documents": this.getAllVecDocuments.bind(this),
      "search-vec-documents": this.searchVecDocuments.bind(this),
      "vec-document-index-content": this.indexContent.bind(this),
      "vec-document-batch-index-content": this.batchIndexContent.bind(this),
      "vec-document-remove-index": this.removeIndexByIdAndType.bind(this),
      "vec-document-search-content": this.searchContent.bind(this),
      "get-all-vec-document-results": this.getAllVecDocumentResults.bind(this),
    };
  }

  static parseVecDocument(document: any): VecDocument {
    return {
      ...document,
      contentsEmbedding: JSON.parse(document.contents_embedding_json),
      createTime: document.create_time,
      updateTime: document.update_time,
      refType: document.ref_type,
      refId: document.ref_id,
      refUpdateTime: document.ref_update_time,
    };
  }

  static createVecDocument(
    db: Database.Database,
    params: {
      refType: string;
      refId: number;
      refUpdateTime: number;
      contents: string;
      contentsEmbedding: number[];
    },
  ): VecDocument {
    this.deleteVecDocumentsByRef(db, params.refId, params.refType);
    const stmt = db.prepare(`
      INSERT INTO vec_documents
      (create_time, update_time, ref_type, ref_id, ref_update_time, contents, contents_embedding)
      VALUES (?, ?, ?, ?, ?, ?, vec_f32(?))
    `);
    const now = Date.now();
    const res = stmt.run(
      now,
      now,
      params.refType,
      params.refId,
      params.refUpdateTime,
      params.contents,
      JSON.stringify(params.contentsEmbedding),
    );

    return this.getVecDocument(db, Number(res.lastInsertRowid));
  }

  static updateVecDocument(
    db: Database.Database,
    params: {
      id: number;
      refType: string;
      refId: number;
      refUpdateTime: number;
      contents: string;
      contentsEmbedding: number[];
    },
  ): VecDocument {
    const stmt = db.prepare(`
      UPDATE vec_documents SET
        update_time = ?,
        ref_type = ?,
        ref_id = ?,
        ref_update_time = ?,
        contents = ?,
        contents_embedding = vec_f32(?)
      WHERE id = ?
    `);
    const now = Date.now();
    stmt.run(
      now,
      params.refType,
      params.refId,
      params.refUpdateTime,
      params.contents,
      JSON.stringify(params.contentsEmbedding),
      params.id,
    );

    return this.getVecDocument(db, params.id);
  }

  static deleteVecDocument(db: Database.Database, id: number): number {
    const stmt = db.prepare("DELETE FROM vec_documents WHERE id = ?");
    return stmt.run(id).changes;
  }

  static getVecDocument(db: Database.Database, id: number): VecDocument {
    const stmt = db.prepare(
      "SELECT *, vec_to_json(contents_embedding) as contents_embedding_json FROM vec_documents WHERE id = ?",
    );
    const document = stmt.get(id);
    return this.parseVecDocument(document);
  }

  static getVecDocumentsByRef(
    db: Database.Database,
    refId: number,
    refType: string,
  ): VecDocument[] {
    const stmt = db.prepare(`
      SELECT *, vec_to_json(contents_embedding) as contents_embedding_json FROM vec_documents 
      WHERE ref_type = ? AND ref_id = ?
    `);
    const documents = stmt.all(refType, refId);
    return documents.map((doc) => this.parseVecDocument(doc));
  }

  static deleteVecDocumentsByRef(
    db: Database.Database,
    refId: number,
    refType: string,
  ): void {
    const stmt = db.prepare(`
      DELETE FROM vec_documents 
      WHERE ref_type = ? AND ref_id = ?
    `);
    stmt.run(refType, refId);
  }

  static getVecDocumentsByRefType(
    db: Database.Database,
    refType: string,
  ): VecDocument[] {
    const stmt = db.prepare(`
      SELECT *, vec_to_json(contents_embedding) as contents_embedding_json FROM vec_documents 
      WHERE ref_type = ?
    `);
    const documents = stmt.all(refType);
    return documents.map((doc) => this.parseVecDocument(doc));
  }

  static getAllVecDocuments(db: Database.Database): VecDocument[] {
    const stmt = db.prepare(
      "SELECT *, vec_to_json(contents_embedding) as contents_embedding_json FROM vec_documents ORDER BY create_time DESC",
    );
    const documents = stmt.all();
    return documents.map((doc) => this.parseVecDocument(doc));
  }

  static searchVecDocuments(
    db: Database.Database,
    queryEmbedding: number[],
    topK: number,
    types: IndexType[] = [],
  ): Array<[document: VecDocument, distance: number]> {
    const searchStmt = db.prepare(
      `SELECT id, vec_distance_cosine(?, contents_embedding) AS distance FROM vec_documents WHERE distance < 0.6 AND ref_type IN (${types.map(() => "?").join(",")}) ORDER BY distance LIMIT ?`,
    );
    const searchRes = searchStmt.all(
      JSON.stringify(queryEmbedding),
      ...types,
      topK,
    ) as Array<{ id: number; distance: number }>;
    const res: Array<[document: VecDocument, distance: number]> = [];
    for (const row of searchRes) {
      const doc = this.getVecDocument(db, row.id);
      res.push([doc, row.distance]);
    }
    return res;
  }

  static async indexContent(db: Database.Database, params: IndexParams) {
    const { id, content, type, updateTime, modelInfo } = params;

    // 如果有 modelInfo，使用 OpenAI API 生成嵌入
    if (modelInfo && modelInfo.key && modelInfo.model && modelInfo.baseUrl) {
      const chunks = chunk(content, {
        minLength: 500,
        maxLength: 2000,
        overlap: 0,
        splitter: "paragraph",
      });

      for (const chunk of chunks) {
        // 使用 OpenAI API 生成嵌入
        const client = new OpenAI({
          apiKey: modelInfo.key,
          baseURL: modelInfo.baseUrl,
        });

        const res = await client.embeddings.create({
          model: modelInfo.model,
          input: content,
        });

        const contentsEmbedding = res.data[0].embedding;
        this.createVecDocument(db, {
          refType: type,
          refId: id,
          refUpdateTime: updateTime,
          contents: chunk,
          contentsEmbedding: contentsEmbedding,
        });
      }
    }

    return true;
  }

  static async batchIndexContent(db: Database.Database, items: IndexParams[]) {
    const res = await Promise.all(
      items.map((item) => this.indexContent(db, item)),
    );
    return res.every(Boolean);
  }

  static removeIndexByIdAndType(
    db: Database.Database,
    id: number,
    type: IndexType,
  ) {
    try {
      this.deleteVecDocumentsByRef(db, id, type);
      return true;
    } catch (error) {
      console.error("移除向量索引失败:", error);
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
      });

      const queryEmbedding = res.data[0].embedding;
      const searchResults = this.searchVecDocuments(
        db,
        queryEmbedding,
        limit,
        types,
      );

      for (const [doc] of searchResults) {
        let details = null;

        switch (doc.refType as IndexType) {
          case "card":
            details = CardTable.getCardById(db, doc.refId);
            break;
          case "article":
            details = ArticleTable.getArticleById(db, doc.refId);
            break;
          case "project-item":
            details = ProjectTable.getProjectItem(db, doc.refId);
            break;
          case "document-item":
            details = DocumentTable.getDocumentItem(db, doc.refId);
            break;
          default:
            break;
        }

        if (details) {
          // 按照 type 和 id 去重
          const uniqueResult = results.find(
            (result) => result.id === doc.refId && result.type === doc.refType,
          );
          if (!uniqueResult) {
            results.push({
              id: doc.refId,
              type: doc.refType as IndexType,
              // @ts-ignore
              title: details.title || "",
              content: details.content,
              source: "vec-document" as const,
              updateTime: doc.updateTime,
            });
          }
        }
      }
    }

    return results;
  }

  // 获取所有向量索引结果
  static getAllVecDocumentResults(
    db: Database.Database,
    type?: IndexType,
  ): SearchResult[] {
    let query = `
      SELECT *, vec_to_json(contents_embedding) as contents_embedding_json 
      FROM vec_documents
    `;

    // 如果指定了类型，添加类型过滤
    if (type) {
      query += ` WHERE ref_type = ?`;
    }

    const stmt = db.prepare(query);
    const documents = type ? stmt.all(type) : stmt.all();
    const vecDocuments = documents.map((doc) => this.parseVecDocument(doc));

    const results: SearchResult[] = [];
    const processedIds = new Set<string>(); // 用于去重

    for (const doc of vecDocuments) {
      let details = null;
      const uniqueKey = `${doc.refType}:${doc.refId}`;

      // 如果已经处理过相同的引用ID和类型，则跳过
      if (processedIds.has(uniqueKey)) {
        continue;
      }

      processedIds.add(uniqueKey);

      switch (doc.refType as IndexType) {
        case "card":
          details = CardTable.getCardById(db, doc.refId);
          break;
        case "article":
          details = ArticleTable.getArticleById(db, doc.refId);
          break;
        case "project-item":
          details = ProjectTable.getProjectItem(db, doc.refId);
          break;
        case "document-item":
          details = DocumentTable.getDocumentItem(db, doc.refId);
          break;
        default:
          break;
      }

      if (details) {
        results.push({
          id: doc.refId,
          type: doc.refType as IndexType,
          // @ts-ignore
          title: details.title || "",
          content: details.content,
          source: "vec-document" as const,
          updateTime: doc.refUpdateTime,
        });
      }
    }

    return results;
  }
}
