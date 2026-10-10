import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  TaskAssistantError,
  TASK_WRITE_SCHEMAS,
  validateTaskValue,
  type TaskOperationResult,
  type TaskWriteName,
  type TaskRef,
  type TaskOccurrenceRef,
  type TaskRecurrenceRule,
  occurrenceKey,
} from "@tau/shared/task-assistant";
import {
  applyTaskContentPatch,
  readTaskContent,
  taskNode,
  hasTaskContentReceipt,
} from "../content-task-patches";
import {
  prepareDocumentCreate,
  prepareDocumentEdit,
  prepareDocumentUndo,
  readDocumentTask,
  documentSnapshot,
  type DocumentEdit,
  type DocumentSnapshot,
} from "./documents";
import {
  captureTodos,
  captureEvents,
  captureKnown,
  mergeSnapshots,
  pinSnapshot,
  releasePins,
  restoreSnapshot,
  snapshotEffects,
  type Snapshot,
} from "./snapshots";
import {
  createIndependent,
  descendantIds,
  mutateIndependent,
  readIndependentTask,
} from "./independent";
import { createEvent, documentEventIds, mutateEvent, syncDocumentSchedules } from "./calendar";
import {
  canonical,
  checkRevision,
  fail,
  revision,
  todoRow,
  instanceRevision,
  requireCalendar,
  parseSchedule,
} from "./common";
import { independentStates } from "./recurrence";
import { assertTaskOccurrence as assertOccurrence } from "./holidays";

export interface TaskInput {
  requestId: string;
  taskRef?: TaskRef;
  revision?: string;
  title?: string;
  groupId?: number;
  parentRef?: TaskRef;
  dueAt?: string | null;
  reminderAt?: string | null;
  recurrence?: TaskRecurrenceRule;
  document?: { contentId: number; createdAt: number; revision: string; afterTaskId?: string };
  patch?: Record<string, unknown>;
  completed?: boolean;
  children?: string;
  occurrence?: TaskOccurrenceRef;
  action?: string;
  scheduledAt?: string;
  effectiveDate?: string;
  rule?: TaskRecurrenceRule | null;
  calendarId?: number;
  eventId?: number;
  createdAt?: number;
  start?: string;
  end?: string;
  allDay?: boolean;
  schedule?: { calendarId?: number; start: string; end: string; allDay: boolean };
  operationId?: string;
}
interface SavedState {
  rows: Snapshot;
  document?: DocumentSnapshot;
  taskRef?: TaskRef;
}
interface OperationRow {
  id: string;
  batch_id: string;
  request_id: string;
  tool_name: TaskWriteName;
  request_hash: string;
  request_json: string;
  status: string;
  phase: string;
  before_json: string | null;
  after_json: string | null;
  result_json: string | null;
  error_json: string | null;
  create_time: number;
  undo_until: number;
}
const RETENTION = 30 * 86_400_000;
const parseState = (value: string | null): SavedState => (value ? JSON.parse(value) : { rows: {} });
export const readTask = (db: Database.Database, ref: TaskRef) =>
  ref.kind === "todo" ? readIndependentTask(db, ref) : readDocumentTask(db, ref);
export function taskError(error: unknown) {
  if (error instanceof TaskAssistantError) return { code: error.code, message: error.message };
  const message = error instanceof Error ? error.message : "业务操作失败";
  return {
    code: /COLLABORATION_WRITE_REQUIRED/.test(message)
      ? "READ_ONLY"
      : /CONTENT_SESSION_LOCKED/.test(message)
        ? "CONTENT_BUSY"
        : "EXECUTION_FAILED",
    message,
  };
}

export class TaskAssistantEngine {
  constructor(readonly db: Database.Database) {}

