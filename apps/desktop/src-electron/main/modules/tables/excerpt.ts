import Database from "better-sqlite3";
import {
  WEB_EXCERPT_SOURCE,
  type Excerpt,
  type ExcerptAnchor,
  type ExcerptInput,
  type ExcerptSourceSummary,
  type ExcerptSyncResult,
} from "@/entity/excerpt/types";
import { parseWebPagePayload } from "@/entity/excerpt/web";
import {
  assertProviderSourceType,
  canonicalAnchor,
  parseProviderChange,
  parseProviderItems,
  parseProviderLabel,
  parseProviderSource,
} from "@/entity/excerpt/provider";

interface ExcerptRow {
  id: number;
  source_type: string;
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
  location: string;
  url: string | null;
}

const parseAnchor = (raw: string | null): ExcerptAnchor | null => {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as ExcerptAnchor)
      : null;
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
  location: row.location,
  url: row.url,
  anchor: parseAnchor(row.anchor),
  color: row.color,
  sourceTime: row.source_time,
  createTime: row.create_time,
  updateTime: row.update_time,
  isDeleted: row.is_deleted === 1,
});

/** 微信读书保存 / 删书后摘录有变化时补发的写事件（微信读书走自有 IPC，不经 eventAndHandlers） */
export const WEREAD_EXCERPTS_CHANGED_EVENT = "weread:excerpts-changed";

/** 摘录写入事件：索引编排与脉络刷新只订阅这一份清单 */
export const EXCERPT_WRITE_EVENTS = [
  "excerpt:sync-web-page",
  "excerpt:register-provider",
  "excerpt:replace",
  "excerpt:patch",
  WEREAD_EXCERPTS_CHANGED_EVENT,
] as const;

const rowChanged = (row: ExcerptRow, title: string, input: ExcerptInput) =>
  row.is_deleted === 1 ||
  row.source_title !== title ||
  row.quote !== input.quote ||
  row.note !== input.note ||
  row.location !== input.location ||
  row.url !== input.url ||
  canonicalAnchor(parseAnchor(row.anchor)) !== canonicalAnchor(input.anchor) ||
  row.color !== input.color ||
  row.source_time !== input.sourceTime;

/**
 * 摘录（主库 excerpt）。写入以来源为单位：快照按 external_id diff，不在新集合里的软删除、重新出现的复位（KL-032）；
 * 增量只改给出的条目。插件经 excerpt:* 事件写入，来源类型由宿主取插件 ID。
 */
export default class ExcerptTable {
  static getListenEvents() {
    return {
      "excerpt:get-by-ids": this.getByIds.bind(this),
      "excerpt:find-by-external": this.findByExternal.bind(this),
      "excerpt:sync-web-page": this.syncWebPage.bind(this),
      "excerpt:register-provider": this.registerProvider.bind(this),
      "excerpt:replace": this.replaceFromProvider.bind(this),
      "excerpt:patch": this.patchFromProvider.bind(this),
      "excerpt:sources": this.listSourcesOfProvider.bind(this),
      "excerpt:items": this.listItemsOfProvider.bind(this),
    };
  }

  /** 按外部 id 找摘录（含软删除的）；按候选顺序返回第一个命中的 */
  static findByExternal(
    db: Database.Database,
    sourceType: string,
    externalIds: string[]
  ): Excerpt | null {
    const lookup = db.prepare(`SELECT * FROM excerpt WHERE source_type = ? AND external_id = ?`);
    for (const externalId of externalIds) {
      const row = lookup.get(sourceType, externalId) as ExcerptRow | undefined;
      if (row) return toExcerpt(row);
    }
    return null;
  }

  /** 浏览器插件按页发来的划线快照；参数在这里校验（来自无鉴权的 RPC，KL-035） */
  static syncWebPage(db: Database.Database, payload: unknown): ExcerptSyncResult {
    const { url, title, inputs } = parseWebPagePayload(payload);
    return this.syncSource(db, WEB_EXCERPT_SOURCE, url, title, inputs);
  }

