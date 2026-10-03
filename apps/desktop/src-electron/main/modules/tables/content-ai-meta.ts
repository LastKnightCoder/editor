/**
 * 正文的 AI 元信息（主库 content_ai_meta，KL-053）：按 content_id 存一份，共用正文的投影共用。
 *
 * 只由主进程 content-ai-queue 写入；正文真正删除时由 ContentTable.deleteContent 同事务删除，
 * 对账时再清理孤儿行兜底。update_time 是最后一次生成或核对（正文改动未达重算条件）的时间。
 */

import type Database from "better-sqlite3";

/** 元信息写入后的写事件（经 notifyExternalWrite 补发，进脉络写事件白名单），也是渲染端的广播频道 */
export const CONTENT_AI_META_CHANGED_EVENT = "content-ai-meta:changed";

/** 元信息结构版本：加字段时升版本，低版本的行补齐 */
export const CONTENT_AI_META_SCHEMA_VER = 1;

export interface ContentAiMeta {
  /** 卡片精简标题（≤ 24 字） */
  title: string;
  /** 一句话要点（≤ 60 字） */
  summary: string;
  concepts: string[];
  claims: string[];
}

export interface ContentAiMetaRow {
  contentId: number;
  schemaVer: number;
  textDigest: string;
  meta: ContentAiMeta;
  model: string;
  createTime: number;
  updateTime: number;
}

interface RawRow {
  content_id: number;
  schema_ver: number;
  text_digest: string;
  meta: string;
  model: string;
  create_time: number;
  update_time: number;
}

const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim() !== "")
    : [];

/** 解析存储的 JSON；字段缺失或类型不对时取空值，不让一行坏数据拖垮列表 */
export function parseContentAiMeta(raw: string | null | undefined): ContentAiMeta | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Record<keyof ContentAiMeta, unknown>>;
    if (!value || typeof value !== "object") return null;
    return {
      title: typeof value.title === "string" ? value.title.trim() : "",
      summary: typeof value.summary === "string" ? value.summary.trim() : "",
      concepts: strings(value.concepts),
      claims: strings(value.claims),
    };
  } catch {
    return null;
  }
}

const toRow = (row: RawRow): ContentAiMetaRow => ({
  contentId: row.content_id,
  schemaVer: row.schema_ver,
  textDigest: row.text_digest,
  meta: parseContentAiMeta(row.meta) ?? { title: "", summary: "", concepts: [], claims: [] },
  model: row.model,
  createTime: row.create_time,
  updateTime: row.update_time,
});

/** IN 列表每批的正文数，低于 SQLite 变量上限 */
const BATCH = 500;

export default class ContentAiMetaTable {
  static get(db: Database.Database, contentId: number): ContentAiMetaRow | null {
    const row = db.prepare(`SELECT * FROM content_ai_meta WHERE content_id = ?`).get(contentId) as
      RawRow | undefined;
    return row ? toRow(row) : null;
  }

  /** 一批正文的元信息（缺的不在结果里） */
  static getMany(db: Database.Database, contentIds: number[]): Map<number, ContentAiMetaRow> {
    const result = new Map<number, ContentAiMetaRow>();
    const ids = [...new Set(contentIds.filter(id => Number.isSafeInteger(id) && id > 0))];
    for (let start = 0; start < ids.length; start += BATCH) {
      const batch = ids.slice(start, start + BATCH);
      const rows = db
        .prepare(
          `SELECT * FROM content_ai_meta WHERE content_id IN (${batch.map(() => "?").join(",")})`
        )
        .all(...batch) as RawRow[];
      for (const row of rows) result.set(row.content_id, toRow(row));
    }
    return result;
  }

  /** 生成或重算后写入；create_time 只在首次写入时记 */
  static upsert(
    db: Database.Database,
    input: { contentId: number; textDigest: string; meta: ContentAiMeta; model: string },
    now = Date.now()
  ): void {
    db.prepare(
      `INSERT INTO content_ai_meta (content_id, schema_ver, text_digest, meta, model, create_time, update_time)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(content_id) DO UPDATE SET schema_ver = excluded.schema_ver,
         text_digest = excluded.text_digest, meta = excluded.meta, model = excluded.model,
         update_time = excluded.update_time`
    ).run(
      input.contentId,
      CONTENT_AI_META_SCHEMA_VER,
      input.textDigest,
      JSON.stringify(input.meta),
      input.model,
      now,
      now
    );
  }

  /** 正文改动没到重算条件：只记核对时间，指纹仍是生成时的，避免小改累积后永不重算 */
  static touch(db: Database.Database, contentId: number, now = Date.now()): void {
    db.prepare(`UPDATE content_ai_meta SET update_time = ? WHERE content_id = ?`).run(
      now,
      contentId
    );
  }

  static delete(db: Database.Database, contentId: number): void {
    db.prepare(`DELETE FROM content_ai_meta WHERE content_id = ?`).run(contentId);
  }

  /** 正文已不存在的行（迁移、移动端或 CLI 删正文时不经 deleteContent） */
  static removeOrphans(db: Database.Database): number {
    return db
      .prepare(
        `DELETE FROM content_ai_meta
         WHERE NOT EXISTS (SELECT 1 FROM contents c WHERE c.id = content_ai_meta.content_id)`
      )
      .run().changes;
  }
}
