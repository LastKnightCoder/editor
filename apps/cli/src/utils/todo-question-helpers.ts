import { getDataAccess } from "../data-access/index.js";
import { getActiveDbName } from "./path.js";
import { notifyApp } from "../data-access/notify.js";

export type TodoMutationAction =
  | "create-item"
  | "update-item"
  | "complete-item"
  | "uncomplete-item"
  | "delete-item-cascade";

export interface TodoMutationEvent {
  source: string;
  entityType: "item";
  entityId?: number;
  groupId?: number | null;
  action: TodoMutationAction;
  timestamp: number;
}

export function emitTodoMutation(params: {
  entityId?: number;
  groupId?: number | null;
  action: TodoMutationAction;
}): void {
  const event: TodoMutationEvent = {
    source: "cli",
    entityType: "item",
    entityId: params.entityId,
    groupId: params.groupId,
    action: params.action,
    timestamp: Date.now(),
  };
  notifyApp("todo:mutation", event).catch(() => {});
}

export interface TodoGroupStats {
  id: number;
  title: string;
  color: string | null;
  is_system: number;
  system_type: string | null;
  total: number;
  pending: number;
  overdue: number;
}

export function queryTodoGroupsWithStats(): TodoGroupStats[] {
  const dbName = getActiveDbName();
  const da = getDataAccess(dbName);
  const now = Date.now();

  const userGroups = da.query<TodoGroupStats>(
    `SELECT
      tg.id, tg.title, tg.color, tg.is_system, tg.system_type,
      COUNT(ti.id) AS total,
      COALESCE(SUM(CASE WHEN ti.is_completed = 0 THEN 1 ELSE 0 END), 0) AS pending,
      COALESCE(SUM(CASE WHEN ti.is_completed = 0 AND ti.due_at IS NOT NULL AND ti.due_at < ? THEN 1 ELSE 0 END), 0) AS overdue
    FROM todo_group tg
    LEFT JOIN todo_item ti ON ti.group_id = tg.id AND ti.is_archived = 0
    WHERE tg.is_archived = 0 AND tg.is_system = 0
    GROUP BY tg.id
    ORDER BY tg.sort_index ASC`,
    now,
  );

  const systemGroupRows = da.query<{
    id: number;
    title: string;
    color: string | null;
    system_type: string | null;
  }>(
    `SELECT id, title, color, system_type FROM todo_group WHERE is_system = 1 AND is_archived = 0 ORDER BY sort_index ASC`,
  );

  const systemGroups: TodoGroupStats[] = systemGroupRows.map((sg) => {
    let total = 0,
      pending = 0,
      overdue = 0;

    if (sg.system_type === "all") {
      const row = da.queryOne<{
        total: number;
        pending: number;
        overdue: number;
      }>(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(CASE WHEN is_completed = 0 THEN 1 ELSE 0 END), 0) AS pending,
                COALESCE(SUM(CASE WHEN is_completed = 0 AND due_at IS NOT NULL AND due_at < ? THEN 1 ELSE 0 END), 0) AS overdue
         FROM todo_item WHERE is_archived = 0`,
        now,
      );
      if (row) {
        total = row.total;
        pending = row.pending;
        overdue = row.overdue;
      }
    } else if (sg.system_type) {
      const row = da.queryOne<{
        total: number;
        pending: number;
        overdue: number;
      }>(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(CASE WHEN is_completed = 0 THEN 1 ELSE 0 END), 0) AS pending,
                COALESCE(SUM(CASE WHEN is_completed = 0 AND due_at IS NOT NULL AND due_at < ? THEN 1 ELSE 0 END), 0) AS overdue
         FROM todo_item WHERE is_archived = 0 AND type = ?`,
        now,
        sg.system_type,
      );
      if (row) {
        total = row.total;
        pending = row.pending;
        overdue = row.overdue;
      }
    }

    return {
      id: sg.id,
      title: sg.title,
      color: sg.color,
      is_system: 1,
      system_type: sg.system_type,
      total,
      pending,
      overdue,
    };
  });

  return [...systemGroups, ...userGroups];
}

