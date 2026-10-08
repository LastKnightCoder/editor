/**
 * 文档待办索引：把主库正文里的勾选项解析进索引库 doc_tasks。
 *
 * - 增量：reindexDocTasks 处理指定的正文（正文写入总线触发）；
 * - 对账：reconcileDocTasks 比较 contents.update_time 与 doc_task_sources，兜住同步下载、
 *   移动端写入等不经过总线的路径；
 * - 缺 taskId 的勾选项（Markdown 导入、AI / MCP 写入）静默补 id 后再解析。
 *
 * 只依赖内容层（ContentTable.patchNodes）写正文，不感知协作。
 */

import type Database from "better-sqlite3";
import {
  extractDocTasks,
  isAbsoluteDateHint,
  parseDocTaskText,
  resolveDocTaskDue,
  type DocTaskGroup,
} from "@/entity/doc-tasks";
import ContentTable from "../tables/content";

export const RECONCILE_BATCH = 50;

export interface DocTaskIndexResult {
  processed: number;
  /** 勾选项有变化的正文数（大于 0 时需通知渲染端） */
  changed: number;
}

interface ContentRow {
  id: number;
  update_time: number;
  /** 只有含勾选项的正文才取正文 */
  content: string | null;
}

interface StoredTask {
  task_id: string;
  title: string;
  text: string;
  checked: number;
  depth: number;
  parent_task_id: string | null;
  sort_index: number;
  group_id: number | null;
  date_hint: string | null;
  date_anchor: number | null;
  due_at: number | null;
}

export function listTaskGroups(mainDb: Database.Database): DocTaskGroup[] {
  return mainDb
    .prepare(`SELECT id, title FROM todo_group WHERE is_archived = 0 AND is_system = 0`)
    .all() as DocTaskGroup[];
}

