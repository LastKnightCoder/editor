import type Database from "better-sqlite3";
import {
  extractDocTasks,
  groupTokenEdits,
  type DocTaskGroup,
  type DocTaskGroupBinding,
} from "@/entity/doc-tasks";
import ContentTable from "../tables/content";

export function rememberGroupNames(db: Database.Database): void {
  db.prepare(
    `INSERT OR IGNORE INTO doc_task_group_names (group_id, group_created_at, title)
    SELECT id, create_time, title FROM todo_group WHERE is_system = 0`
  ).run();
}

export function listTaskGroups(db: Database.Database): DocTaskGroup[] {
  const groups = db
    .prepare(
      `SELECT id, title, create_time AS createdAt FROM todo_group WHERE is_archived = 0 AND is_system = 0`
    )
    .all() as DocTaskGroup[];
  const names = db
    .prepare(
      `SELECT n.group_id, n.title FROM doc_task_group_names n
    JOIN todo_group g ON g.id = n.group_id AND g.create_time = n.group_created_at
    WHERE g.is_archived = 0 AND g.is_system = 0 AND n.title <> g.title`
    )
    .all() as Array<{ group_id: number; title: string }>;
  const aliases = new Map<number, string[]>();
  for (const name of names) {
    const list = aliases.get(name.group_id) ?? [];
    list.push(name.title);
    aliases.set(name.group_id, list);
  }
  return groups.map(group => ({
    ...group,
    ...(aliases.has(group.id) ? { aliases: aliases.get(group.id) } : {}),
  }));
}

export function rewriteGroupAliases(
  db: Database.Database,
  contentIds: number[],
  groups = listTaskGroups(db)
): number[] {
  if (!groups.some(group => group.aliases?.length)) return [];
  const titles = new Map(groups.map(group => [group.id, group.title]));
  const pending: number[] = [];
  for (const contentId of contentIds) {
    const content = ContentTable.getContentById(db, contentId);
    if (
      !content ||
      !extractDocTasks(content.content, groups).tasks.some(
        task => task.groupId != null && task.groupToken?.slice(1) !== titles.get(task.groupId)
      )
    )
      continue;
    try {
      const changed = ContentTable.patchNodes(db, contentId, () => null, {
        paragraph: (text, parent, index) =>
          parent.type === "check-list-item" && index === 0
            ? groupTokenEdits(
                text,
                groups,
                titles,
                parent.taskGroup as DocTaskGroupBinding | undefined
              )
            : [],
      });
      if (!changed) pending.push(contentId);
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !/COLLABORATION_WRITE_REQUIRED|CONTENT_SESSION_LOCKED/.test(error.message)
      )
        throw error;
      pending.push(contentId);
    }
  }
  return pending;
}
