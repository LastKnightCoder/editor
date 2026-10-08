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
  type DocTaskGroupBinding,
  formatDocTaskDate,
  docTaskTokenSpans,
} from "@/entity/doc-tasks";
import { minimalTextEdit } from "@/entity/text-edits";
import ContentTable from "../tables/content";
import { listTaskGroups, rememberGroupNames, rewriteGroupAliases } from "./group-names";
export { listTaskGroups } from "./group-names";

export const RECONCILE_BATCH = 50;

export interface DocTaskIndexResult {
  processed: number;
  /** 勾选项有变化的正文数（大于 0 时需通知渲染端） */
  changed: number;
  pending?: number[];
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
  return ContentTable.ensureTaskIds(mainDb, contentId);
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
  rememberGroupNames(mainDb);
  const groups = listTaskGroups(mainDb);
  let rows = readContents(mainDb, ids);
  const pendingRenames = new Set<number>();

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

  for (const id of ids) {
    const row = rows.get(id);
    if (!row?.content) continue;
    const previous = new Map(
      (
        indexDb
          .prepare(
            `SELECT task_id, date_hint, date_anchor, group_id, group_token FROM doc_tasks WHERE content_id = ?`
          )
          .all(id) as Array<{
          task_id: string;
          date_hint: string | null;
          date_anchor: number | null;
          group_id: number | null;
          group_token: string | null;
        }>
      ).map(task => [task.task_id, task])
    );
    try {
      ContentTable.patchNodes(
        mainDb,
        id,
        (node, context) => {
          if (node.type !== "check-list-item") return null;
          const prev = previous.get(String(node.taskId));
          const existing = node.taskGroup as DocTaskGroupBinding | undefined;
          const previousGroup =
            prev?.group_id != null ? groups.find(group => group.id === prev.group_id) : undefined;
          const binding =
            existing ??
            (previousGroup && prev?.group_token
              ? {
                  id: previousGroup.id,
                  token: prev.group_token,
                  createdAt: previousGroup.createdAt,
                }
              : undefined);
          const parsed = parseDocTaskText(context.firstText, groups, new Date(now), binding);
          const group = groups.find(candidate => candidate.id === parsed.groupId);
          const nextGroup =
            group && parsed.groupToken
              ? { id: group.id, token: parsed.groupToken, createdAt: group.createdAt }
              : null;
          const patch: Record<string, unknown> = {};
          if (JSON.stringify(node.taskGroup ?? null) !== JSON.stringify(nextGroup))
            patch.taskGroup = nextGroup;
          const hint = parsed.dateHint;
          if (!hint || isAbsoluteDateHint(hint)) {
            if (node.taskDateAnchor) patch.taskDateAnchor = null;
            return Object.keys(patch).length ? patch : null;
          }
          const anchor = node.taskDateAnchor as
            { hint?: string; at?: number; date?: string } | undefined;
          const anchored =
            anchor?.hint === hint && typeof anchor.at === "number" && Number.isFinite(anchor.at);
          if (!(anchored && anchor.date && resolveDocTaskDue(anchor.date, now) != null)) {
            const at = anchored
              ? anchor.at!
              : prev?.date_hint === hint && prev.date_anchor != null
                ? prev.date_anchor
                : now;
            const due = resolveDocTaskDue(hint, at);
            if (due != null) patch.taskDateAnchor = { hint, at, date: formatDocTaskDate(due) };
          }
          return Object.keys(patch).length ? patch : null;
        },
        {
          canonical: true,
          paragraph: (text, parent, index) => {
            if (parent.type !== "check-list-item" || index !== 0) return [];
            const anchor = parent.taskDateAnchor as { hint: string; date: string } | undefined;
            if (!anchor?.date) return [];
            const span = docTaskTokenSpans(
              text,
              groups,
              new Date(now),
              parent.taskGroup as DocTaskGroupBinding | undefined
            ).find(
              token =>
                token.kind === "date" &&
                token.hint === anchor.hint &&
                !isAbsoluteDateHint(token.hint)
            );
            const edit = span
              ? minimalTextEdit(text.slice(span.start, span.end), anchor.date)
              : null;
            return edit && span ? [{ ...edit, index: span.start + edit.index }] : [];
          },
        }
      );
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !/COLLABORATION_WRITE_REQUIRED|CONTENT_SESSION_LOCKED/.test(error.message)
      )
        throw error;
    }
    rewriteGroupAliases(mainDb, [id], groups).forEach(contentId => pendingRenames.add(contentId));
    const current = ContentTable.getContentById(mainDb, id);
    if (current)
      rows.set(id, {
        id,
        update_time: current.updateTime,
        content: JSON.stringify(current.content),
      });
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
  const pending: number[] = [];
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
            ? (task.dateAnchor ?? (prev?.date_hint === task.dateHint ? prev.date_anchor : null))
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
          due_at: task.dueAt ?? (anchor != null ? resolveDocTaskDue(task.dateHint, anchor) : null),
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
      if (
        pendingRenames.has(id) ||
        extractDocTasks(parseContent(row.content), groups).missingIds > 0 ||
        tasks.some(task => task.dateHint && !isAbsoluteDateHint(task.dateHint))
      ) {
        pending.push(id);
        deleteSource.run(id);
      } else upsertSource.run(id, row.update_time);
      if (differs) changed++;
    }
  })();
  return { processed: ids.length, changed, ...(pending.length ? { pending } : {}) };
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
  const version = indexDb
    .prepare(`SELECT value FROM index_meta WHERE key = 'doc_tasks_version'`)
    .get() as { value: string } | undefined;
  const contents = mainDb.prepare(`SELECT id, update_time FROM contents`).all() as Array<{
    id: number;
    update_time: number;
  }>;
  for (const { id, update_time } of contents) {
    if (version?.value !== "2" || indexed.get(id) !== update_time) stale.push(id);
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
  isStale: () => boolean = () => false,
  onError: (contentId: number, error: unknown) => void = (contentId, error) =>
    console.error("文档待办对账失败", contentId, error),
  onPending: (contentId: number) => void = () => undefined
): Promise<DocTaskIndexResult & { aborted: boolean }> {
  const stale = diffDocTaskSources(mainDb, indexDb);
  const total: DocTaskIndexResult = { processed: 0, changed: 0 };
  let failed = false;
  for (let start = 0; start < stale.length; start += RECONCILE_BATCH) {
    if (isStale()) return { ...total, aborted: true };
    for (const contentId of stale.slice(start, start + RECONCILE_BATCH)) {
      if (isStale()) return { ...total, aborted: true };
      try {
        const result = reindexDocTasks(mainDb, indexDb, [contentId]);
        total.processed += result.processed;
        total.changed += result.changed;
        result.pending?.forEach(onPending);
      } catch (error) {
        failed = true;
        onError(contentId, error);
      }
    }
    await yieldToEventLoop();
  }
  if (isStale()) return { ...total, aborted: true };
  if (!failed)
    indexDb
      .prepare(
        `INSERT INTO index_meta (key,value,updated_at) VALUES ('doc_tasks_version','2',?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      )
      .run(Date.now());
  return { ...total, aborted: false };
}
