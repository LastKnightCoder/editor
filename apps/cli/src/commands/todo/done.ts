import { getDataAccess, closeDataAccess } from "../../data-access/index.js";
import { getActiveDbName } from "../../utils/path.js";
import { emitTodoMutation } from "../../utils/todo-question-helpers.js";

export async function runTodoDone(id: number) {
  if (!Number.isInteger(id) || id <= 0) {
    console.log("Error: ID must be a positive integer.");
    return;
  }

  const dbName = getActiveDbName();
  const da = getDataAccess(dbName);

  try {
    const item = da.queryOne<{
      id: number;
      title: string;
      is_completed: number;
      group_id: number;
      type: string;
    }>(
      `SELECT id, title, type, is_completed, group_id FROM todo_item WHERE id = ? AND is_archived = 0`,
      id
    );

    if (!item) {
      console.log(`Error: Task #${id} not found or is archived.`);
      return;
    }

    if (item.is_completed) {
      console.log(`Task #${id} is already completed.`);
      return;
    }
    if (item.type === "recurring") {
      console.log("周期待办必须指定具体实例，请通过待办助理完成该次任务。");
      return;
    }

    const now = Date.now();
    da.exec(
      `WITH RECURSIVE descendants(id) AS (
        SELECT id FROM todo_item WHERE id = ?
        UNION
        SELECT ti.id FROM todo_item ti JOIN descendants d ON ti.parent_id = d.id WHERE ti.is_archived = 0
      )
      UPDATE todo_item SET is_completed = 1, completed_at = ?, update_time = ?
      WHERE id IN (SELECT id FROM descendants) AND is_completed = 0 AND type <> 'recurring'`,
      id,
      now,
      now
    );

    emitTodoMutation({
      entityId: id,
      groupId: item.group_id,
      action: "complete-item",
    });
    console.log(`Completed task #${id}: ${item.title}`);
  } finally {
    closeDataAccess();
  }
}
