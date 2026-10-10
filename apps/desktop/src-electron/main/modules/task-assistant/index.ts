import { BrowserWindow, ipcMain } from "electron";
import {
  TASK_READ_SCHEMAS,
  TASK_WRITE_SCHEMAS,
  taskKey,
  validateTaskTool,
  type TaskReadName,
  type TaskWriteName,
} from "@tau/shared/task-assistant";
import databaseModule from "../database";
import { broadcastDatabaseChange } from "../database-notifications";
import { reindexDocTasks } from "../doc-tasks/indexer";
import { onContentWritten } from "../content-events";
import { readTaskContent, taskNode } from "../content-task-patches";
import { TaskAssistantEngine, type TaskInput } from "./engine";
import { queryEvents, queryOperations, queryTasks } from "./query";
import { descendantIds } from "./independent";
import { fail } from "./common";
import { syncDocumentSchedules } from "./calendar";
import { readDocumentTask } from "./documents";
import { resolveDocTaskSources } from "../doc-tasks/sources";
import holidayService from "../holiday-service";
import { dateTime, localDate } from "./common";

function notify(databaseName: string) {
  for (const channel of ["task-assistant:changed", "schedule:changed", "doc-tasks:changed"])
    broadcastDatabaseChange(channel, databaseName);
}