  private taskIds(input: TaskInput): number[] {
    if (input.taskRef?.kind !== "todo") return [];
    const ids = descendantIds(this.db, input.taskRef.todoId);
    // 移动可能重排目标兄弟；将这些真实影响也纳入撤销快照。
    if (input.patch && ("groupId" in input.patch || "parentRef" in input.patch)) {
      const current = todoRow(this.db, input.taskRef);
      const parent = input.patch.parentRef as TaskRef | null;
      const group =
        input.patch.groupId ?? (parent ? todoRow(this.db, parent).group_id : current.group_id);
      const rows = this.db
        .prepare("SELECT id FROM todo_item WHERE group_id=? LIMIT 1001")
        .all(group) as { id: number }[];
      if (rows.length > 1000) fail("LIMIT_EXCEEDED", "目标项目过大，请在待办页面移动");
      ids.push(...rows.map(row => row.id));
    }
    return [...new Set(ids)];
  }

  private documentEvents(snapshot: DocumentSnapshot): number[] {
    const ids: number[] = [];
    const walk = (node: NonNullable<DocumentSnapshot["node"]>) => {
      if (node.type === "check-list-item" && node.taskId)
        ids.push(...documentEventIds(this.db, { ...snapshot.ref, taskId: node.taskId }));
      node.children?.forEach(walk);
    };
    if (snapshot.node) walk(snapshot.node);
    return ids;
  }

