/**
 * 正文的 AI 洞见（主库 content_ai_insights）：按 content_id 存一次分析的结果与每条的处理状态。
 *
 * 只由主进程 content-insights 写入；重新分析时保留已处理的（按类型 + 对方 + 原文片段匹配），
 * 「不相关」的不再出现。正文真正删除时由 ContentTable.deleteContent 同事务删除，连库对账清孤儿。
 */

import type Database from "better-sqlite3";
import type {
  ContentInsightsResult,
  InsightAsk,
  InsightMark,
  InsightStatus,
} from "@/types/content-insights";

export const CONTENT_AI_INSIGHTS_SCHEMA_VER = 1;

export interface ContentAiInsightsRow {
  contentId: number;
  schemaVer: number;
  textDigest: string;
  result: ContentInsightsResult;
  model: string;
  createTime: number;
  updateTime: number;
}

interface RawRow {
  content_id: number;
  schema_ver: number;
  text_digest: string;
  result: string;
  model: string;
  create_time: number;
  update_time: number;
}

const EMPTY: ContentInsightsResult = { lead: "", marks: [], asks: [], candidates: 0 };
const STATUSES: ReadonlySet<string> = new Set(["open", "linked", "dismissed"]);

function parseResult(raw: string): ContentInsightsResult {
  try {
    const value = JSON.parse(raw) as Partial<ContentInsightsResult>;
    return {
      lead: typeof value.lead === "string" ? value.lead : "",
      marks: Array.isArray(value.marks) ? value.marks : [],
      asks: Array.isArray(value.asks) ? value.asks : [],
      candidates: Number(value.candidates) || 0,
    };
  } catch {
    return EMPTY;
  }
}

const toRow = (row: RawRow): ContentAiInsightsRow => ({
  contentId: row.content_id,
  schemaVer: row.schema_ver,
  textDigest: row.text_digest,
  result: parseResult(row.result),
  model: row.model,
  createTime: row.create_time,
  updateTime: row.update_time,
});

/** 同一条洞见在两次分析之间的身份：类型 + 对方正文 + 原文片段 */
const markKey = (mark: InsightMark) =>
  `${mark.kind}\u0000${mark.target?.contentId ?? ""}\u0000${mark.anchor}`;

/** 新结果继承旧结果里已处理的状态；旧结果里处理过、新结果没有的不再出现，也不需要保留 */
export function mergeStatuses(
  previous: ContentInsightsResult | null,
  next: ContentInsightsResult
): ContentInsightsResult {
  if (!previous) return next;
  const marks = new Map(previous.marks.map(mark => [markKey(mark), mark.status]));
  const asks = new Map(previous.asks.map(ask => [ask.text, ask.status]));
  return {
    ...next,
    marks: next.marks.map(mark => ({ ...mark, status: marks.get(markKey(mark)) ?? mark.status })),
    asks: next.asks.map(ask => ({ ...ask, status: asks.get(ask.text) ?? ask.status })),
  };
}

export default class ContentAiInsightsTable {
  static get(db: Database.Database, contentId: number): ContentAiInsightsRow | null {
    const row = db
      .prepare(`SELECT * FROM content_ai_insights WHERE content_id = ?`)
      .get(contentId) as RawRow | undefined;
    return row ? toRow(row) : null;
  }

  /** 写入一次分析：继承旧结果里已处理的状态；create_time 只在首次写入时记 */
  static save(
    db: Database.Database,
    input: { contentId: number; textDigest: string; result: ContentInsightsResult; model: string },
    now = Date.now()
  ): ContentAiInsightsRow {
    const merged = mergeStatuses(this.get(db, input.contentId)?.result ?? null, input.result);
    db.prepare(
      `INSERT INTO content_ai_insights (content_id, schema_ver, text_digest, result, model, create_time, update_time)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(content_id) DO UPDATE SET schema_ver = excluded.schema_ver,
         text_digest = excluded.text_digest, result = excluded.result, model = excluded.model,
         update_time = excluded.update_time`
    ).run(
      input.contentId,
      CONTENT_AI_INSIGHTS_SCHEMA_VER,
      input.textDigest,
      JSON.stringify(merged),
      input.model,
      now,
      now
    );
    return this.get(db, input.contentId)!;
  }

  /** 改一条标记或问题的处理状态；找不到返回 false（结果已被重新分析替换） */
  static setStatus(
    db: Database.Database,
    contentId: number,
    itemId: string,
    status: InsightStatus
  ): boolean {
    if (!STATUSES.has(status)) throw new Error(`未知的处理状态：${status}`);
    return db.transaction(() => {
      const row = this.get(db, contentId);
      if (!row) return false;
      let found = false;
      const update = <T extends InsightMark | InsightAsk>(item: T): T => {
        if (item.id !== itemId) return item;
        found = true;
        return { ...item, status };
      };
      const result = {
        ...row.result,
        marks: row.result.marks.map(update),
        asks: row.result.asks.map(update),
      };
      if (!found) return false;
      // 只改状态，不动 update_time：它表示分析时间
      db.prepare(`UPDATE content_ai_insights SET result = ? WHERE content_id = ?`).run(
        JSON.stringify(result),
        contentId
      );
      return true;
    })();
  }

  static delete(db: Database.Database, contentId: number): void {
    db.prepare(`DELETE FROM content_ai_insights WHERE content_id = ?`).run(contentId);
  }

  static removeOrphans(db: Database.Database): number {
    return db
      .prepare(
        `DELETE FROM content_ai_insights
         WHERE NOT EXISTS (SELECT 1 FROM contents c WHERE c.id = content_ai_insights.content_id)`
      )
      .run().changes;
  }
}
