/**
 * 白板引用索引：把主库白板页画布里用到的笔记解析进索引库 whiteboard_refs。
 *
 * 白板画布不经过正文写入总线（它存在 white_board_contents.data），因此不按页增量，
 * 统一走对账：比较主库 white_board_contents.update_time 与 whiteboard_ref_sources，
 * 只重解析变化的页。连接数据库时执行一次，白板写事件后防抖再执行。
 */

import type Database from "better-sqlite3";
import { extractWhiteboardRefs } from "@/entity/whiteboard-refs";
import { RECONCILE_BATCH, type RefIndexResult } from "./ref-indexer";

interface PageRow {
  id: number;
  update_time: number;
  data: string | null;
}

const refsSignature = (rows: Array<{ dst_kind: string; dst_id: number; via: string }>) =>
  rows
    .map(row => `${row.dst_kind}:${row.dst_id}:${row.via}`)
    .sort()
    .join("|");

/** 重建一批白板页的引用（页已不存在则清除），在索引库的一个事务里完成 */
export function reindexWhiteboardPages(
  mainDb: Database.Database,
  indexDb: Database.Database,
  pageIds: number[]
): RefIndexResult {
  const ids = [...new Set(pageIds.filter(id => Number.isSafeInteger(id) && id > 0))];
  if (ids.length === 0) return { processed: 0, changed: 0 };
  const marks = ids.map(() => "?").join(",");
  const pages = new Map(
    (
      mainDb
        .prepare(`SELECT id, update_time, data FROM white_board_contents WHERE id IN (${marks})`)
        .all(...ids) as PageRow[]
    ).map(row => [row.id, row])
  );
  const refsOf = indexDb.prepare(
    `SELECT dst_kind, dst_id, via FROM whiteboard_refs WHERE page_id = ?`
  );
  const deleteRefs = indexDb.prepare(`DELETE FROM whiteboard_refs WHERE page_id = ?`);
  const insertRef = indexDb.prepare(
    `INSERT OR IGNORE INTO whiteboard_refs (page_id, dst_kind, dst_id, via) VALUES (?, ?, ?, ?)`
  );
  const deleteSource = indexDb.prepare(`DELETE FROM whiteboard_ref_sources WHERE page_id = ?`);
  const upsertSource = indexDb.prepare(
    `INSERT INTO whiteboard_ref_sources (page_id, update_time) VALUES (?, ?)
     ON CONFLICT(page_id) DO UPDATE SET update_time = excluded.update_time`
  );
  let changed = 0;
  indexDb.transaction(() => {
    for (const id of ids) {
      const before = refsSignature(
        refsOf.all(id) as Array<{ dst_kind: string; dst_id: number; via: string }>
      );
      deleteRefs.run(id);
      const page = pages.get(id);
      if (!page) {
        deleteSource.run(id);
        if (before) changed++;
        continue;
      }
      const refs = extractWhiteboardRefs(page.data);
      for (const ref of refs) insertRef.run(id, ref.dstKind, ref.dstId, ref.via);
      upsertSource.run(id, page.update_time);
      const after = refsSignature(
        refs.map(ref => ({ dst_kind: ref.dstKind, dst_id: ref.dstId, via: ref.via }))
      );
      if (before !== after) changed++;
    }
  })();
  return { processed: ids.length, changed };
}

/** 主库与索引库不一致的白板页：新增或更新过的、以及主库已删除的 */
export function diffWhiteboardSources(
  mainDb: Database.Database,
  indexDb: Database.Database
): number[] {
  const indexed = new Map(
    (
      indexDb.prepare(`SELECT page_id, update_time FROM whiteboard_ref_sources`).all() as Array<{
        page_id: number;
        update_time: number;
      }>
    ).map(row => [row.page_id, row.update_time])
  );
  const stale: number[] = [];
  const pages = mainDb.prepare(`SELECT id, update_time FROM white_board_contents`).all() as Array<{
    id: number;
    update_time: number;
  }>;
  for (const { id, update_time } of pages) {
    if (indexed.get(id) !== update_time) stale.push(id);
    indexed.delete(id);
  }
  stale.push(...indexed.keys());
  return stale;
}

/**
 * 解析口径的版本：extractWhiteboardRefs 的规则变化（如新增认识的元素类型）时加一，
 * 下次对账清空对账状态、全量重解析。按 update_time 对账发现不了「规则变了但画布没变」的页。
 */
export const WHITEBOARD_REF_VERSION = "2";
const WHITEBOARD_REF_VERSION_KEY = "whiteboard-refs:version";

function ensureIndexVersion(indexDb: Database.Database) {
  const current = indexDb
    .prepare(`SELECT value FROM index_meta WHERE key = ?`)
    .get(WHITEBOARD_REF_VERSION_KEY) as { value: string } | undefined;
  if (current?.value === WHITEBOARD_REF_VERSION) return;
  indexDb.transaction(() => {
    indexDb.prepare(`DELETE FROM whiteboard_ref_sources`).run();
    indexDb
      .prepare(
        `INSERT INTO index_meta (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      )
      .run(WHITEBOARD_REF_VERSION_KEY, WHITEBOARD_REF_VERSION, Date.now());
  })();
}

const yieldToEventLoop = () => new Promise<void>(resolve => setImmediate(resolve));

/** 白板整库对账；isStale 返回 true（切库或新一轮开始）时中途停止 */
export async function reconcileWhiteboardRefs(
  mainDb: Database.Database,
  indexDb: Database.Database,
  isStale: () => boolean = () => false
): Promise<RefIndexResult & { aborted: boolean }> {
  ensureIndexVersion(indexDb);
  const stale = diffWhiteboardSources(mainDb, indexDb);
  const total: RefIndexResult = { processed: 0, changed: 0 };
  for (let start = 0; start < stale.length; start += RECONCILE_BATCH) {
    if (isStale()) return { ...total, aborted: true };
    const result = reindexWhiteboardPages(
      mainDb,
      indexDb,
      stale.slice(start, start + RECONCILE_BATCH)
    );
    total.processed += result.processed;
    total.changed += result.changed;
    await yieldToEventLoop();
  }
  return { ...total, aborted: false };
}