  private insert(
    operationId: string,
    batchId: string,
    name: TaskWriteName,
    input: TaskInput,
    hash: string,
    conversationKey?: string
  ) {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO task_assistant_operation
      (id,batch_id,request_id,tool_name,request_hash,request_json,conversation_key,status,phase,create_time,update_time,undo_until)
      VALUES (?,?,?,?,?,?,?,'pending','prepared',?,?,?)`
      )
      .run(
        operationId,
        batchId,
        input.requestId,
        name,
        hash,
        JSON.stringify(input),
        conversationKey ?? null,
        now,
        now,
        now + RETENTION
      );
  }
  private save(
    id: string,
    before: SavedState,
    after: SavedState,
    result: unknown,
    phase = "committed"
  ) {
    const effects = snapshotEffects(before.rows, after.rows);
    if (before.document || after.document)
      effects.document_task = {
        created: !before.document?.node && !!after.document?.node ? 1 : 0,
        deleted: !!before.document?.node && !after.document?.node ? 1 : 0,
        updated: !!before.document?.node && !!after.document?.node ? 1 : 0,
      };
    const outcome =
      typeof result === "object" && result ? { ...result, effects } : { value: result, effects };
    this.db
      .prepare(
        `UPDATE task_assistant_operation SET before_json=?,after_json=?,result_json=?,status='succeeded',phase=?,error_json=NULL,update_time=? WHERE id=?`
      )
      .run(
        JSON.stringify(before),
        JSON.stringify(after),
        JSON.stringify(outcome),
        phase,
        Date.now(),
        id
      );
  }
  private savedResult(row: OperationRow): TaskOperationResult {
    return {
      requestId: row.request_id,
      operationId: row.id,
      status:
        row.status === "failed" ? "failed" : row.status === "pending" ? "pending" : "succeeded",
      ...(row.result_json ? { result: JSON.parse(row.result_json) } : {}),
      ...(row.error_json ? { error: JSON.parse(row.error_json) } : {}),
      ...((row.status === "succeeded" ||
        (row.status === "pending" && row.phase === "content-applied")) &&
      row.tool_name !== "undo_task_operation" &&
      row.undo_until > Date.now()
        ? { undoableUntil: row.undo_until }
        : {}),
    };
  }
  private byId(id: string) {
    return this.db
      .prepare("SELECT * FROM task_assistant_operation WHERE id=?")
      .get(id) as OperationRow;
  }

  execute(
    name: TaskWriteName,
    input: TaskInput,
    batchId: string,
    conversationKey?: string
  ): TaskOperationResult {
    let operationId: string | undefined;
    let validated = false;
    try {
      if (this.db.inTransaction) fail("DATABASE_BUSY", "数据库正在提交其他操作，请稍后重试");
      validateTaskValue(TASK_WRITE_SCHEMAS[name], input);
      validated = true;
      const hash = revision({ name, input });
      const previous = this.db
        .prepare("SELECT * FROM task_assistant_operation WHERE request_id=?")
        .get(input.requestId) as OperationRow | undefined;
      if (previous) {
        if (previous.request_hash !== hash)
          return fail("IDEMPOTENCY_CONFLICT", "同一 requestId 不能用于不同操作或参数");
        operationId = previous.id;
        if (previous.status === "pending") this.recover(previous);
        if (previous.status !== "failed") return this.savedResult(this.byId(previous.id));
        this.db
          .prepare("DELETE FROM task_assistant_operation WHERE id=? AND status='failed'")
          .run(previous.id);
      }
      operationId = randomUUID();
      let edit: DocumentEdit | undefined;
      if (name === "create_todo" && input.document)
        edit = prepareDocumentCreate(this.db, input as Parameters<typeof prepareDocumentCreate>[1]);
      else if (input.taskRef?.kind === "document" && name !== "create_calendar_event")
        edit = prepareDocumentEdit(this.db, input.taskRef, input.revision!, name, input);
      if (edit) {
        if (input.schedule) {
          requireCalendar(this.db, input.schedule.calendarId);
          parseSchedule(input.schedule);
        }
        this.executeDocument(operationId, batchId, name, input, hash, edit, conversationKey);
      } else if (name === "undo_task_operation") {
        this.executeUndo(operationId, batchId, input, hash, conversationKey);
      } else {
        this.db.transaction(() => {
          this.insert(operationId!, batchId, name, input, hash, conversationKey);
          if (input.taskRef) {
            const target = readTask(this.db, input.taskRef);
            let expected = target.revision;
            if (input.occurrence && input.revision !== expected) {
              const states =
                input.taskRef.kind === "todo"
                  ? independentStates(this.db, input.taskRef)
                  : (taskNode(
                      readTaskContent(this.db, input.taskRef.contentId, input.taskRef.createdAt),
                      input.taskRef.taskId
                    )?.taskOccurrenceState ?? {});
              expected = instanceRevision(
                target,
                input.occurrence,
                states[occurrenceKey(input.occurrence)] ?? {}
              );
            }
            checkRevision(input.revision, expected);
            if (!target.writable) fail("READ_ONLY", target.readonlyReason ?? "待办不可写");
            if (
              name === "create_calendar_event" &&
              (target.recurrence?.length || input.occurrence)
            ) {
              if (!input.occurrence) fail("INVALID_ARGUMENT", "安排周期任务时必须指定具体实例");
              assertOccurrence(target.recurrence ?? [], input.occurrence!);
            }
          }
          const todoIds = this.taskIds(input);
          const before: SavedState = {
            rows: mergeSnapshots(
              captureTodos(this.db, todoIds),
              captureEvents(this.db, input.eventId ? [input.eventId] : [])
            ),
            taskRef: input.taskRef,
          };
          pinSnapshot(this.db, operationId!, before.rows);
          let result: unknown;
          let eventId = input.eventId;
          let ref = input.taskRef;
          if (name === "create_todo") {
            ref = createIndependent(this.db, input as Parameters<typeof createIndependent>[1]);
            todoIds.push(ref.todoId);
            if (input.schedule)
              eventId = createEvent(
                this.db,
                { ...input.schedule, taskRef: ref },
                input.title
              ).eventId;
            result = readTask(this.db, ref);
          } else if (name === "create_calendar_event") {
            result = createEvent(
              this.db,
              input as Parameters<typeof createEvent>[1],
              ref ? readTask(this.db, ref).title : undefined
            );
            eventId = (result as { eventId: number }).eventId;
          } else if (name === "update_calendar_event" || name === "delete_calendar_event") {
            result = mutateEvent(
              this.db,
              input as Parameters<typeof mutateEvent>[1],
              name === "delete_calendar_event"
            );
          } else {
            if (ref?.kind !== "todo") fail("INVALID_ARGUMENT", "缺少待办身份");
            mutateIndependent(this.db, ref as Extract<TaskRef, { kind: "todo" }>, name, input);
            result = name === "delete_todo" ? { deleted: ref } : readTask(this.db, ref!);
          }
          const after: SavedState = {
            rows: mergeSnapshots(
              captureKnown(this.db, before.rows),
              captureTodos(this.db, todoIds),
              captureEvents(this.db, eventId ? [eventId] : [])
            ),
            taskRef: ref,
          };
          pinSnapshot(this.db, operationId!, after.rows);
          this.save(operationId!, before, after, result);
        })();
      }
      return this.savedResult(this.byId(operationId));
    } catch (error) {
      const detail = taskError(error);
      const row = operationId ? this.byId(operationId) : undefined;
      if (row?.status === "pending") {
        const before = parseState(row.before_json),
          after = parseState(row.after_json);
        if (before.document && after.document) {
          const ref = before.document.ref;
          const current = documentSnapshot(
            readTaskContent(this.db, ref.contentId, ref.createdAt),
            ref
          );
          if (
            canonical(current.node) === canonical(before.document.node) &&
            canonical(current.node) !== canonical(after.document.node)
          ) {
            this.db.transaction(() => {
              releasePins(this.db, row.id);
              this.db
                .prepare(
                  "UPDATE task_assistant_operation SET status='failed',error_json=?,update_time=? WHERE id=?"
                )
                .run(JSON.stringify(detail), Date.now(), row.id);
            })();
            return this.savedResult(this.byId(row.id));
          }
        }
        this.db
          .prepare("UPDATE task_assistant_operation SET error_json=?,update_time=? WHERE id=?")
          .run(JSON.stringify(detail), Date.now(), row.id);
        return this.savedResult(this.byId(row.id));
      }
      if (
        validated &&
        operationId &&
        !row &&
        !this.db
          .prepare("SELECT 1 FROM task_assistant_operation WHERE request_id=?")
          .get(input.requestId)
      ) {
        this.db.transaction(() => {
          this.insert(
            operationId!,
            batchId,
            name,
            input,
            revision({ name, input }),
            conversationKey
          );
          this.db
            .prepare("UPDATE task_assistant_operation SET status='failed',error_json=? WHERE id=?")
            .run(JSON.stringify(detail), operationId!);
        })();
        return this.savedResult(this.byId(operationId));
      }
      return { requestId: input?.requestId ?? "", status: "failed", error: detail };
    }
  }

  private executeDocument(
    id: string,
    batch: string,
    name: TaskWriteName,
    input: TaskInput,
    hash: string,
    edit: DocumentEdit,
    conversation?: string
  ) {
    const before: SavedState = {
      rows: captureEvents(this.db, this.documentEvents(edit.before)),
      document: edit.before,
      taskRef: edit.before.ref,
    };
    const intended: SavedState = { rows: {}, document: edit.after, taskRef: edit.after.ref };
    this.db.transaction(() => {
      this.insert(id, batch, name, input, hash, conversation);
      pinSnapshot(this.db, id, before.rows);
      this.db
        .prepare("UPDATE task_assistant_operation SET before_json=?,after_json=? WHERE id=?")
        .run(JSON.stringify(before), JSON.stringify(intended), id);
    })();
    this.applyDocumentEdit(edit, id);
    this.finishDocument(this.byId(id));
  }

  private applyDocumentEdit(edit: DocumentEdit, id: string) {
    const ref = edit.before.ref;
    this.db.transaction(() => {
      applyTaskContentPatch(this.db, ref.contentId, ref.createdAt, edit.previous, edit.next, id);
      this.db
        .prepare(
          "UPDATE task_assistant_operation SET phase='content-applied',update_time=? WHERE id=?"
        )
        .run(Date.now(), id);
    })();
  }

  private finishDocument(row: OperationRow) {
    const before = parseState(row.before_json),
      intended = parseState(row.after_json);
    const ref = intended.document!.ref;
    this.db.transaction(() => {
      const tree = readTaskContent(this.db, ref.contentId, ref.createdAt);
      const walk = (node: NonNullable<DocumentSnapshot["node"]>) => {
        if (node.type === "check-list-item" && node.taskId) {
          const source = { ...ref, taskId: node.taskId };
          const current = taskNode(tree, node.taskId);
          syncDocumentSchedules(
            this.db,
            source,
            current ? readDocumentTask(this.db, source).title : null
          );
        }
        node.children?.forEach(walk);
      };
      if (before.document?.node) walk(before.document.node);
      if (intended.document?.node) walk(intended.document.node);
      const input: TaskInput = JSON.parse(row.request_json);
      let eventId: number | undefined;
      if (input.schedule && intended.document?.node)
        eventId = createEvent(
          this.db,
          { ...input.schedule, taskRef: ref },
          readTask(this.db, ref).title
        ).eventId;
      const after: SavedState = {
        rows: mergeSnapshots(
          captureKnown(this.db, before.rows),
          captureEvents(this.db, [...documentEventIds(this.db, ref), ...(eventId ? [eventId] : [])])
        ),
        document: intended.document,
        taskRef: ref,
      };
      pinSnapshot(this.db, row.id, after.rows);
      const result = intended.document!.node ? readTask(this.db, ref) : { deleted: ref };
      this.save(row.id, before, after, result);
    })();
  }

  recover(row: OperationRow) {
    if (row.status !== "pending" || !row.before_json || !row.after_json) return;
    const before = parseState(row.before_json),
      intended = parseState(row.after_json);
    if (!intended.document || !before.document) return;
    const ref = intended.document.ref;
    const tree = readTaskContent(this.db, ref.contentId, ref.createdAt);
    const current = documentSnapshot(tree, ref);
    if (
      hasTaskContentReceipt(this.db, ref.contentId, row.id) ||
      row.phase === "content-applied" ||
      canonical(current.node) === canonical(intended.document.node)
    ) {
      this.db
        .prepare("UPDATE task_assistant_operation SET phase='content-applied' WHERE id=?")
        .run(row.id);
      if (row.tool_name === "undo_task_operation") this.finishUndo(row);
      else this.finishDocument(row);
      return;
    }
    if (canonical(current.node) !== canonical(before.document.node))
      fail("VERSION_CONFLICT", "中断期间正文已变化，需人工核对该操作");
    const edit = prepareDocumentUndo(this.db, intended.document, before.document);
    this.applyDocumentEdit(edit, row.id);
    if (row.tool_name === "undo_task_operation") this.finishUndo(row);
    else this.finishDocument(row);
  }

  private executeUndo(
    id: string,
    batch: string,
    input: TaskInput,
    hash: string,
    conversation?: string
  ) {
    const original = this.byId(input.operationId!);
    if (
      !original ||
      !(
        original.status === "succeeded" ||
        (original.status === "pending" && original.phase === "content-applied")
      ) ||
      original.undo_until <= Date.now() ||
      original.tool_name === "undo_task_operation"
    )
      fail("NOT_UNDOABLE", "操作不存在、已经撤销或撤销期限已过");
    const before = parseState(original.before_json),
      after = parseState(original.after_json);
    if (original.status === "pending") after.rows = before.rows;
    if (after.document?.node) {
      const known = new Set((after.rows.calendar_event ?? []).map(row => Number(row.id)));
      if (this.documentEvents(after.document).some(id => !known.has(id)))
        fail("UNDO_CONFLICT", "正文待办新增了安排，不能自动撤销");
    }
    if (
      after.taskRef?.kind === "todo" &&
      after.rows.todo_item?.some(
        row => row.id === (after.taskRef as Extract<TaskRef, { kind: "todo" }>).todoId
      )
    ) {
      const actual = captureTodos(this.db, descendantIds(this.db, after.taskRef.todoId));
      for (const [table, rows] of Object.entries(actual)) {
        const expected = new Set((after.rows[table] ?? []).map(row => canonical(row)));
        if (rows.some(row => !expected.has(canonical(row))))
          fail("UNDO_CONFLICT", "待办的关联关系已有后续修改");
      }
    }
    restoreSnapshot(this.db, before.rows, after.rows, true);
    const edit =
      before.document && after.document
        ? prepareDocumentUndo(this.db, before.document, after.document)
        : undefined;
    if (edit) {
      this.db.transaction(() => {
        this.insert(id, batch, "undo_task_operation", input, hash, conversation);
        this.db
          .prepare(
            "UPDATE task_assistant_operation SET before_json=?,after_json=?,phase='undo-prepared' WHERE id=?"
          )
          .run(JSON.stringify(after), JSON.stringify(before), id);
      })();
      this.applyDocumentEdit(edit, id);
    }
    if (edit) this.finishUndo(this.byId(id));
    else
      this.db.transaction(() => {
        this.insert(id, batch, "undo_task_operation", input, hash, conversation);
        this.finishUndo(this.byId(id));
      })();
  }

  private finishUndo(row: OperationRow) {
    const input: TaskInput = JSON.parse(row.request_json);
    const original = this.byId(input.operationId!);
    if (
      !original ||
      !(
        original.status === "succeeded" ||
        (original.status === "pending" && original.phase === "content-applied")
      )
    )
      fail("NOT_UNDOABLE", "原操作已撤销或不可用");
    const before = parseState(original.before_json),
      after = parseState(original.after_json);
    if (original.status === "pending") after.rows = before.rows;
    this.db.transaction(() => {
      restoreSnapshot(this.db, before.rows, after.rows);
      this.db
        .prepare("UPDATE task_assistant_operation SET status='undone',update_time=? WHERE id=?")
        .run(Date.now(), original.id);
      releasePins(this.db, original.id);
      this.save(row.id, { rows: {} }, { rows: {} }, { undoneOperationId: original.id });
    })();
  }

  recoverPending() {
    const rows = this.db
      .prepare(
        "SELECT * FROM task_assistant_operation WHERE status='pending' ORDER BY update_time,id LIMIT 50"
      )
      .all() as OperationRow[];
    for (const row of rows) {
      try {
        this.recover(row);
      } catch (error) {
        const detail = taskError(error);
        const current = this.byId(row.id);
        if (
          ["prepared", "undo-prepared"].includes(current.phase) &&
          ["VERSION_CONFLICT", "UNDO_CONFLICT", "NOT_FOUND"].includes(detail.code)
        ) {
          this.db.transaction(() => {
            releasePins(this.db, row.id);
            this.db
              .prepare(
                "UPDATE task_assistant_operation SET status='failed',error_json=?,update_time=? WHERE id=?"
              )
              .run(JSON.stringify(detail), Date.now(), row.id);
          })();
          continue;
        }
        this.db
          .prepare("UPDATE task_assistant_operation SET error_json=?,update_time=? WHERE id=?")
          .run(JSON.stringify(detail), Date.now(), row.id);
      }
    }
  }
  prune() {
    const rows = this.db
      .prepare(
        "SELECT id FROM task_assistant_operation WHERE undo_until<? AND before_json IS NOT NULL AND status<>'pending' LIMIT 50"
      )
      .all(Date.now()) as { id: string }[];
    for (const row of rows)
      this.db.transaction(() => {
        releasePins(this.db, row.id);
        this.db
          .prepare(
            "UPDATE task_assistant_operation SET before_json=NULL,after_json=NULL,request_json=NULL WHERE id=?"
          )
          .run(row.id);
      })();
  }
}