export function deleteTodoCascade(itemId: number): void {
  const dbName = getActiveDbName();
  const da = getDataAccess(dbName);
  const db = da.getDatabase();

  db.exec("BEGIN");
  try {
    const descendants = da.query<{
      id: number;
      group_id: number;
      description_content_id: number | null;
    }>(
      `WITH RECURSIVE desc(id, group_id, description_content_id) AS (
        SELECT id, group_id, description_content_id FROM todo_item WHERE id = ?
        UNION ALL
        SELECT ti.id, ti.group_id, ti.description_content_id FROM todo_item ti JOIN desc d ON ti.parent_id = d.id
      )
      SELECT id, group_id, description_content_id FROM desc`,
      itemId,
    );
    const ids = descendants.map((d) => d.id);
    const groupId = descendants[0]?.group_id ?? null;
    const contentIds = descendants
      .map((d) => d.description_content_id)
      .filter((id): id is number => id != null);
    const placeholders = ids.map(() => "?").join(",");

    // Clean up calendar events: fetch detail_content_id for ref_count handling
    const calendarEvents = da.query<{
      id: number;
      detail_content_id: number | null;
    }>(
      `SELECT ce.id, ce.detail_content_id FROM calendar_event ce
       JOIN todo_calendar_mapping tcm ON tcm.calendar_event_id = ce.id
       WHERE tcm.todo_item_id IN (${placeholders})`,
      ...ids,
    );

    if (calendarEvents.length > 0) {
      const calEventIds = calendarEvents.map((e) => e.id);
      const calContentIds = calendarEvents
        .map((e) => e.detail_content_id)
        .filter((id): id is number => id != null);

      // Decrement ref_count for calendar event detail content
      if (calContentIds.length > 0) {
        const ccp = calContentIds.map(() => "?").join(",");
        da.exec(
          `UPDATE contents SET ref_count = ref_count - 1 WHERE id IN (${ccp})`,
          ...calContentIds,
        );
        da.exec(
          `DELETE FROM contents WHERE id IN (${ccp}) AND ref_count <= 0`,
          ...calContentIds,
        );
      }

      const cep = calEventIds.map(() => "?").join(",");
      da.exec(
        `DELETE FROM calendar_event WHERE id IN (${cep})`,
        ...calEventIds,
      );
    }

    da.exec(
      `DELETE FROM todo_calendar_mapping WHERE todo_item_id IN (${placeholders})`,
      ...ids,
    );
    da.exec(
      `DELETE FROM todo_note_link WHERE todo_id IN (${placeholders})`,
      ...ids,
    );

    // Clean up recurrence completions before deleting recurrences
    const recurrenceIds = da
      .query<{
        id: number;
      }>(
        `SELECT id FROM todo_recurrence WHERE todo_item_id IN (${placeholders})`,
        ...ids,
      )
      .map((r) => r.id);

    if (recurrenceIds.length > 0) {
      const rp = recurrenceIds.map(() => "?").join(",");
      da.exec(
        `DELETE FROM todo_recurrence_completion WHERE recurrence_id IN (${rp})`,
        ...recurrenceIds,
      );
    }

    da.exec(
      `DELETE FROM todo_recurrence WHERE todo_item_id IN (${placeholders})`,
      ...ids,
    );
    da.exec(`DELETE FROM todo_item WHERE id IN (${placeholders})`, ...ids);

    // Decrement ref_count for description content
    if (contentIds.length > 0) {
      const cp = contentIds.map(() => "?").join(",");
      da.exec(
        `UPDATE contents SET ref_count = ref_count - 1 WHERE id IN (${cp})`,
        ...contentIds,
      );
      da.exec(
        `DELETE FROM contents WHERE id IN (${cp}) AND ref_count <= 0`,
        ...contentIds,
      );
    }

    db.exec("COMMIT");
    emitTodoMutation({
      entityId: itemId,
      groupId,
      action: "delete-item-cascade",
    });
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function parseAnswerIds(answersJson: string): number[] {
  try {
    const parsed = JSON.parse(answersJson);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<number>();
    const result: number[] = [];
    for (const item of parsed) {
      if (Number.isInteger(item) && item > 0 && !seen.has(item)) {
        seen.add(item);
        result.push(item);
      }
    }
    return result;
  } catch {
    return [];
  }
}

export interface AnswerContent {
  id: number;
  content: string | null;
  create_time: number;
  update_time: number;
}

export function fetchAnswerContents(answerIds: number[]): AnswerContent[] {
  if (answerIds.length === 0) return [];
  const dbName = getActiveDbName();
  const da = getDataAccess(dbName);
  const placeholders = answerIds.map(() => "?").join(",");
  const rows = da.query<AnswerContent>(
    `SELECT id, content, create_time, update_time FROM contents WHERE id IN (${placeholders})`,
    ...answerIds,
  );
  const orderMap = new Map(answerIds.map((id, i) => [id, i]));
  rows.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
  return rows;
}
