import Database from "better-sqlite3";
import { Jieba } from "@node-rs/jieba";
import { dict } from "@node-rs/jieba/dict";
import { IndexType, SearchResult, IndexParams, SearchParams } from "@/types";
import CardTable from "./card";
import ArticleTable from "./article";
import ProjectTable from "./project";
import DocumentTable from "./document";
import { chunk } from "llm-chunk";

const jieba = Jieba.withDict(dict);

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
  source: "fts";
  updateTime: number;
}

class FTSTable {
  static segmentText(text: string): string {
    if (!text) return "";

    const result = jieba.cutForSearch(text, true);
    return result.join(" ");
  }

  static initTable(db: Database.Database) {
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

  static upgradeTable(_db: Database.Database) {
    // 不需要升级
  }

  // 索引内容
  static indexContent(db: Database.Database, params: IndexParams) {
    const { id, content, type, updateTime } = params;

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
        INSERT INTO content_fts (prefixed_id, content, update_time, type)
        VALUES (?, ?, ?, ?)
      `);

      // 对每个分块进行处理并索引
      chunks.forEach((chunkText) => {
        // 分词处理
        const segmentedText = this.segmentText(chunkText);

        stmt.run(prefixedId, segmentedText, updateTime, type);
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
        const { id, content, type, updateTime } = item;
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
          INSERT INTO content_fts (prefixed_id, content, update_time, type)
          VALUES (?, ?, ?, ?)
        `);

        // 对每个分块进行处理并索引
        chunks.forEach((chunkText) => {
          // 分词处理
          const segmentedText = this.segmentText(chunkText);

          stmt.run(prefixedId, segmentedText, updateTime, type);
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
  ): { updateTime: number } | null {
    const prefixedId = addTypePrefix(id, type);
    const stmt = db.prepare(`
      SELECT update_time FROM content_fts WHERE prefixed_id = ?
    `);

    const result: any = stmt.get(prefixedId);
    if (!result) {
      return null;
    }
    return {
      updateTime: result.update_time,
    };
  }

  // 获取所有FTS索引结果
  static getAllFTSResults(
    db: Database.Database,
    type?: IndexType,
  ): SearchResult[] {
    let sql = `
      SELECT prefixed_id, update_time
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

    const segmentedQuery = jieba
      .cutForSearch(query, true)
      .filter((item) => !!item.trim())
      .join(" OR ");

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
          // @ts-ignore
          title: details.title || "",
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
