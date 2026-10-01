import Database from "better-sqlite3";
import type {
  Excerpt,
  ExcerptAnchor,
  ExcerptInput,
  ExcerptSourceType,
  ExcerptSyncResult,
} from "@/entity/excerpt/types";
import { parseWebPagePayload } from "@/entity/excerpt/web";

interface ExcerptRow {
  id: number;
  source_type: ExcerptSourceType;
  source_key: string;
  source_title: string;
  external_id: string;
  quote: string;
  note: string;
  anchor: string | null;
  color: string | null;
  source_time: number | null;
  create_time: number;
  update_time: number;
  is_deleted: number;
}

const parseAnchor = (raw: string | null): ExcerptAnchor | null => {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as ExcerptAnchor;
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
};

const toExcerpt = (row: ExcerptRow): Excerpt => ({
  id: row.id,
  sourceType: row.source_type,
  sourceKey: row.source_key,
  sourceTitle: row.source_title,
  externalId: row.external_id,
  quote: row.quote,
  note: row.note,
  anchor: parseAnchor(row.anchor),
  color: row.color,
  sourceTime: row.source_time,
  createTime: row.create_time,
  updateTime: row.update_time,
  isDeleted: row.is_deleted === 1,
});

const anchorText = (anchor: ExcerptAnchor | null) => (anchor ? JSON.stringify(anchor) : null);

/**
 * 摘录（主库 excerpt）。一个来源（书 / 网页）整体同步：按 external_id diff，
 * 不在新集合里的软删除、重新出现的复位（KL-032）。
 */
export default class ExcerptTable {
  static upgradeTable(_db: Database.Database) {}

  static getListenEvents() {
    return {
      "excerpt:get-by-ids": this.getByIds.bind(this),
      "excerpt:sync-web-page": this.syncWebPage.bind(this),
    };
  }

  /** 浏览器插件按页发来的划线快照；参数在这里校验（来自无鉴权的 RPC，KL-035） */
  static syncWebPage(db: Database.Database, payload: unknown): ExcerptSyncResult {
    const { url, title, inputs } = parseWebPagePayload(payload);
    return this.syncSource(db, "web", url, title, inputs);
  }

  /** 用一个来源当前的全部摘录覆盖该来源；调用方负责事务（syncSource 自带事务，可嵌套于外层事务） */
  static syncSource(
    db: Database.Database,
    sourceType: ExcerptSourceType,
    sourceKey: string,
    sourceTitle: string,
    inputs: ExcerptInput[]
  ): ExcerptSyncResult {
    const run = db.transaction((): ExcerptSyncResult => {
      const existing = db
        .prepare(`SELECT * FROM excerpt WHERE source_type = ? AND source_key = ?`)
        .all(sourceType, sourceKey) as ExcerptRow[];
      const byExternal = new Map(existing.map(row => [row.external_id, row]));
      const now = Date.now();
      const result: ExcerptSyncResult = { inserted: 0, updated: 0, deleted: 0 };
      const seen = new Set<string>();

      const insert = db.prepare(
        `INSERT INTO excerpt (source_type, source_key, source_title, external_id, quote, note, anchor,
           color, source_time, create_time, update_time, is_deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT(source_type, external_id) DO UPDATE SET
           source_key = excluded.source_key, source_title = excluded.source_title,
           quote = excluded.quote, note = excluded.note, anchor = excluded.anchor,
           color = excluded.color, source_time = excluded.source_time,
           update_time = excluded.update_time, is_deleted = 0`
      );
      const update = db.prepare(
        `UPDATE excerpt SET source_title = ?, quote = ?, note = ?, anchor = ?, color = ?,
           source_time = ?, update_time = ?, is_deleted = 0 WHERE id = ?`
      );

      for (const input of inputs) {
        if (seen.has(input.externalId)) continue;
        seen.add(input.externalId);
        const anchor = anchorText(input.anchor);
        const row = byExternal.get(input.externalId);
        if (!row) {
          // 同一 external_id 可能挂在别的 source_key 下（如 URL 规则变化），由 ON CONFLICT 认领
          insert.run(
            sourceType,
            sourceKey,
            sourceTitle,
            input.externalId,
            input.quote,
            input.note,
            anchor,
            input.color,
            input.sourceTime,
            now,
            now
          );
          result.inserted += 1;
          continue;
        }
        const changed =
          row.is_deleted === 1 ||
          row.source_title !== sourceTitle ||
          row.quote !== input.quote ||
          row.note !== input.note ||
          row.anchor !== anchor ||
          row.color !== input.color ||
          row.source_time !== input.sourceTime;
        if (!changed) continue;
        update.run(
          sourceTitle,
          input.quote,
          input.note,
          anchor,
          input.color,
          input.sourceTime,
          now,
          row.id
        );
        result.updated += 1;
      }

      const softDelete = db.prepare(
        `UPDATE excerpt SET is_deleted = 1, update_time = ? WHERE id = ?`
      );
      for (const row of existing) {
        if (seen.has(row.external_id) || row.is_deleted === 1) continue;
        softDelete.run(now, row.id);
        result.deleted += 1;
      }
      return result;
    });
    return run();
  }

  /** 来源整体消失（如书移出书架）：软删除它的全部摘录，返回条数 */
  static deleteSource(db: Database.Database, sourceType: ExcerptSourceType, sourceKey: string) {
    return db
      .prepare(
        `UPDATE excerpt SET is_deleted = 1, update_time = ?
         WHERE source_type = ? AND source_key = ? AND is_deleted = 0`
      )
      .run(Date.now(), sourceType, sourceKey).changes;
  }

  /** 按 id 读取（含已软删除的），顺序不保证 */
  static getByIds(db: Database.Database, ids: number[]): Excerpt[] {
    if (ids.length === 0) return [];
    const rows = db
      .prepare(`SELECT * FROM excerpt WHERE id IN (${ids.map(() => "?").join(",")})`)
      .all(...ids) as ExcerptRow[];
    return rows.map(toExcerpt);
  }

  static getById(db: Database.Database, id: number): Excerpt | null {
    return this.getByIds(db, [id])[0] ?? null;
  }

  /** 向量 / 全文索引的候选：未删除的全部摘录 */
  static listActive(db: Database.Database): Excerpt[] {
    const rows = db
      .prepare(`SELECT * FROM excerpt WHERE is_deleted = 0 ORDER BY id`)
      .all() as ExcerptRow[];
    return rows.map(toExcerpt);
  }
}
