import type Database from "better-sqlite3";
import {
  taskKey,
  type AssistantQueryResult,
  type AssistantTask,
  type AssistantCalendarEvent,
  type DocumentTaskAttributes,
  type TaskRef,
} from "@tau/shared/task-assistant";
import { resolveDocTaskSources } from "../doc-tasks/sources";
import { readTaskContent, taskNode } from "../content-task-patches";
import { readTask } from "./engine";
import { independentStates, occurrences } from "./recurrence";
import {
  afterDate,
  checkedWindow,
  dateTime,
  fail,
  localDate,
  refOfTodo,
  revision,
  instanceRevision,
  type Row,
} from "./common";
import { readCalendarEvent } from "./calendar";
import holidayService from "../holiday-service";
import ContentTable from "../tables/content";
import { readDocumentTask } from "./documents";

export interface TaskQuery {
  contentId?: number;
  pageSize?: number;
  cursor?: string;
  taskRefs?: TaskRef[];
  source?: "all" | "todo" | "document";
  keyword?: string;
  completed?: boolean;
  archived?: boolean;
  groupId?: number;
  overdue?: boolean;
  start?: string;
  end?: string;
  view?: "tasks" | "occurrences";
  sort?: "dueAt" | "updatedAt" | "title";
}
interface Cursor {
  fingerprint: string;
  todo: number;
  document: number;
  occurrence: number;
}
function cursorOf(query: Record<string, unknown>): Cursor {
  const { cursor, pageSize: _pageSize, ...filter } = query;
  const fingerprint = revision(filter);
  if (!cursor) return { fingerprint, todo: 0, document: 0, occurrence: 0 };
  try {
    const parsed = JSON.parse(Buffer.from(String(cursor), "base64url").toString()) as Cursor;
    if (
      parsed.fingerprint !== fingerprint ||
      ![parsed.todo, parsed.document, parsed.occurrence].every(
        value => Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000
      )
    )
      throw new Error();
    return parsed;
  } catch {
    return fail("INVALID_ARGUMENT", "分页游标无效或查询条件已变化");
  }
}
const encodeCursor = (cursor: Cursor) => Buffer.from(JSON.stringify(cursor)).toString("base64url");
interface Candidate {
  kind: "todo" | "document";
  row: Row;
  ref: TaskRef;
  offset: number;
  sortValue: string | number;
}

