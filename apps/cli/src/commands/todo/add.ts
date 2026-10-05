import { getDataAccess, closeDataAccess } from "../../data-access/index.js";
import { getActiveDbName } from "../../utils/path.js";
import { parsePositiveIntOrError } from "../../utils/validate.js";
import { emitTodoMutation } from "../../utils/todo-question-helpers.js";

interface AddOptions {
  group?: string;
  type?: string;
  due?: string;
  parent?: string;
}

// 计划任务已退役（安排时间改在日程里拖动待办完成）
const VALID_TYPES = ["normal", "deadline", "recurring"];

export async function runTodoAdd(title: string, options: AddOptions) {
  const groupResult = parsePositiveIntOrError(options.group, "--group");
  if (!groupResult.ok) {
    console.log(`Error: ${groupResult.error}`);
    return;
  }

  const parentResult = parsePositiveIntOrError(options.parent, "--parent");
  if (!parentResult.ok) {
    console.log(`Error: ${parentResult.error}`);
    return;
  }

  const type = options.type || "normal";
  if (!VALID_TYPES.includes(type)) {
    console.log(`Error: --type must be one of: ${VALID_TYPES.join(", ")}`);
    return;
  }

  const dbName = getActiveDbName();
  const da = getDataAccess(dbName);

  try {
    let resolvedGroupId = groupResult.value;
    const parentId = parentResult.value;

    // Validate parent exists and derive group from it
    if (parentId) {
      const parent = da.queryOne<{ id: number; group_id: number }>(
        `SELECT ti.id, ti.group_id FROM todo_item ti
         JOIN todo_group tg ON ti.group_id = tg.id
         WHERE ti.id = ? AND ti.is_archived = 0 AND tg.is_archived = 0 AND tg.is_system = 0`,
        parentId,
      );
      if (!parent) {
        console.log(
          `Error: Parent task #${parentId} not found or is archived.`,
        );
        return;
      }
      if (resolvedGroupId && resolvedGroupId !== parent.group_id) {
        console.log(
          `Error: --group conflicts with parent's group. Parent belongs to group #${parent.group_id}.`,
        );
        return;
      }
      resolvedGroupId = parent.group_id;
    }

    // Resolve or validate group
    if (!resolvedGroupId) {
      const defaultGroup = da.queryOne<{ id: number }>(
        `SELECT id FROM todo_group WHERE is_system = 0 AND is_archived = 0 ORDER BY sort_index ASC LIMIT 1`,
      );
      if (!defaultGroup) {
        console.log("Error: No task groups found. Create a group first.");
        return;
      }
      resolvedGroupId = defaultGroup.id;
    } else if (!parentId) {
      const group = da.queryOne<{ id: number }>(
        `SELECT id FROM todo_group WHERE id = ? AND is_system = 0 AND is_archived = 0`,
        resolvedGroupId,
      );
      if (!group) {
        console.log(`Error: Group #${resolvedGroupId} not found.`);
        return;
      }
    }

    const now = Date.now();
    let dueAt: number | null = null;

    if (options.due) {
      const parsed = new Date(options.due);
      if (isNaN(parsed.getTime())) {
        console.log("Error: Invalid date format. Use YYYY-MM-DD.");
        return;
      }
      dueAt = parsed.getTime();
    }

    const maxSort = da.queryOne<{ m: number | null }>(
      `SELECT MAX(sort_index) AS m FROM todo_item WHERE group_id = ? AND parent_id IS ?`,
      resolvedGroupId,
      parentId,
    );
    const sortIndex = (maxSort?.m ?? 0) + 1;

    const result = da.exec(
      `INSERT INTO todo_item (group_id, parent_id, title, type, is_completed, due_at, sort_index, is_archived, create_time, update_time)
       VALUES (?, ?, ?, ?, 0, ?, ?, 0, ?, ?)`,
      resolvedGroupId,
      parentId,
      title,
      type,
      dueAt,
      sortIndex,
      now,
      now,
    );

    emitTodoMutation({
      entityId: Number(result.lastInsertRowid),
      groupId: resolvedGroupId,
      action: "create-item",
    });
    console.log(`Created task #${result.lastInsertRowid}: ${title}`);
  } finally {
    closeDataAccess();
  }
}
