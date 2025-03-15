import Database from "better-sqlite3";
import nodejieba from "nodejieba";
import { IndexType, SearchResult, IndexParams, SearchParams } from "@/types";
import CardTable from "./card";
import ArticleTable from "./article";
import ProjectTable from "./project";
import DocumentTable from "./document";
import { chunk } from "llm-chunk";

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

// 定义搜索结果类型
export interface PartialSearchResult {
  id: number;
  type: IndexType;
  title?: string;
  source: "fts";
  updateTime: number;
}

class FTSTable {
  // 中文分词处理
  static segmentText(text: string): string {
    if (!text) return "";

    // 使用segmentit进行分词
    const result = nodejieba.cutForSearch(text, true);

    return result.join(" ");
  }

  // 初始化FTS5虚拟表
  static initTable(db: Database.Database) {
    // 检查FTS5表是否存在
    const tableExists = db
      .prepare(
        `
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='content_fts'
    `,
      )
      .get();

    if (!tableExists) {
      // 创建FTS5虚拟表
      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS content_fts USING fts5(
          prefixed_id,
          update_time,
          content,
          type,
          title,
          chunk_index,
          tokenize='porter unicode61'
        )
      `);
    }
  }

  // 升级表结构（如果需要）
  static upgradeTable(_db: Database.Database) {
    // 这里可以添加表结构升级逻辑
  }

  // 索引内容
  static indexContent(db: Database.Database, params: IndexParams) {
    const { id, content, type, title = "", updateTime } = params;

    // 添加类型前缀到ID
    const prefixedId = addTypePrefix(id, type);

    // 先删除可能存在的旧索引
    this.removeIndex(db, prefixedId);

    // 将内容分块，参考vec-document的分块方式
    const chunks = chunk(content, {
      minLength: 500,
      maxLength: 2000,
      overlap: 0,
      splitter: "paragraph",
    });

    try {
      const stmt = db.prepare(`
        INSERT INTO content_fts (prefixed_id, content, type, title, update_time, chunk_index)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      // 对每个分块进行处理并索引
      chunks.forEach((chunkText, index) => {
        // 分词处理
        const segmentedText = this.segmentText(chunkText);

        stmt.run(prefixedId, segmentedText, type, title, updateTime, index);
      });
    } catch (error) {
      console.error("索引内容失败:", error);
      return false;
    }

    return true;
  }

  // 批量索引内容
  static batchIndexContent(db: Database.Database, items: IndexParams[]) {
    try {
      for (const item of items) {
        const { id, content, type, title = "", updateTime } = item;
        // 添加类型前缀到ID
        const prefixedId = addTypePrefix(id, type);

        // 先删除可能存在的旧索引
        this.removeIndex(db, prefixedId);

        // 将内容分块
        const chunks = chunk(content, {
          minLength: 500,
          maxLength: 2000,
          overlap: 0,
          splitter: "paragraph",
        });

        const stmt = db.prepare(`
          INSERT INTO content_fts (prefixed_id, content, type, title, update_time, chunk_index)
          VALUES (?, ?, ?, ?, ?, ?)
        `);

        // 对每个分块进行处理并索引
        chunks.forEach((chunkText, index) => {
          // 分词处理
          const segmentedText = this.segmentText(chunkText);

          stmt.run(prefixedId, segmentedText, type, title, updateTime, index);
        });
      }
    } catch (error) {
      console.error("批量索引失败:", error);
      return false;
    }

    return true;
  }

  // 移除索引
  static removeIndex(db: Database.Database, prefixedId: string) {
    const stmt = db.prepare(`
      DELETE FROM content_fts WHERE prefixed_id = ?
    `);

    stmt.run(prefixedId);

    return true;
  }

  // 根据原始ID和类型移除索引
  static removeIndexByIdAndType(
    db: Database.Database,
    id: number,
    type: IndexType,
  ) {
    const prefixedId = addTypePrefix(id, type);
    return this.removeIndex(db, prefixedId);
  }

