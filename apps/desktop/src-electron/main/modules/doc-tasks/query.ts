/**
 * 文档待办查询与回写：读索引库 doc_tasks，展示信息从主库解析；勾选经内容层写回正文。
 */

import type Database from "better-sqlite3";
import type {
  DocTaskContentStatus,
  DocTaskItem,
  DocTaskSnapshot,
  DocTaskSource,
  DocTaskToggleResult,
} from "@/types/doc-tasks";
import ContentTable from "../tables/content";
import EntitySearchTable from "../tables/entity-search";
import { reindexDocTasks } from "./indexer";
import { excludedContentIds, isContentExcluded, promotedTaskKeys } from "./settings";
import { resolveDocTaskSources } from "./sources";

interface TaskRow {
  content_id: number;
  task_id: string;
  title: string;
  checked: number;
  depth: number;
  parent_task_id: string | null;
  sort_index: number;
  group_id: number | null;
  date_hint: string | null;
  due_at: number | null;
}

const toItem = (row: TaskRow): DocTaskItem => ({
  contentId: row.content_id,
  taskId: row.task_id,
  title: row.title,
  checked: row.checked === 1,
  depth: row.depth,
  parentTaskId: row.parent_task_id,
  sortIndex: row.sort_index,
  groupId: row.group_id,
  dateHint: row.date_hint,
  dueAt: row.due_at,
});

/**
 * 待办页快照：未完成条目全量 + 每篇文档的计数与展示信息。
 * 不属于任何实体的正文（白板文本块、已删文章）、整篇排除的文档、已转为独立待办的项都不出现。
 */
export function getDocTaskSnapshot(
  mainDb: Database.Database,
  indexDb: Database.Database
): DocTaskSnapshot {
  const excluded = excludedContentIds(mainDb);
  const promoted = promotedTaskKeys(mainDb);
  const isLive = (row: { content_id: number; task_id: string }) =>
    !excluded.has(row.content_id) && !promoted.has(`${row.content_id}:${row.task_id}`);
  const counts = new Map<number, { open: number; done: number }>();
  for (const row of indexDb
    .prepare(`SELECT content_id, task_id, checked FROM doc_tasks`)
    .all() as Array<{ content_id: number; task_id: string; checked: number }>) {
    if (!isLive(row)) continue;
    const count = counts.get(row.content_id) ?? { open: 0, done: 0 };
    if (row.checked) count.done++;
    else count.open++;
    counts.set(row.content_id, count);
  }
  const located = resolveDocTaskSources(mainDb, [...counts.keys()]);
  const sources: DocTaskSource[] = [];
  for (const [contentId, count] of counts) {
    const candidate = located.get(contentId);
    if (!candidate) continue;
    sources.push({
      contentId,
      ref: { kind: candidate.kind, id: candidate.id },
      title: candidate.title ?? "日记",
      meta: candidate.meta,
      updateTime: candidate.update_time,
      openCount: count.open,
      doneCount: count.done,
      ...(candidate.moment_id != null ? { momentId: candidate.moment_id } : {}),
    });
  }
  sources.sort((a, b) => b.updateTime - a.updateTime);
  const visible = new Set(sources.map(source => source.contentId));
  const open = (
    indexDb
      .prepare(`SELECT * FROM doc_tasks WHERE checked = 0 ORDER BY content_id, sort_index`)
      .all() as TaskRow[]
  )
    .filter(row => visible.has(row.content_id) && isLive(row))
    .map(toItem);
  return { sources, open };
}

/** 一篇文档的全部条目（含已完成），供「显示已完成」与抽屉的上下文；标出已转为独立待办的项 */
export function getDocTasksOf(
  mainDb: Database.Database,
  indexDb: Database.Database,
  contentId: number
): DocTaskItem[] {
  const promoted = promotedTaskKeys(mainDb);
  return (
    indexDb
      .prepare(`SELECT * FROM doc_tasks WHERE content_id = ? ORDER BY sort_index`)
      .all(contentId) as TaskRow[]
  ).map(row => ({ ...toItem(row), promoted: promoted.has(`${contentId}:${row.task_id}`) }));
}

/**
 * 勾选 / 取消勾选：经内容层写回正文。有编辑会话时由会话合并（编辑器立即可见），
 * 否则直接落库。内容层拒绝写入（如共享内容只能在编辑器里改）时返回 readonly。
 */
export function toggleDocTask(
  mainDb: Database.Database,
  indexDb: Database.Database,
  contentId: number,
  taskId: string,
  checked: boolean
): DocTaskToggleResult {
  let patched: number;
  try {
    patched = ContentTable.patchNodes(mainDb, contentId, node =>
      node.type === "check-list-item" && node.taskId === taskId ? { checked } : null
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("COLLABORATION_WRITE_REQUIRED"))
      return "readonly";
    if (error instanceof Error && error.message.includes("CONTENT_SESSION_LOCKED")) return "busy";
    throw error;
  }
  if (patched === 0) {
    reindexDocTasks(mainDb, indexDb, [contentId]);
    return "not-found";
  }
  // 会话路径的落库有投影延迟，先把镜像改掉，落库后的增量重建会得到同样结果
  indexDb
    .prepare(`UPDATE doc_tasks SET checked = ? WHERE content_id = ? AND task_id = ?`)
    .run(checked ? 1 : 0, contentId, taskId);
  return "ok";
}

/** 编辑器底部状态条：这篇是否被排除、还有几项未完成（已转为独立待办的不算） */
export function getDocTaskContentStatus(
  mainDb: Database.Database,
  indexDb: Database.Database,
  contentId: number
): DocTaskContentStatus {
  const promoted = promotedTaskKeys(mainDb);
  const openCount = (
    indexDb
      .prepare(`SELECT task_id FROM doc_tasks WHERE content_id = ? AND checked = 0`)
      .all(contentId) as Array<{ task_id: string }>
  ).filter(row => !promoted.has(`${contentId}:${row.task_id}`)).length;
  return {
    excluded: isContentExcluded(mainDb, contentId),
    openCount,
    collectable: (EntitySearchTable.locateAll(mainDb, [contentId]).get(contentId)?.length ?? 0) > 0,
  };
}