function readContents(mainDb: Database.Database, ids: number[]): Map<number, ContentRow> {
  if (ids.length === 0) return new Map();
  const marks = ids.map(() => "?").join(",");
  const rows = mainDb
    .prepare(
      `SELECT id, update_time,
         CASE WHEN instr(content, '"check-list-item"') > 0 THEN content END AS content
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

/** 为缺 taskId 或重复的勾选项补 id（静默写回，不算编辑）；返回补上的个数 */
export function backfillTaskIds(mainDb: Database.Database, contentId: number): number {
  const seen = new Set<string>();
  return ContentTable.patchNodes(
    mainDb,
    contentId,
    node => {
      if (node.type !== "check-list-item") return null;
      const id = typeof node.taskId === "string" ? node.taskId : "";
      if (id && !seen.has(id)) {
        seen.add(id);
        return null;
      }
      const next = crypto.randomUUID();
      seen.add(next);
      return { taskId: next };
    },
    { silent: true }
  );
}

const sameTask = (a: StoredTask, b: StoredTask) =>
  a.title === b.title &&
  a.text === b.text &&
  a.checked === b.checked &&
  a.depth === b.depth &&
  a.parent_task_id === b.parent_task_id &&
  a.sort_index === b.sort_index &&
  a.group_id === b.group_id &&
  a.due_at === b.due_at;

/** 重建一批正文的勾选项（正文已不存在或已没有勾选项则清除），在索引库的一个事务里完成 */
export function reindexDocTasks(
  mainDb: Database.Database,
  indexDb: Database.Database,
  contentIds: number[],
  now: number = Date.now()
): DocTaskIndexResult {
  const ids = [...new Set(contentIds.filter(id => Number.isSafeInteger(id) && id > 0))];
  let rows = readContents(mainDb, ids);
  const groups = listTaskGroups(mainDb);

  // 先在主库补 id（不能放进索引库事务里），补过的重读
  const backfilled = ids.filter(id => {
    const row = rows.get(id);
    if (!row?.content) return false;
    return extractDocTasks(parseContent(row.content), groups).missingIds > 0
      ? backfillTaskIds(mainDb, id) > 0
      : false;
  });
  if (backfilled.length) {
    const fresh = readContents(mainDb, backfilled);
    rows = new Map([...rows, ...fresh]);
  }

  const storedOf = indexDb.prepare(`SELECT * FROM doc_tasks WHERE content_id = ?`);
  const deleteTasks = indexDb.prepare(`DELETE FROM doc_tasks WHERE content_id = ?`);
  const deleteSource = indexDb.prepare(`DELETE FROM doc_task_sources WHERE content_id = ?`);
  const insertTask = indexDb.prepare(
    `INSERT INTO doc_tasks
       (content_id, task_id, title, text, checked, depth, parent_task_id, sort_index,
        group_id, group_token, date_hint, date_anchor, due_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const upsertSource = indexDb.prepare(
    `INSERT INTO doc_task_sources (content_id, update_time) VALUES (?, ?)
     ON CONFLICT(content_id) DO UPDATE SET update_time = excluded.update_time`
  );

  let changed = 0;
  indexDb.transaction(() => {
    for (const id of ids) {
      const before = new Map((storedOf.all(id) as StoredTask[]).map(task => [task.task_id, task]));
      deleteTasks.run(id);
      const row = rows.get(id);
      if (!row) {
        deleteSource.run(id);
        if (before.size) changed++;
        continue;
      }
      const { tasks } = extractDocTasks(parseContent(row.content), groups, new Date(now));
      let differs = tasks.length !== before.size;
      for (const task of tasks) {
        const prev = before.get(task.taskId);
        // 相对日期沿用上次的锚点，只有日期原文变化（或新出现）才以此刻为锚
        const anchor =
          task.dateHint && !isAbsoluteDateHint(task.dateHint)
            ? prev && prev.date_hint === task.dateHint && prev.date_anchor
              ? prev.date_anchor
              : now
            : null;
        const next: StoredTask = {
          task_id: task.taskId,
          title: task.title,
          text: task.text,
          checked: task.checked ? 1 : 0,
          depth: task.depth,
          parent_task_id: task.parentTaskId,
          sort_index: task.order,
          group_id: task.groupId,
          date_hint: task.dateHint,
          date_anchor: anchor,
          due_at: resolveDocTaskDue(task.dateHint, anchor ?? now),
        };
        if (!prev || !sameTask(prev, next)) differs = true;
        insertTask.run(
          id,
          next.task_id,
          next.title,
          next.text,
          next.checked,
          next.depth,
          next.parent_task_id,
          next.sort_index,
          next.group_id,
          task.groupToken,
          next.date_hint,
          next.date_anchor,
          next.due_at
        );
      }
      upsertSource.run(id, row.update_time);
      if (differs) changed++;
    }
  })();
  return { processed: ids.length, changed };
}

/**
 * 项目增删改名后按已存原文重算项目归属（不读正文）；返回归属有变化的条数。
 * skipGroups：刚改名、正文正在改写的项目，其条目留给正文写入后的增量重建。
 */
export function regroupDocTasks(
  mainDb: Database.Database,
  indexDb: Database.Database,
  skipGroups: ReadonlySet<number> = new Set()
): number {
  const groups = listTaskGroups(mainDb);
  const rows = indexDb
    .prepare(`SELECT content_id, task_id, text, group_id, title FROM doc_tasks`)
    .all() as Array<{
    content_id: number;
    task_id: string;
    text: string;
    group_id: number | null;
    title: string;
  }>;
  const update = indexDb.prepare(
    `UPDATE doc_tasks SET group_id = ?, group_token = ?, title = ? WHERE content_id = ? AND task_id = ?`
  );
  let changed = 0;
  indexDb.transaction(() => {
    for (const row of rows) {
      if (row.group_id != null && skipGroups.has(row.group_id)) continue;
      const parsed = parseDocTaskText(row.text, groups);
      if (parsed.groupId === row.group_id && parsed.title === row.title) continue;
      update.run(parsed.groupId, parsed.groupToken, parsed.title, row.content_id, row.task_id);
      changed++;
    }
  })();
  return changed;
}

/** 主库与索引库不一致的正文：新增或更新过的、以及主库已删除的 */
export function diffDocTaskSources(
  mainDb: Database.Database,
  indexDb: Database.Database
): number[] {
  const indexed = new Map(
    (
      indexDb.prepare(`SELECT content_id, update_time FROM doc_task_sources`).all() as Array<{
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
  stale.push(...indexed.keys());
  return stale;
}

const yieldToEventLoop = () => new Promise<void>(resolve => setImmediate(resolve));

/** 整库对账；isStale 返回 true（切库或新一轮开始）时中途停止 */
export async function reconcileDocTasks(
  mainDb: Database.Database,
  indexDb: Database.Database,
  isStale: () => boolean = () => false
): Promise<DocTaskIndexResult & { aborted: boolean }> {
  const stale = diffDocTaskSources(mainDb, indexDb);
  const total: DocTaskIndexResult = { processed: 0, changed: 0 };
  for (let start = 0; start < stale.length; start += RECONCILE_BATCH) {
    if (isStale()) return { ...total, aborted: true };
    const result = reindexDocTasks(mainDb, indexDb, stale.slice(start, start + RECONCILE_BATCH));
    total.processed += result.processed;
    total.changed += result.changed;
    await yieldToEventLoop();
  }
  return { ...total, aborted: false };
}
