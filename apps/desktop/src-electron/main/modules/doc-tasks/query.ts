/**
 * 文档待办查询与回写：读索引库 doc_tasks，展示信息从主库解析；勾选经内容层写回正文。
 */

import type Database from "better-sqlite3";
import type {
  DocTaskContentStatus,
  DocTaskItem,
  DocTaskReminderReadResult,
  DocTaskReminderWriteResult,
  DocTaskSnapshot,
  DocTaskSource,
  DocTaskToggleResult,
} from "@/types/doc-tasks";
import ContentTable from "../tables/content";
import {
  TaskAssistantError,
  documentTaskCheck,
  documentTaskReminders,
  type DocumentTaskAttributes,
  type TaskReminder,
} from "@tau/shared/task-assistant";
import {
  canScheduleDocumentReminder,
  remindersDigest,
  toStoredTaskReminder,
} from "@tau/shared/reminders";
import { assertTaskContentWritable, taskNode, type TaskContentNode } from "../content-task-patches";
import { reindexDocTasks } from "./indexer";
import { documentReminderAccess, excludedContentIds, promotedTaskKeys } from "./settings";
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
  attributes_json?: string | null;
}

function parseTaskMeta(raw: string | null | undefined): {
  reminders: TaskReminder[];
  recurring: boolean;
} {
  if (!raw) return { reminders: [], recurring: false };
  try {
    const attrs = JSON.parse(raw) as DocumentTaskAttributes;
    return {
      reminders: documentTaskReminders(attrs),
      recurring: Boolean(attrs.taskRecurrence?.segments?.length),
    };
  } catch {
    return { reminders: [], recurring: false };
  }
}

const toItem = (row: TaskRow): DocTaskItem => {
  const meta = parseTaskMeta(row.attributes_json);
  return {
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
    reminders: meta.reminders,
    recurring: meta.recurring,
  };
};

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
    });
  }
  sources.sort((a, b) => b.updateTime - a.updateTime);
  const visible = new Set(sources.map(source => source.contentId));
  const open = (
    indexDb
      .prepare(
        `SELECT t.*, a.attributes_json FROM doc_tasks t
         LEFT JOIN doc_task_attributes a USING(content_id, task_id)
         WHERE t.checked = 0 ORDER BY t.content_id, t.sort_index`
      )
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
      .prepare(
        `SELECT t.*, a.attributes_json FROM doc_tasks t
         LEFT JOIN doc_task_attributes a USING(content_id, task_id)
         WHERE t.content_id = ? ORDER BY t.sort_index`
      )
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
      node.type === "check-list-item" && node.taskId === taskId
        ? documentTaskCheck(node, checked)
        : null
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

/** 读取正文勾选项当前全部提醒与并发校验指纹（活跃会话优先读会话，否则读主库快照） */
export function readDocTaskReminders(
  mainDb: Database.Database,
  contentId: number,
  taskId: string
): DocTaskReminderReadResult {
  const content = ContentTable.getContentById(mainDb, contentId);
  if (!content) return { ok: false, reason: "not-found" };
  const node = taskNode(content.content as unknown as TaskContentNode[], taskId);
  if (!node) return { ok: false, reason: "not-found" };
  const recurring = Boolean(node.taskRecurrence?.segments?.length);
  const reminders = documentTaskReminders(node);
  let writable =
    canScheduleDocumentReminder(documentReminderAccess(mainDb, contentId), taskId) &&
    !node.taskArchived;
  try {
    assertTaskContentWritable(mainDb, contentId);
  } catch {
    writable = false;
  }
  return {
    ok: true,
    reminders,
    recurring,
    digest: remindersDigest(reminders, recurring),
    writable,
  };
}

/**
 * 条件写回正文勾选项提醒：复用 ContentTable.patchNodes（活跃会话 CRDT 合并 / 冷文档条件写库），
 * 写前校验 expectedDigest 避免覆盖另一端或插件已写入的新值，成功后立即更新 doc_task_attributes 供排期读取。
 */
export function setDocTaskReminders(
  mainDb: Database.Database,
  indexDb: Database.Database,
  contentId: number,
  taskId: string,
  reminders: readonly TaskReminder[],
  expectedDigest: string
): DocTaskReminderWriteResult {
  let outcome: DocTaskReminderWriteResult = "not-found";
  if (!canScheduleDocumentReminder(documentReminderAccess(mainDb, contentId), taskId))
    return "unavailable";
  let updatedAttributes: Record<string, unknown> | null = null;
  try {
    assertTaskContentWritable(mainDb, contentId);
    ContentTable.patchNodes(mainDb, contentId, node => {
      if (node.type !== "check-list-item" || node.taskId !== taskId) return null;
      const attrs = node as unknown as DocumentTaskAttributes;
      const recurring = Boolean(attrs.taskRecurrence?.segments?.length);
      if (attrs.taskArchived) {
        outcome = "unavailable";
        return null;
      }
      const current = documentTaskReminders(attrs);
      if (remindersDigest(current, recurring) !== expectedDigest) {
        outcome = "conflict";
        return null;
      }
      const stored = toStoredTaskReminder(reminders, recurring);
      outcome = "ok";
      const nextNode = { ...node, taskReminder: stored };
      updatedAttributes = Object.fromEntries(
        Object.entries(nextNode).filter(([key]) => key.startsWith("task") && key !== "taskId")
      );
      return { taskReminder: stored };
    });
  } catch (error) {
    if (error instanceof TaskAssistantError) {
      if (error.code === "READ_ONLY") return "readonly";
      if (error.code === "CONTENT_BUSY") return "busy";
    }
    if (error instanceof Error && error.message.includes("COLLABORATION_WRITE_REQUIRED"))
      return "readonly";
    if (error instanceof Error && error.message.includes("CONTENT_SESSION_LOCKED")) return "busy";
    throw error;
  }
  if (outcome === "not-found") {
    reindexDocTasks(mainDb, indexDb, [contentId]);
    return "not-found";
  }
  if (outcome !== "ok") return outcome;
  if (updatedAttributes) {
    const typed = updatedAttributes as DocumentTaskAttributes;
    const first = documentTaskReminders(typed)[0];
    const recurrence = typed.taskRecurrence;
    indexDb
      .prepare(
        `INSERT INTO doc_task_attributes (content_id, task_id, attributes_json, archived, recurring, reminder_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(content_id, task_id) DO UPDATE SET
           attributes_json = excluded.attributes_json,
           archived = excluded.archived,
           recurring = excluded.recurring,
           reminder_at = excluded.reminder_at`
      )
      .run(
        contentId,
        taskId,
        JSON.stringify(updatedAttributes),
        typed.taskArchived ? 1 : 0,
        recurrence?.segments?.length ? 1 : 0,
        first
          ? "at" in first
            ? first.at
            : new Date(-first.offsetMs).toISOString().slice(11, 23)
          : null
      );
  }
  return "ok";
}

/** 编辑器底部状态条：这篇是否被排除、还有几项未完成（已转为独立待办的不算） */
export function getDocTaskContentStatus(
  mainDb: Database.Database,
  indexDb: Database.Database,
  contentId: number
): DocTaskContentStatus {
  const access = documentReminderAccess(mainDb, contentId);
  const openCount = (
    indexDb
      .prepare(`SELECT task_id FROM doc_tasks WHERE content_id = ? AND checked = 0`)
      .all(contentId) as Array<{ task_id: string }>
  ).filter(row => !access.promotedTaskIds.includes(row.task_id)).length;
  return {
    ...access,
    openCount,
  };
}
