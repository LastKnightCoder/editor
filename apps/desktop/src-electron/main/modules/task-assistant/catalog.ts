import type Database from "better-sqlite3";
import type {
  PluginTodoList,
  PluginCalendar,
  PluginDirectoryQuery,
  PluginPage,
} from "@tau/plugins";
import { revision, fail } from "./common";
import TodoGroupTable from "../tables/todo-group";
import CalendarTable from "../tables/calendar";
import type { TodoGroupDirectory } from "@/types/todo";
import type { CalendarDirectory } from "@/types/calendar";

export function readDirectory(
  db: Database.Database,
  kind: "todo-list" | "calendar",
  id: number
): PluginTodoList | PluginCalendar | null {
  const item =
    kind === "todo-list"
      ? TodoGroupTable.getDirectoryItem(db, id)
      : CalendarTable.getDirectoryItem(db, id);
  return item ? toDirectory(item) : null;
}

function toDirectory(
  item: TodoGroupDirectory | CalendarDirectory
): PluginTodoList | PluginCalendar {
  const archived = "isArchived" in item ? item.isArchived : item.archived;
  const result = {
    id: String(item.id),
    title: item.title,
    archived,
    writable: item.writable,
    ...(!item.writable ? { readonlyReason: archived ? "已归档" : "系统日历不可写" } : {}),
    ...("visible" in item ? { color: item.color, visible: item.visible } : {}),
  };
  return { ...result, revision: revision(result) };
}

export function queryDirectories(
  db: Database.Database,
  kind: "todo-list" | "calendar",
  query: PluginDirectoryQuery
): PluginPage<PluginTodoList | PluginCalendar> {
  const fingerprint = revision({ kind, archived: query.archived, database: db.name });
  let after = 0;
  if (query.cursor) {
    try {
      const cursor = JSON.parse(query.cursor) as { fingerprint: string; after: number };
      if (
        cursor.fingerprint !== fingerprint ||
        !Number.isSafeInteger(cursor.after) ||
        cursor.after < 0
      )
        throw new Error();
      after = cursor.after;
    } catch {
      fail("INVALID_ARGUMENT", "目录分页游标无效或条件已变化");
    }
  }
  const size = query.limit ?? 50;
  if (!Number.isInteger(size) || size < 1 || size > 100)
    fail("INVALID_ARGUMENT", "目录每页须为 1–100 条");
  const page = { afterId: after, archived: query.archived, limit: size + 1 };
  const rows =
    kind === "todo-list"
      ? TodoGroupTable.queryDirectoryItems(db, page)
      : CalendarTable.queryDirectoryItems(db, page);
  const selected = rows.slice(0, size);
  return {
    items: selected.map(toDirectory),
    ...(rows.length > size
      ? { cursor: JSON.stringify({ fingerprint, after: selected[selected.length - 1].id }) }
      : {}),
  };
}
