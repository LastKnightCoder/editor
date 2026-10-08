/**
 * 文档待办的用户设置（主库 doc_task_settings）与改写正文的动作：
 * - 本文不收集：整篇排除，索引不再收集它的勾选项；
 * - 转为独立待办：新建 todo_item（标题、日期、项目、子项照搬）并关联原文，镜像隐藏该项，原文不动；
 * - 项目改名：把正文里写的 `#旧名` 改成 `#新名`。
 *
 * 写正文只经内容层 ContentTable.patchNodes。
 */

import type Database from "better-sqlite3";
import type { EntityRefKind } from "@/entity/ref";
import {
  extractDocTasks,
  groupTokenEdits,
  matchGroupToken,
  type DocTaskGroupBinding,
} from "@/entity/doc-tasks";
import ContentTable from "../tables/content";
import EntitySearchTable from "../tables/entity-search";
import TodoItemTable from "../tables/todo-item";
import TodoNoteLinkTable from "../tables/todo-note-link";
import TodoCalendarSyncTable from "../tables/todo-calendar-sync";
import { listTaskGroups, reindexDocTasks } from "./indexer";
import { rememberGroupNames } from "./group-names";

const NOTE_LINK_TYPE: Record<EntityRefKind, string> = {
  card: "card",
  article: "article",
  "project-item": "project-item",
  "diary-moment": "diary-moment",
};

/** 整篇排除的正文 id */
export function excludedContentIds(mainDb: Database.Database): Set<number> {
  return new Set(
    (
      mainDb
        .prepare(`SELECT content_id FROM doc_task_settings WHERE kind = 'excluded'`)
        .all() as Array<{ content_id: number }>
    ).map(row => row.content_id)
  );
}

/** 已转为独立待办的勾选项（`contentId:taskId`） */
export function promotedTaskKeys(mainDb: Database.Database): Set<string> {
  return new Set(
    (
      mainDb
        .prepare(`SELECT content_id, task_id FROM doc_task_settings WHERE kind = 'promoted'`)
        .all() as Array<{ content_id: number; task_id: string }>
    ).map(row => `${row.content_id}:${row.task_id}`)
  );
}

export function setContentExcluded(
  mainDb: Database.Database,
  contentId: number,
  excluded: boolean
): void {
  if (excluded)
    mainDb
      .prepare(
        `INSERT OR IGNORE INTO doc_task_settings (content_id, task_id, kind, create_time)
         VALUES (?, '', 'excluded', ?)`
      )
      .run(contentId, Date.now());
  else
    mainDb
      .prepare(`DELETE FROM doc_task_settings WHERE content_id = ? AND kind = 'excluded'`)
      .run(contentId);
}

export function isContentExcluded(mainDb: Database.Database, contentId: number): boolean {
  return Boolean(
    mainDb
      .prepare(`SELECT 1 FROM doc_task_settings WHERE content_id = ? AND kind = 'excluded'`)
      .get(contentId)
  );
}

interface TaskRow {
  task_id: string;
  title: string;
  checked: number;
  parent_task_id: string | null;
  sort_index: number;
  group_id: number | null;
  due_at: number | null;
}

export type PromoteResult =
  { ok: true; todoId: number } | { ok: false; reason: "not-found" | "no-group" };

/**
 * 转为独立待办：项目取正文里写的 `#项目`，没写则用 fallbackGroupId；子项按原层级建为子任务。
 * 事务内完成建项、关联原文与设置登记，任何一步失败整体回滚。
 */
export function promoteDocTask(
  mainDb: Database.Database,
  indexDb: Database.Database,
  contentId: number,
  taskId: string,
  fallbackGroupId: number | null
): PromoteResult {
  reindexDocTasks(mainDb, indexDb, [contentId]);
  const content = ContentTable.getContentById(mainDb, contentId);
  if (!content) return { ok: false, reason: "not-found" };
  const now = Date.now();
  const rows: TaskRow[] = extractDocTasks(
    content.content,
    listTaskGroups(mainDb),
    new Date(now)
  ).tasks.map(task => ({
    task_id: task.taskId,
    title: task.title,
    checked: task.checked ? 1 : 0,
    parent_task_id: task.parentTaskId,
    sort_index: task.order,
    group_id: task.groupId,
    due_at: task.dueAt,
  }));
  const root = rows.find(row => row.task_id === taskId);
  if (!root) return { ok: false, reason: "not-found" };
  const groupId = root.group_id ?? fallbackGroupId;
  if (
    groupId == null ||
    !mainDb
      .prepare(`SELECT 1 FROM todo_group WHERE id = ? AND is_system = 0 AND is_archived = 0`)
      .get(groupId)
  )
    return { ok: false, reason: "no-group" };

  const ref = EntitySearchTable.locateAll(mainDb, [contentId]).get(contentId)?.[0];
  const sourceTitle = ref
    ? (EntitySearchTable.resolve(
        mainDb,
        ref.kind === "project-item" ? "project_item" : ref.kind,
        ref.id,
        0
      )?.title ?? "")
    : "";

  return mainDb.transaction((): PromoteResult => {
    const created = new Map<string, number>();
    const existingOf =
      mainDb.prepare(`SELECT s.todo_item_id FROM doc_task_settings s JOIN todo_item t ON t.id = s.todo_item_id
      WHERE s.content_id = ? AND s.task_id = ? AND s.kind = 'promoted'`);
    const existingRoot = existingOf.get(contentId, taskId) as { todo_item_id: number } | undefined;
    if (existingRoot) return { ok: true, todoId: existingRoot.todo_item_id };
    const children = new Map<string, TaskRow[]>();
    for (const row of rows)
      if (row.parent_task_id) {
        const siblings = children.get(row.parent_task_id) ?? [];
        siblings.push(row);
        children.set(row.parent_task_id, siblings);
      }
    const register = mainDb.prepare(
      `INSERT OR REPLACE INTO doc_task_settings (content_id, task_id, kind, todo_item_id, create_time)
       VALUES (?, ?, 'promoted', ?, ?)`
    );
    const build = (row: TaskRow, parentId: number | null) => {
      const existing = existingOf.get(contentId, row.task_id) as
        { todo_item_id: number } | undefined;
      if (existing) {
        TodoItemTable.moveAndReorder(mainDb, {
          id: existing.todo_item_id,
          toGroupId: groupId,
          toParentId: parentId,
        });
        created.set(row.task_id, existing.todo_item_id);
        return;
      }
      const item = TodoItemTable.createItem(
        mainDb,
        {
          groupId,
          parentId,
          title: row.title || "未命名任务",
          type: row.due_at != null ? "deadline" : "normal",
          dueAt: row.due_at,
        },
        { syncCalendar: false }
      );
      if (row.checked)
        mainDb
          .prepare(
            `UPDATE todo_item SET is_completed = 1, completed_at = ?, update_time = ? WHERE id = ?`
          )
          .run(now, now, item.id);
      if (
        item.type === "deadline" &&
        TodoCalendarSyncTable.syncTodoItem(mainDb, {
          todoItem: {
            ...item,
            isCompleted: row.checked === 1,
            completedAt: row.checked ? now : null,
          },
        }) == null
      )
        throw new Error("日程同步未完成，转出已回滚");
      created.set(row.task_id, item.id);
      register.run(contentId, row.task_id, item.id, now);
      for (const child of children.get(row.task_id) ?? []) build(child, item.id);
    };
    build(root, null);
    const todoId = created.get(taskId)!;
    TodoNoteLinkTable.attachExisting(mainDb, {
      todoId,
      contentId,
      title: sourceTitle,
      type: ref ? NOTE_LINK_TYPE[ref.kind] : undefined,
    });
    return { ok: true, todoId };
  })();
}