export function queryTasks(
  db: Database.Database,
  indexDb: Database.Database | undefined,
  databaseName: string,
  query: TaskQuery
): AssistantQueryResult<AssistantTask> {
  const pageSize = query.pageSize ?? 20;
  const cursor = cursorOf(query as Record<string, unknown>);
  const warnings: string[] = [];
  const documents = new Map<number, ReturnType<typeof readTaskContent>>();
  const documentTree = (ref: Extract<TaskRef, { kind: "document" }>) => {
    if (!documents.has(ref.contentId))
      documents.set(ref.contentId, readTaskContent(db, ref.contentId, ref.createdAt));
    return documents.get(ref.contentId)!;
  };
  const read = (ref: TaskRef) =>
    ref.kind === "document" ? readDocumentTask(db, ref, documentTree(ref)) : readTask(db, ref);
  const content = query.contentId ? ContentTable.getContentById(db, query.contentId) : null;
  if (query.contentId && !content) fail("NOT_FOUND", "指定正文不存在");
  const document = content
    ? { contentId: content.id, createdAt: content.createTime, revision: revision(content.content) }
    : undefined;
  if (query.view === "occurrences" && (!query.start || !query.end))
    fail("INVALID_ARGUMENT", "周期实例查询必须给 start/end");
  if (query.start || query.end) {
    if (!query.start || !query.end) fail("INVALID_ARGUMENT", "时间窗口必须同时提供 start/end");
    checkedWindow(query.start!, query.end!);
  }
  const expand = (task: AssistantTask): AssistantTask[] => {
    const ref = task.taskRef;
    const states =
      ref.kind === "todo"
        ? independentStates(db, ref)
        : ((taskNode(documentTree(ref), ref.taskId) as DocumentTaskAttributes)
            ?.taskOccurrenceState ?? {});
    let holidays: Set<number> | undefined;
    if (task.recurrence?.some(segment => segment.rule?.excludeHolidays)) {
      try {
        holidays = holidayService.cachedHolidayWindow(
          dateTime(query.start!) - 366 * 86_400_000,
          dateTime(query.end!)
        );
      } catch {
        warnings.push("部分周期任务缺少节假日数据，结果不完整");
        return [];
      }
    }
    return occurrences(task.recurrence ?? [], states, query.start!, query.end!, holidays)
      .filter(
        entry =>
          !entry.state.skipped &&
          (query.completed === undefined || query.completed === (entry.state.completedAt != null))
      )
      .map(entry => ({
        ...task,
        revision: instanceRevision(task, entry.occurrence, entry.state),
        completed: entry.state.completedAt != null,
        dueAt: entry.scheduledAt,
        occurrence: entry.occurrence,
      }));
  };
  if (query.taskRefs) {
    const items: AssistantTask[] = [];
    for (const ref of query.taskRefs) {
      try {
        const task = read(ref);
        items.push(...(query.view === "occurrences" ? expand(task) : [task]));
      } catch (error) {
        warnings.push(error instanceof Error ? error.message : "对象读取失败");
      }
    }
    return {
      type: "assistant-tasks",
      databaseName,
      items: items.slice(cursor.occurrence, cursor.occurrence + pageSize),
      hasMore: cursor.occurrence + pageSize < items.length,
      nextCursor:
        cursor.occurrence + pageSize < items.length
          ? encodeCursor({ ...cursor, occurrence: cursor.occurrence + pageSize })
          : null,
      incomplete: !!warnings.length,
      warnings,
    };
  }
  const limit = query.view === "occurrences" ? 1000 : pageSize + 1;
  const exhausted = { todo: false, document: false };
  const positions = { todo: cursor.todo, document: cursor.document };
  const candidates: Candidate[] = [];
  for (const kind of ["todo", "document"] as const) {
    if (query.contentId && kind === "todo") {
      exhausted.todo = true;
      continue;
    }
    if (query.source && query.source !== "all" && query.source !== kind) {
      exhausted[kind] = true;
      continue;
    }
    const source = kind === "todo" ? db : indexDb;
    if (!source) {
      warnings.push("文档待办索引未就绪，结果不完整");
      exhausted[kind] = true;
      continue;
    }
    const where: string[] = [],
      params: Array<string | number> = [];
    const doc = kind === "document";
    if (doc && query.contentId) {
      where.push("t.content_id=?");
      params.push(query.contentId);
    }
    const archived = doc ? "COALESCE(a.archived,0)" : "t.is_archived";
    where.push(`${archived}=?`);
    params.push(query.archived ? 1 : 0);
    if (query.completed !== undefined && query.view !== "occurrences") {
      where.push(`${doc ? "t.checked" : "t.is_completed"}=?`);
      params.push(query.completed ? 1 : 0);
    }
    if (query.groupId !== undefined) {
      where.push("t.group_id=?");
      params.push(query.groupId);
    }
    if (query.keyword) {
      where.push("instr(lower(t.title),lower(?))>0");
      params.push(query.keyword);
    }
    if (query.overdue !== undefined && query.view !== "occurrences") {
      where.push(
        `(t.due_at IS NOT NULL AND t.due_at<? AND ${doc ? "t.checked" : "t.is_completed"}=0)${query.overdue ? "" : "=0"}`
      );
      params.push(Date.now());
    }
    if (query.view === "occurrences")
      where.push(
        doc
          ? "a.recurring=1"
          : "(t.type='recurring' OR EXISTS(SELECT 1 FROM todo_recurrence_history h WHERE h.todo_item_id=t.id))"
      );
    else if (query.start && query.end) {
      where.push("t.due_at>=? AND t.due_at<?");
      params.push(dateTime(query.start), afterDate(query.end));
    }
    const sort =
      query.sort === "title"
        ? "t.title"
        : query.sort === "updatedAt"
          ? doc
            ? "s.update_time"
            : "t.update_time"
          : "COALESCE(t.due_at,9007199254740991)";
    const direction = query.sort === "updatedAt" ? "DESC" : "ASC";
    const from = doc
      ? "doc_tasks t LEFT JOIN doc_task_attributes a USING(content_id,task_id) LEFT JOIN doc_task_sources s USING(content_id)"
      : "todo_item t";
    const sourceCandidates: Candidate[] = [];
    let scanned = 0;
    while (sourceCandidates.length < limit && scanned < 2000) {
      const rows = source
        .prepare(
          `SELECT t.*,${sort} AS order_value FROM ${from} WHERE ${where.join(" AND ")} ORDER BY ${sort} ${direction},${doc ? "t.content_id,t.task_id" : "t.id"} LIMIT ? OFFSET ?`
        )
        .all(...params, Math.min(100, limit - sourceCandidates.length), positions[kind]) as Row[];
      if (!rows.length) {
        exhausted[kind] = true;
        break;
      }
      const sources = doc
        ? resolveDocTaskSources(
            db,
            rows.map(row => Number(row.content_id))
          )
        : undefined;
      for (const row of rows) {
        positions[kind]++;
        scanned++;
        let ref: TaskRef;
        if (doc) {
          const contentId = Number(row.content_id),
            taskId = String(row.task_id);
          if (!sources?.has(contentId)) continue;
          if (
            db
              .prepare(
                "SELECT 1 FROM doc_task_settings WHERE content_id=? AND (kind='excluded' OR (kind='promoted' AND task_id=?))"
              )
              .get(contentId, taskId)
          )
            continue;
          const content = db
            .prepare("SELECT create_time FROM contents WHERE id=?")
            .get(contentId) as { create_time: number } | undefined;
          if (!content) continue;
          ref = { kind: "document", contentId, taskId, createdAt: content.create_time };
          row.source_title = sources.get(contentId)!.title;
        } else ref = refOfTodo(row);
        sourceCandidates.push({
          kind,
          row,
          ref,
          offset: positions[kind],
          sortValue: row.order_value!,
        });
      }
    }
    if (scanned >= 2000) warnings.push("候选过滤达到本页扫描上限，请缩小查询范围");
    candidates.push(...sourceCandidates);
  }
  candidates.sort((a, b) => {
    const order =
      typeof a.sortValue === "number" && typeof b.sortValue === "number"
        ? a.sortValue - b.sortValue
        : Buffer.compare(Buffer.from(String(a.sortValue)), Buffer.from(String(b.sortValue)));
    return (
      (query.sort === "updatedAt" ? -order : order) ||
      a.kind.localeCompare(b.kind) ||
      a.offset - b.offset
    );
  });
  if (query.view === "occurrences") {
    const expanded = candidates.flatMap(candidate => expand(read(candidate.ref)));
    expanded.sort(
      (a, b) =>
        String(a.dueAt).localeCompare(String(b.dueAt)) ||
        taskKey(a.taskRef).localeCompare(taskKey(b.taskRef)) ||
        a.occurrence!.occurrenceDate.localeCompare(b.occurrence!.occurrenceDate)
    );
    const items = expanded.slice(cursor.occurrence, cursor.occurrence + pageSize);
    const hasMore = cursor.occurrence + items.length < expanded.length;
    if (candidates.length >= 1000) warnings.push("周期任务候选达到上限，请按项目或来源缩小范围");
    return {
      type: "assistant-tasks",
      databaseName,
      items,
      hasMore,
      nextCursor: hasMore
        ? encodeCursor({ ...cursor, occurrence: cursor.occurrence + items.length })
        : null,
      incomplete: !!warnings.length,
      warnings,
    };
  }
  const selected = candidates.slice(0, pageSize);
  const next = { ...cursor };
  const items = selected.flatMap(candidate => {
    next[candidate.kind] = candidate.offset;
    try {
      return [
        {
          ...read(candidate.ref),
          ...(candidate.row.source_title
            ? { sourceTitle: String(candidate.row.source_title) }
            : {}),
        },
      ];
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : "对象读取失败");
      return [];
    }
  });
  for (const kind of ["todo", "document"] as const)
    if (!candidates.some(candidate => candidate.kind === kind)) next[kind] = positions[kind];
  const hasMore =
    candidates.length > pageSize ||
    (!exhausted.todo && candidates.filter(item => item.kind === "todo").length === 0) ||
    (!exhausted.document && candidates.filter(item => item.kind === "document").length === 0);
  return {
    type: "assistant-tasks",
    databaseName,
    ...(document ? { document } : {}),
    items,
    hasMore,
    nextCursor: hasMore ? encodeCursor(next) : null,
    incomplete: !!warnings.length,
    warnings,
  };
}

