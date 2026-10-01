/**
 * 引用索引：把主库正文里的内联引用解析进索引库 entity_refs。
 *
 * - 增量：reindexContents 处理指定的正文（写入总线触发）；
 * - 对账：reconcileRefs 比较主库 contents.update_time 与 entity_ref_sources，处理新增、变更与已删除，
 *   在数据库连接时执行，兜住迁移、同步下载、移动端写入等不经过总线的路径。
 *
 * 不含 content-link 的正文不解析 JSON（SQL 先过滤），只更新对账状态。
 */

import type Database from "better-sqlite3";
import { extractInlineRefs } from "@/entity/inline-refs";

/** 对账时每批处理的正文数，批间让出事件循环 */
export const RECONCILE_BATCH = 50;

export interface RefIndexResult {
  /** 处理的正文数 */
  processed: number;
  /** 引用有增减的正文数（大于 0 时需通知渲染端） */
  changed: number;
}

interface ContentRow {
  id: number;
  update_time: number;
  /** 只有含 content-link 的正文才取正文 */
  content: string | null;
}

function readContents(mainDb: Database.Database, ids: number[]): Map<number, ContentRow> {
  if (ids.length === 0) return new Map();
  const marks = ids.map(() => "?").join(",");
  const rows = mainDb
    .prepare(
      `SELECT id, update_time,
         CASE WHEN instr(content, '"content-link"') > 0 THEN content END AS content
       FROM contents WHERE id IN (${marks})`
    )
    .all(...ids) as ContentRow[];
  return new Map(rows.map(row => [row.id, row]));
}

const parseContent = (raw: string | null): unknown => {
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
};

/** 重建一批正文的引用（正文已不存在则清除），在索引库的一个事务里完成 */
export function reindexContents(
  mainDb: Database.Database,
  indexDb: Database.Database,
  contentIds: number[]
): RefIndexResult {
  const ids = [...new Set(contentIds.filter(id => Number.isSafeInteger(id) && id > 0))];
  const rows = readContents(mainDb, ids);
  const countRefs = indexDb.prepare(
    `SELECT COUNT(*) AS n FROM entity_refs WHERE src_content_id = ?`
  );
  const deleteRefs = indexDb.prepare(`DELETE FROM entity_refs WHERE src_content_id = ?`);
  const deleteSource = indexDb.prepare(`DELETE FROM entity_ref_sources WHERE content_id = ?`);
  const insertRef = indexDb.prepare(
    `INSERT INTO entity_refs
       (src_content_id, dst_kind, dst_id, dst_content_id, snippet_before, snippet_label, snippet_after)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const upsertSource = indexDb.prepare(
    `INSERT INTO entity_ref_sources (content_id, update_time) VALUES (?, ?)
     ON CONFLICT(content_id) DO UPDATE SET update_time = excluded.update_time`
  );
  let changed = 0;
  indexDb.transaction(() => {
    for (const id of ids) {
      const before = (countRefs.get(id) as { n: number }).n;
      deleteRefs.run(id);
      const row = rows.get(id);
      if (!row) {
        deleteSource.run(id);
        if (before > 0) changed++;
        continue;
      }
      const refs = extractInlineRefs(parseContent(row.content));
      for (const ref of refs) {
        insertRef.run(
          id,
          ref.dst.kind,
          ref.dst.id,
          ref.dstContentId,
          ref.snippet.before,
          ref.snippet.label,
          ref.snippet.after
        );
      }
      upsertSource.run(id, row.update_time);
      if (before > 0 || refs.length > 0) changed++;
    }
  })();
  return { processed: ids.length, changed };
}

/** 主库与索引库不一致的正文：新增或更新过的、以及主库已删除的 */
export function diffSources(mainDb: Database.Database, indexDb: Database.Database): number[] {
  const indexed = new Map(
    (
      indexDb.prepare(`SELECT content_id, update_time FROM entity_ref_sources`).all() as Array<{
        content_id: number;
        update_time: number;
      }>
    ).map(row => [row.content_id, row.update_time])
  );
  const stale: number[] = [];
  const contents = mainDb.prepare(`SELECT id, update_time FROM contents`).all() as Array<{
    id: number;
    update_time: number;
  }>;
  for (const { id, update_time } of contents) {
    if (indexed.get(id) !== update_time) stale.push(id);
    indexed.delete(id);
  }
  // 剩下的只在索引里，主库已删除
  stale.push(...indexed.keys());
  return stale;
}

const yieldToEventLoop = () => new Promise<void>(resolve => setImmediate(resolve));

/** 整库对账；isStale 返回 true（切库或新一轮开始）时中途停止 */
export async function reconcileRefs(
  mainDb: Database.Database,
  indexDb: Database.Database,
  isStale: () => boolean = () => false
): Promise<RefIndexResult & { aborted: boolean }> {
  const stale = diffSources(mainDb, indexDb);
  const total: RefIndexResult = { processed: 0, changed: 0 };
  for (let start = 0; start < stale.length; start += RECONCILE_BATCH) {
    if (isStale()) return { ...total, aborted: true };
    const result = reindexContents(mainDb, indexDb, stale.slice(start, start + RECONCILE_BATCH));
    total.processed += result.processed;
    total.changed += result.changed;
    await yieldToEventLoop();
  }
  return { ...total, aborted: false };
}