/**
 * 用主库曾用名找待重写的项目词；旧镜像只补充首次升级时尚未保存的历史。
 */
export function detectGroupRenames(
  mainDb: Database.Database,
  indexDb: Database.Database
): Array<{ groupId: number; oldTitle: string; newTitle: string }> {
  const current = new Map(listTaskGroups(mainDb).map(g => [g.id, g.title]));
  const tokens = indexDb
    .prepare(
      `SELECT DISTINCT group_id, group_token FROM doc_tasks
       WHERE group_id IS NOT NULL AND group_token IS NOT NULL`
    )
    .all() as Array<{ group_id: number; group_token: string }>;
  const remember =
    mainDb.prepare(`INSERT OR IGNORE INTO doc_task_group_names (group_id, group_created_at, title)
    SELECT id, create_time, ? FROM todo_group WHERE id = ?`);
  for (const { group_id, group_token } of tokens) {
    if (current.has(group_id)) remember.run(group_token.slice(1), group_id);
  }
  rememberGroupNames(mainDb);
  const pending = new Set(tokens.map(token => `${token.group_id}:${token.group_token.slice(1)}`));
  return listTaskGroups(mainDb).flatMap(group =>
    (group.aliases ?? [])
      .filter(oldTitle => pending.has(`${group.id}:${oldTitle}`))
      .map(oldTitle => ({ groupId: group.id, oldTitle, newTitle: group.title }))
  );
}

/**
 * 项目改名：正文里写着 `#旧名` 的勾选项改成 `#新名`（只改命中旧名的 #词，长名优先匹配）。
 * 返回改写的正文数；共享内容拒绝写入时跳过该篇。
 */
export function renameGroupTokens(
  mainDb: Database.Database,
  _indexDb: Database.Database,
  groupId: number,
  oldTitle: string,
  newTitle: string
): number {
  if (!oldTitle || oldTitle === newTitle) return 0;
  const contentIds = (
    mainDb
      .prepare(`SELECT id FROM contents WHERE instr(content, '"check-list-item"') > 0`)
      .all() as Array<{ id: number }>
  ).map(row => row.id);
  if (!contentIds.length) return 0;
  // 按改名前的项目表匹配，避免把「#笔记软件开发」里的「#笔记」误当成另一个项目改掉
  const groups = listTaskGroups(mainDb).map(g =>
    g.id === groupId ? { ...g, title: newTitle, aliases: [...(g.aliases ?? []), oldTitle] } : g
  );
  let changed = 0;
  for (const contentId of contentIds) {
    try {
      const patched = ContentTable.patchNodes(mainDb, contentId, () => null, {
        paragraph: (text, parent, index) =>
          parent.type === "check-list-item" && index === 0
            ? groupTokenEdits(
                text,
                groups,
                new Map([[groupId, newTitle]]),
                parent.taskGroup as DocTaskGroupBinding | undefined
              )
            : [],
      });
      if (patched) changed++;
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !/COLLABORATION_WRITE_REQUIRED|CONTENT_SESSION_LOCKED/.test(error.message)
      )
        throw error;
    }
  }
  return changed;
}

/** 文本里所有指向 groupId 的 `#项目` 换成新名 */
export function replaceGroupToken(
  text: string,
  groups: Array<{ id: number; title: string }>,
  groupId: number,
  newTitle: string
): string {
  let out = "";
  let rest = text;
  for (;;) {
    const hit = matchGroupToken(rest, groups);
    if (!hit) return out + rest;
    const at = rest.indexOf(hit.token);
    const token = hit.group.id === groupId ? `${hit.token[0]}${newTitle}` : hit.token;
    out += rest.slice(0, at) + token;
    rest = rest.slice(at + hit.token.length);
  }
}