  /** 登记提供方名称；名称只增改不删，插件卸载后仍用于展示 */
  static registerProvider(db: Database.Database, sourceType: unknown, label: unknown): void {
    assertProviderSourceType(sourceType);
    const name = parseProviderLabel(label);
    db.prepare(
      `INSERT INTO excerpt_provider (source_type, label, update_time) VALUES (?, ?, ?)
       ON CONFLICT(source_type) DO UPDATE SET label = excluded.label, update_time = excluded.update_time
       WHERE excerpt_provider.label != excluded.label`
    ).run(sourceType, name, Date.now());
  }

  static replaceFromProvider(
    db: Database.Database,
    sourceType: unknown,
    rawSource: unknown,
    rawItems: unknown
  ): ExcerptSyncResult {
    assertProviderSourceType(sourceType);
    const source = parseProviderSource(rawSource);
    return this.syncSource(
      db,
      sourceType,
      source.key,
      source.title,
      parseProviderItems(rawItems, source)
    );
  }

  static patchFromProvider(
    db: Database.Database,
    sourceType: unknown,
    rawSource: unknown,
    rawChange: unknown
  ): ExcerptSyncResult {
    assertProviderSourceType(sourceType);
    const source = parseProviderSource(rawSource);
    const { upsert, remove } = parseProviderChange(rawChange, source);
    return this.patchSource(db, sourceType, source.key, source.title, upsert, remove);
  }

  static listSourcesOfProvider(db: Database.Database, sourceType: unknown): ExcerptSourceSummary[] {
    assertProviderSourceType(sourceType);
    return db
      .prepare(
        `SELECT source_key AS key, MAX(source_title) AS title,
           SUM(CASE WHEN is_deleted = 0 THEN 1 ELSE 0 END) AS count
         FROM excerpt WHERE source_type = ? GROUP BY source_key ORDER BY source_key`
      )
      .all(sourceType) as ExcerptSourceSummary[];
  }

  static listItemsOfProvider(
    db: Database.Database,
    sourceType: unknown,
    sourceKey: unknown
  ): Excerpt[] {
    assertProviderSourceType(sourceType);
    if (typeof sourceKey !== "string" || !sourceKey) throw new Error("摘录来源无效");
    const rows = db
      .prepare(`SELECT * FROM excerpt WHERE source_type = ? AND source_key = ? ORDER BY id`)
      .all(sourceType, sourceKey) as ExcerptRow[];
    return rows.map(toExcerpt);
  }

  /** 用一个来源当前的全部摘录覆盖该来源；调用方负责事务（syncSource 自带事务，可嵌套于外层事务） */
  static syncSource(
    db: Database.Database,
    sourceType: string,
    sourceKey: string,
    sourceTitle: string,
    inputs: ExcerptInput[]
  ): ExcerptSyncResult {
    return db.transaction((): ExcerptSyncResult => {
      const existing = this.rowsOfSource(db, sourceType, sourceKey);
      const result = this.upsertRows(db, sourceType, sourceKey, sourceTitle, inputs, existing);
      const seen = new Set(inputs.map(input => input.externalId));
      const now = Date.now();
      const softDelete = db.prepare(
        `UPDATE excerpt SET is_deleted = 1, update_time = ? WHERE id = ?`
      );
      for (const row of existing) {
        if (seen.has(row.external_id) || row.is_deleted === 1) continue;
        softDelete.run(now, row.id);
        result.deleted += 1;
      }
      return result;
    })();
  }