class TaskAssistantModule {
  name = "task-assistant";
  private timer?: ReturnType<typeof setInterval>;
  private indexedDays = new Map<string, string>();
  async init() {
    ipcMain.handle(
      "task-assistant:read",
      async (
        event,
        name: TaskReadName,
        args: Record<string, unknown>,
        scope: { databaseName?: string }
      ) => {
        if (!(name in TASK_READ_SCHEMAS)) fail("INVALID_ARGUMENT", "未知查询工具");
        validateTaskTool(name, args);
        const bound = this.bind(event.sender, scope);
        let indexDb = databaseModule.getIndexDatabase(bound.databaseName);
        let indexFailure = false;
        try {
          await databaseModule.ensureIndexDatabaseReady(bound.databaseName, "task-assistant:query");
          bound.check();
          indexDb = databaseModule.getIndexDatabase(bound.databaseName);
        } catch {
          bound.check();
          indexDb = undefined;
          indexFailure = true;
        }
        if (name === "query_calendar_events" || args.view === "occurrences")
          await this.prepareHolidays(bound.db, indexDb, String(args.start), String(args.end));
        bound.check();
        if (name === "query_todos") return queryTasks(bound.db, indexDb, bound.databaseName, args);
        if (name === "query_calendar_events")
          return queryEvents(
            bound.db,
            bound.databaseName,
            args as Parameters<typeof queryEvents>[2],
            indexDb
          );
        const result = queryOperations(bound.db, bound.databaseName, args);
        if (indexFailure) result.warnings.push("文档索引尚未就绪，操作回执不受影响");
        return result;
      }
    );
    ipcMain.handle(
      "task-assistant:preflight",
      (event, name: TaskWriteName, items: TaskInput[], scope: { databaseName?: string }) => {
        if (!(name in TASK_WRITE_SCHEMAS)) fail("INVALID_ARGUMENT", "未知写入工具");
        validateTaskTool(name, { items });
        const { db } = this.bind(event.sender, scope);
        const requests = new Set<string>(),
          targets = new Set<string>();
        for (const item of items) {
          if (requests.has(item.requestId)) fail("INVALID_ARGUMENT", "批量项 requestId 重复");
          requests.add(item.requestId);
          const target = item.taskRef
            ? `${taskKey(item.taskRef)}:${item.occurrence?.seriesId ?? ""}:${item.occurrence?.occurrenceDate ?? ""}`
            : item.eventId
              ? `event:${item.eventId}`
              : item.operationId
                ? `operation:${item.operationId}`
                : null;
          if (target && targets.has(target)) fail("INVALID_ARGUMENT", "同一批次重复操作相同目标");
          if (target) targets.add(target);
        }
        if (name === "delete_todo" || name === "set_todo_completed") {
          for (const item of items) {
            if (item.taskRef?.kind === "todo" && !item.occurrence) {
              const rootId = item.taskRef.todoId;
              const ids = descendantIds(db, rootId).filter(id => id !== rootId);
              if (
                items.some(
                  other => other.taskRef?.kind === "todo" && ids.includes(other.taskRef.todoId)
                )
              )
                fail("INVALID_ARGUMENT", "批次含重叠父子操作，请只保留父项或拆分");
            } else if (item.taskRef?.kind === "document" && name === "delete_todo") {
              const ref = item.taskRef;
              const root = taskNode(readTaskContent(db, ref.contentId, ref.createdAt), ref.taskId);
              if (
                root &&
                items.some(
                  other =>
                    other !== item &&
                    other.taskRef?.kind === "document" &&
                    other.taskRef.contentId === ref.contentId &&
                    !!taskNode([root], other.taskRef.taskId)
                )
              )
                fail("INVALID_ARGUMENT", "批次包含同一正文中重叠的父子删除");
            }
          }
        }
        if (name === "undo_task_operation") {
          const sequence = (item: TaskInput) =>
            (
              db
                .prepare("SELECT rowid AS n FROM task_assistant_operation WHERE id=?")
                .get(item.operationId) as { n: number } | undefined
            )?.n ?? -1;
          return [...items].sort((left, right) => sequence(right) - sequence(left));
        }
        return items;
      }
    );
    ipcMain.handle(
      "task-assistant:write",
      async (
        event,
        name: TaskWriteName,
        item: TaskInput,
        batchId: string,
        conversationKey: string | undefined,
        scope: { databaseName?: string }
      ) => {
        if (!(name in TASK_WRITE_SCHEMAS) || typeof batchId !== "string" || batchId.length > 128)
          fail("INVALID_ARGUMENT", "非法业务操作");
        const { db, databaseName, check } = this.bind(event.sender, scope);
        if (item.occurrence)
          await this.prepareHolidays(
            db,
            databaseModule.getIndexDatabase(databaseName),
            item.occurrence.occurrenceDate,
            item.occurrence.occurrenceDate
          );
        check();
        const result = new TaskAssistantEngine(db).execute(name, item, batchId, conversationKey);
        if (result.status === "succeeded" || result.status === "pending") {
          const indexDb = databaseModule.getIndexDatabase(databaseName);
          const contentId =
            item.taskRef?.kind === "document" ? item.taskRef.contentId : item.document?.contentId;
          if (indexDb && contentId) {
            try {
              reindexDocTasks(db, indexDb, [contentId]);
            } catch {
              /* 正文写入总线会重试可重建的索引。 */
            }
          }
          notify(databaseName);
        }
        return result;
      }
    );
    const recover = () => {
      for (const [name, db] of databaseModule.databases) {
        if (!db.open || db.inTransaction) continue;
        try {
          const before = (db.prepare("SELECT total_changes() n").get() as { n: number }).n;
          const engine = new TaskAssistantEngine(db);
          engine.recoverPending();
          engine.prune();
          const day = localDate(Date.now()),
            indexDb = databaseModule.getIndexDatabase(name);
          if (indexDb && this.indexedDays.get(name) !== day) {
            const rows = indexDb
              .prepare("SELECT DISTINCT content_id FROM doc_task_attributes WHERE recurring=1")
              .all() as Array<{ content_id: number }>;
            for (let offset = 0; offset < rows.length; offset += 50)
              reindexDocTasks(
                db,
                indexDb,
                rows.slice(offset, offset + 50).map(row => row.content_id)
              );
            this.indexedDays.set(name, day);
          }
          const links = db
            .prepare(
              "SELECT DISTINCT content_id,content_created_at,task_id FROM doc_task_calendar_link"
            )
            .all() as Array<{ content_id: number; content_created_at: number; task_id: string }>;
          const sources = resolveDocTaskSources(
            db,
            links.map(link => link.content_id)
          );
          db.transaction(() => {
            for (const link of links) {
              const ref = {
                kind: "document" as const,
                contentId: link.content_id,
                createdAt: link.content_created_at,
                taskId: link.task_id,
              };
              const row = db
                .prepare("SELECT 1 FROM contents WHERE id=? AND create_time=?")
                .get(ref.contentId, ref.createdAt);
              const exists =
                row &&
                sources.has(ref.contentId) &&
                taskNode(readTaskContent(db, ref.contentId, ref.createdAt), ref.taskId);
              syncDocumentSchedules(db, ref, exists ? readDocumentTask(db, ref).title : null);
            }
          })();
          if ((db.prepare("SELECT total_changes() n").get() as { n: number }).n !== before)
            notify(name);
          void this.prepareHolidays(
            db,
            databaseModule.getIndexDatabase(name),
            new Date(Date.now() - 86_400_000).toISOString().slice(0, 10),
            new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
          ).catch(() => undefined);
        } catch (error) {
          console.error("[task-assistant] 恢复操作失败", { databaseName: name, error });
        }
      }
    };
    databaseModule.onDatabaseConnected(() => {
      recover();
    });
    onContentWritten(({ dbName, contentId }) => {
      // 正文通知可能发生在事务内，提交后读取最新状态再协调关联安排。
      setTimeout(() => {
        const db = databaseModule.getDatabase(dbName);
        if (!db?.open || db.inTransaction) return;
        const links = db
          .prepare(
            "SELECT DISTINCT content_created_at,task_id FROM doc_task_calendar_link WHERE content_id=?"
          )
          .all(contentId) as Array<{ content_created_at: number; task_id: string }>;
        if (!links.length) return;
        try {
          db.transaction(() => {
            for (const link of links) {
              const ref = {
                kind: "document" as const,
                contentId,
                createdAt: link.content_created_at,
                taskId: link.task_id,
              };
              let title: string | null = null;
              const exists = db
                .prepare("SELECT 1 FROM contents WHERE id=? AND create_time=?")
                .get(contentId, ref.createdAt);
              if (exists && taskNode(readTaskContent(db, contentId, ref.createdAt), ref.taskId))
                title = readDocumentTask(db, ref).title;
              syncDocumentSchedules(db, ref, title);
            }
          })();
          notify(dbName);
        } catch (error) {
          console.error("[task-assistant] 正文安排联动失败", { dbName, contentId, error });
        }
      }, 0);
    });
    this.timer = setInterval(recover, 60_000);
    this.timer.unref();
    recover();
  }
  private bind(sender: Electron.WebContents, scope: { databaseName?: string }) {
    const win = BrowserWindow.fromWebContents(sender);
    const databaseName = win ? databaseModule.windowToDatabase.get(win.id) : undefined;
    if (
      !win ||
      !databaseName ||
      !scope?.databaseName ||
      databaseModule.formatDatabaseName(scope.databaseName) !==
        databaseModule.formatDatabaseName(databaseName)
    )
      return fail("DATABASE_CHANGED", "数据库已切换，请重新操作");
    const db = databaseModule.getDatabase(databaseName);
    if (!db?.open) return fail("DATABASE_NOT_READY", "数据库尚未就绪");
    const check = () => {
      if (
        sender.isDestroyed() ||
        databaseModule.windowToDatabase.get(win.id) !== databaseName ||
        databaseModule.getDatabase(databaseName) !== db ||
        !db.open
      )
        fail("DATABASE_CHANGED", "数据库连接已变化");
    };
    return { db, databaseName, check };
  }
  private async prepareHolidays(
    db: import("better-sqlite3").Database,
    indexDb: import("better-sqlite3").Database | undefined,
    start: string,
    end: string
  ) {
    const needed =
      db.prepare("SELECT 1 FROM todo_recurrence WHERE exclude_holidays=1 LIMIT 1").get() ||
      db
        .prepare(
          "SELECT 1 FROM todo_recurrence_history WHERE json_extract(rule_json,'$.excludeHolidays')=1 LIMIT 1"
        )
        .get() ||
      indexDb
        ?.prepare(
          "SELECT 1 FROM doc_task_attributes WHERE instr(attributes_json,'\"excludeHolidays\":true')>0 LIMIT 1"
        )
        .get();
    if (!needed) return;
    const from = dateTime(start) - 366 * 86_400_000,
      to = dateTime(end);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to - from > 733 * 86_400_000) return;
    const dates: number[] = [];
    for (const day = new Date(from); day.getTime() <= to; day.setDate(day.getDate() + 1))
      dates.push(day.getTime());
    await holidayService.areHolidays(dates);
  }
}
export default new TaskAssistantModule();