  // 检查索引是否存在
  static checkIndexExists(
    db: Database.Database,
    id: number,
    type: IndexType,
  ): boolean {
    const prefixedId = addTypePrefix(id, type);
    const stmt = db.prepare(`
      SELECT prefixed_id FROM content_fts WHERE prefixed_id = ?
    `);

    const result = stmt.get(prefixedId);
    return !!result;
  }

  // 获取所有FTS索引结果
  static getAllFTSResults(
    db: Database.Database,
    type?: IndexType,
  ): SearchResult[] {
    let sql = `
      SELECT prefixed_id, type, title, update_time
      FROM content_fts
    `;

    // 如果指定了类型，添加类型过滤
    if (type) {
      sql += ` WHERE type = ?`;
    }

    // 添加分组，确保每个prefixed_id只返回一次
    sql += ` GROUP BY prefixed_id`;

    const stmt = db.prepare(sql);

    // 获取结果并解析前缀ID
    const results = type ? stmt.all(type) : stmt.all();
    const partialResults: PartialSearchResult[] = results.map((result: any) => {
      const { id, type } = extractIdFromPrefixed(result.prefixed_id);
      return {
        id: Number(id),
        type: type as IndexType,
        title: result.title,
        source: "fts" as const,
        updateTime: result.update_time,
      };
    });

    return this.getSearchResultDetails(db, partialResults);
  }

  // 搜索内容
  static searchContent(
    db: Database.Database,
    searchParams: SearchParams,
  ): SearchResult[] {
    const { query, types = [], limit = 10 } = searchParams;

    if (!query) return [];

    const segmentedQuery = nodejieba
      .cutForSearch(query, true)
      .filter((item) => !!item.trim())
      .join(" OR ");

    let sql = `
      SELECT prefixed_id, type, title, update_time, rank
      FROM content_fts
      WHERE content MATCH ?
    `;

    // 如果指定了类型，添加类型过滤
    if (types && types.length > 0) {
      sql += ` AND type IN (${types.map(() => "?").join(",")}) AND rank < -3`;
    }

    sql += ` ORDER BY rank LIMIT ?`;

    const stmt = db.prepare(sql);

    // 准备参数
    const params = [segmentedQuery];
    if (types && types.length > 0) {
      params.push(...types);
    }
    params.push(String(limit));

    // 获取结果并解析前缀ID
    const results = stmt.all(...params);
    const partialResults: PartialSearchResult[] = results.map((result: any) => {
      const { id, type } = extractIdFromPrefixed(result.prefixed_id);
      return {
        id: Number(id),
        type: type as IndexType,
        title: result.title,
        source: "fts" as const,
        updateTime: result.update_time,
        rank: result.rank,
      };
    });

    return this.getSearchResultDetails(db, partialResults);
  }

  // 获取搜索结果的详细信息
  static getSearchResultDetails(
    db: Database.Database,
    results: PartialSearchResult[],
  ): SearchResult[] {
    const detailedResults = [];
    const processedIds = new Set<string>(); // 用于去重

    for (const result of results) {
      // 创建唯一键，用于去重
      const uniqueKey = `${result.type}:${result.id}`;

      // 如果已经处理过相同的ID和类型，则跳过
      if (processedIds.has(uniqueKey)) {
        continue;
      }

      processedIds.add(uniqueKey);

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
        case "document-item":
          details = DocumentTable.getDocumentItem(db, result.id);
          break;
        default:
          break;
      }

      if (details) {
        detailedResults.push({
          ...result,
          ...details,
          updateTime: result.updateTime,
        });
      }
    }

    return detailedResults;
  }

  static getListenEvents() {
    return {
      "fts-index-content": this.indexContent.bind(this),
      "fts-batch-index-content": this.batchIndexContent.bind(this),
      "fts-remove-index": this.removeIndexByIdAndType.bind(this),
      "fts-search-content": this.searchContent.bind(this),
      "fts-check-index-exists": this.checkIndexExists.bind(this),
      "get-all-fts-results": this.getAllFTSResults.bind(this),
    };
  }
}

export default FTSTable;