  /** 增量：增改给出的条目、软删除指定外部 id；来源标题变化时同步到该来源的其余条目 */
  static patchSource(
    db: Database.Database,
    sourceType: string,
    sourceKey: string,
    sourceTitle: string,
    upsert: ExcerptInput[],
    remove: string[]
  ): ExcerptSyncResult {
    return db.transaction((): ExcerptSyncResult => {
      const existing = this.rowsOfSource(db, sourceType, sourceKey);
      const result = this.upsertRows(db, sourceType, sourceKey, sourceTitle, upsert, existing);
      const now = Date.now();
      const touched = new Set(upsert.map(input => input.externalId));
      const removed = new Set(remove);
      const retitle = db.prepare(
        `UPDATE excerpt SET source_title = ?, update_time = ? WHERE id = ?`
      );
      for (const row of existing) {
        if (touched.has(row.external_id) || row.source_title === sourceTitle) continue;
        retitle.run(sourceTitle, now, row.id);
        if (row.is_deleted === 0 && !removed.has(row.external_id)) result.updated += 1;
      }
      const softDelete = db.prepare(
        `UPDATE excerpt SET is_deleted = 1, update_time = ?
         WHERE source_type = ? AND source_key = ? AND external_id = ? AND is_deleted = 0`
      );
      for (const externalId of remove) {
        result.deleted += softDelete.run(now, sourceType, sourceKey, externalId).changes;
      }
      return result;
    })();
  }

  private static rowsOfSource(db: Database.Database, sourceType: string, sourceKey: string) {
    return db
      .prepare(`SELECT * FROM excerpt WHERE source_type = ? AND source_key = ?`)
      .all(sourceType, sourceKey) as ExcerptRow[];
  }

  private static upsertRows(
    db: Database.Database,
    sourceType: string,
    sourceKey: string,
    sourceTitle: string,
    inputs: ExcerptInput[],
    existing: ExcerptRow[]
  ): ExcerptSyncResult {
    const byExternal = new Map(existing.map(row => [row.external_id, row]));
    const now = Date.now();
    const result: ExcerptSyncResult = { inserted: 0, updated: 0, deleted: 0 };
    const seen = new Set<string>();
    const insert = db.prepare(
      `INSERT INTO excerpt (source_type, source_key, source_title, external_id, quote, note, location,
         url, anchor, color, source_time, create_time, update_time, is_deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT(source_type, external_id) DO UPDATE SET
         source_key = excluded.source_key, source_title = excluded.source_title,
         quote = excluded.quote, note = excluded.note, location = excluded.location,
         url = excluded.url, anchor = excluded.anchor, color = excluded.color,
         source_time = excluded.source_time, update_time = excluded.update_time, is_deleted = 0`
    );
    const update = db.prepare(
      `UPDATE excerpt SET source_title = ?, quote = ?, note = ?, location = ?, url = ?, anchor = ?,
         color = ?, source_time = ?, update_time = ?, is_deleted = 0 WHERE id = ?`
    );
    for (const input of inputs) {
      if (seen.has(input.externalId)) continue;
      seen.add(input.externalId);
      const anchor = canonicalAnchor(input.anchor);
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
          input.location,
          input.url,
          anchor,
          input.color,
          input.sourceTime,
          now,
          now
        );
        result.inserted += 1;
        continue;
      }
      if (!rowChanged(row, sourceTitle, input)) continue;
      update.run(
        sourceTitle,
        input.quote,
        input.note,
        input.location,
        input.url,
        anchor,
        input.color,
        input.sourceTime,
        now,
        row.id
      );
      result.updated += 1;
    }
    return result;
  }

  /** 来源整体消失（如书移出书架）：软删除它的全部摘录，返回条数 */
  static deleteSource(db: Database.Database, sourceType: string, sourceKey: string) {
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

  /** 提供方名称；未登记的回落为来源类型本身 */
  static providerLabels(db: Database.Database): Map<string, string> {
    const rows = db.prepare(`SELECT source_type, label FROM excerpt_provider`).all() as {
      source_type: string;
      label: string;
    }[];
    return new Map(rows.map(row => [row.source_type, row.label]));
  }
}