export function queryEvents(
  db: Database.Database,
  databaseName: string,
  query: { start: string; end: string; pageSize?: number; cursor?: string; calendarIds?: number[] },
  indexDb?: Database.Database
): AssistantQueryResult<AssistantCalendarEvent> {
  const [start, end] = checkedWindow(query.start, query.end);
  const cursor = cursorOf(query as Record<string, unknown>),
    size = query.pageSize ?? 20;
  const ids = query.calendarIds;
  const statement = db.prepare(
    `SELECT e.id FROM calendar_event e WHERE
    e.start_date<? AND COALESCE(e.end_date,e.start_date)>=?
    AND NOT EXISTS(SELECT 1 FROM todo_calendar_mapping m WHERE m.calendar_event_id=e.id AND m.sync_type='recurring')
    ${ids?.length ? `AND e.calendar_id IN (${ids.map(() => "?").join(",")})` : ""}
    ORDER BY e.start_date,e.start_time,e.id LIMIT ? OFFSET ?`
  );
  const physical: Array<{ item: AssistantCalendarEvent; source: "todo"; offset: number }> = [];
  const windowEnd = query.end.length === 10 ? afterDate(query.end) : end;
  let scanned = 0,
    offset = cursor.todo;
  while (physical.length < size + 1 && scanned < 2000) {
    const rows = statement.all(
      afterDate(localDate(end)),
      dateTime(localDate(start)),
      ...(ids ?? []),
      Math.min(100, size + 1 - physical.length),
      offset
    ) as { id: number }[];
    if (!rows.length) break;
    for (const row of rows) {
      scanned++;
      offset++;
      const item = readCalendarEvent(db, row.id),
        from = dateTime(item.start),
        to = dateTime(item.end);
      if (from < windowEnd && (to > start || (from === to && from >= start)))
        physical.push({ item, source: "todo", offset });
    }
  }
  const warnings: string[] = [];
  if (scanned >= 2000) warnings.push("日程候选达到本页扫描上限，请继续分页或缩小时间窗口");
  const markers: AssistantCalendarEvent[] = [];
  const calendars = db
    .prepare(
      `SELECT c.id,c.title FROM calendar c JOIN calendar_group g ON g.id=c.group_id WHERE g.name='待办清单'`
    )
    .all() as Array<{ id: number; title: string }>;
  for (const view of ["occurrences", "tasks"] as const) {
    const calendarId =
      calendars.find(
        calendar => calendar.title === (view === "occurrences" ? "周期任务" : "截止任务")
      )?.id ?? 0;
    if (ids?.length && !ids.includes(calendarId)) continue;
    let taskCursor: string | undefined;
    let pages = 0;
    do {
      const tasks = queryTasks(db, indexDb, databaseName, {
        source: view === "tasks" ? "document" : "all",
        view,
        start: localDate(start),
        end: localDate(end),
        pageSize: 100,
        ...(taskCursor ? { cursor: taskCursor } : {}),
      });
      warnings.push(...tasks.warnings);
      for (const task of tasks.items) {
        if (!task.dueAt || (view === "tasks" && task.recurrence?.length)) continue;
        const day = task.dueAt.slice(0, 10),
          next = new Date(`${day}T12:00:00`);
        next.setDate(next.getDate() + 1);
        const markerKey = `${taskKey(task.taskRef)}:${task.occurrence?.seriesId ?? ""}:${task.occurrence?.occurrenceDate ?? ""}`;
        markers.push({
          eventId: -parseInt(revision(markerKey).slice(0, 10), 16),
          createdAt: task.taskRef.createdAt,
          revision: task.revision,
          title: task.title,
          calendarId,
          start: day,
          end: `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`,
          allDay: true,
          taskRef: task.taskRef,
          ...(task.occurrence ? { occurrence: task.occurrence } : {}),
          writable: false,
        });
      }
      taskCursor = tasks.nextCursor ?? undefined;
      if (++pages >= 10 && taskCursor) {
        warnings.push("任务标记超过本次查询上限，请缩小日期范围");
        break;
      }
    } while (taskCursor);
  }
  markers.sort((a, b) => a.start.localeCompare(b.start) || a.eventId - b.eventId);
  const virtual = markers.slice(cursor.document, cursor.document + size + 1).map((item, index) => ({
    item,
    source: "document" as const,
    offset: cursor.document + index + 1,
  }));
  const combined = [...physical, ...virtual].sort(
    (a, b) => dateTime(a.item.start) - dateTime(b.item.start) || a.item.eventId - b.item.eventId
  );
  const selected = combined.slice(0, size),
    next = { ...cursor };
  for (const value of selected) next[value.source] = value.offset;
  if (!physical.length) next.todo = offset;
  const hasMore = combined.length > size || scanned >= 2000;
  return {
    type: "assistant-calendar",
    databaseName,
    items: selected.map(value => value.item),
    hasMore,
    nextCursor: hasMore ? encodeCursor(next) : null,
    incomplete: !!warnings.length,
    warnings: [...new Set(warnings)],
  };
}

