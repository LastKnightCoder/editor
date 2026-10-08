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
import { matchGroupToken } from "@/entity/doc-tasks";
import ContentTable from "../tables/content";
import EntitySearchTable from "../tables/entity-search";
import TodoItemTable from "../tables/todo-item";
import TodoNoteLinkTable from "../tables/todo-note-link";
import { listTaskGroups } from "./indexer";

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
  const rows = indexDb
    .prepare(`SELECT * FROM doc_tasks WHERE content_id = ? ORDER BY sort_index`)
    .all(contentId) as TaskRow[];
  const root = rows.find(row => row.task_id === taskId);
  if (!root) return { ok: false, reason: "not-found" };
  const groupId = root.group_id ?? fallbackGroupId;
  if (groupId == null) return { ok: false, reason: "no-group" };

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
    const now = Date.now();
    const created = new Map<string, number>();
    const register = mainDb.prepare(
      `INSERT OR REPLACE INTO doc_task_settings (content_id, task_id, kind, todo_item_id, create_time)
       VALUES (?, ?, 'promoted', ?, ?)`
    );
    const build = (row: TaskRow, parentId: number | null) => {
      const item = TodoItemTable.createItem(mainDb, {
        groupId,
        parentId,
        title: row.title || "未命名任务",
        type: row.due_at != null ? "deadline" : "normal",
        dueAt: row.due_at,
      });
      if (row.checked)
        TodoItemTable.toggleCompleteCascade(mainDb, { id: item.id, isCompleted: true });
      created.set(row.task_id, item.id);
      register.run(contentId, row.task_id, item.id, now);
      for (const child of rows.filter(r => r.parent_task_id === row.task_id)) build(child, item.id);
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
 * 从索引推断项目改名：镜像里记着某项目的原文 `#旧名`（group_token），而该项目现在叫别的名字。
 * 写事件不带改名前的值，镜像正好是改名前的快照；已归档 / 删除的项目不算改名。
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
  const renames = new Map<number, { groupId: number; oldTitle: string; newTitle: string }>();
  for (const { group_id, group_token } of tokens) {
    const newTitle = current.get(group_id);
    const oldTitle = group_token.slice(1);
    if (newTitle && newTitle !== oldTitle && !renames.has(group_id))
      renames.set(group_id, { groupId: group_id, oldTitle, newTitle });
  }
  return [...renames.values()];
}

/**
 * 项目改名：正文里写着 `#旧名` 的勾选项改成 `#新名`（只改命中旧名的 #词，长名优先匹配）。
 * 返回改写的正文数；共享内容拒绝写入时跳过该篇。
 */
export function renameGroupTokens(
  mainDb: Database.Database,
  indexDb: Database.Database,
  groupId: number,
  oldTitle: string,
  newTitle: string
): number {
  if (!oldTitle || oldTitle === newTitle) return 0;
  const contentIds = (
    indexDb
      .prepare(`SELECT DISTINCT content_id FROM doc_tasks WHERE group_id = ?`)
      .all(groupId) as Array<{ content_id: number }>
  ).map(row => row.content_id);
  if (!contentIds.length) return 0;
  // 按改名前的项目表匹配，避免把「#笔记软件开发」里的「#笔记」误当成另一个项目改掉
  const groups = listTaskGroups(mainDb).map(g =>
    g.id === groupId ? { ...g, title: oldTitle } : g
  );
  let changed = 0;
  for (const contentId of contentIds) {
    try {
      const patched = ContentTable.patchNodes(mainDb, contentId, () => null, {
        text: text => {
          if (!text.includes(oldTitle)) return null;
          const next = replaceGroupToken(text, groups, groupId, newTitle);
          return next === text ? null : next;
        },
      });
      if (patched) changed++;
    } catch {
      // 共享内容只能在编辑器里改，留给用户手动处理
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