export function queryOperations(
  db: Database.Database,
  databaseName: string,
  query: {
    operationId?: string;
    requestId?: string;
    batchId?: string;
    pageSize?: number;
    cursor?: string;
  }
): AssistantQueryResult<Record<string, unknown>> {
  const cursor = cursorOf(query as Record<string, unknown>),
    size = query.pageSize ?? 20;
  const where = ["1=1"],
    params: string[] = [];
  if (query.operationId) {
    where.push("id=?");
    params.push(query.operationId);
  }
  if (query.requestId) {
    where.push("request_id=?");
    params.push(query.requestId);
  }
  if (query.batchId) {
    where.push("batch_id=?");
    params.push(query.batchId);
  }
  const rows = db
    .prepare(
      `SELECT id,batch_id,request_id,tool_name,status,phase,create_time,undo_until,result_json,error_json
    FROM task_assistant_operation WHERE ${where.join(" AND ")} ORDER BY create_time DESC,id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, size + 1, cursor.todo) as Row[];
  const hasMore = rows.length > size;
  return {
    type: "assistant-operations",
    databaseName,
    items: rows.slice(0, size).map(row => ({
      operationId: row.id,
      requestId: row.request_id,
      batchId: row.batch_id,
      tool: row.tool_name,
      status: row.status,
      phase: row.phase,
      createdAt: row.create_time,
      undoableUntil: row.undo_until,
      undoable:
        (row.status === "succeeded" ||
          (row.status === "pending" && row.phase === "content-applied")) &&
        Number(row.undo_until) > Date.now() &&
        row.tool_name !== "undo_task_operation",
      result: row.result_json ? JSON.parse(String(row.result_json)) : null,
      error: row.error_json ? JSON.parse(String(row.error_json)) : null,
    })),
    hasMore,
    nextCursor: hasMore ? encodeCursor({ ...cursor, todo: cursor.todo + size }) : null,
    incomplete: false,
    warnings: [],
  };
}
