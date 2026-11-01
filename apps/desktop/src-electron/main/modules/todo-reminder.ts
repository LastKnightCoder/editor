import { ipcMain } from "electron";
import type Database from "better-sqlite3";
import { joinTodoReminders, reminderBody } from "@tau/shared/reminders";
import { getMainWindows, routeNotification, showOrCreateMainWindow } from "../windows";
import { Module } from "../types/module";
import databaseModule from "./database";
import ItemReminderTable from "./tables/item-reminder";
import log from "electron-log";
import { assistantReminders, assistantReminderKey } from "./task-assistant/reminders";
import { taskKey, type TaskRef, type TaskOccurrenceRef } from "@tau/shared/task-assistant";

interface PendingReminder {
  todoItem: any; // TodoItem 对象
  recurrenceDate?: number; // 对于周期任务，这是具体的计划日期
  remindAt: number;
  taskRef?: TaskRef;
}

interface InternalReminder {
  todoId?: number;
  eventId?: number;
  taskRef?: TaskRef;
  occurrence?: TaskOccurrenceRef;
  title: string;
  /** 待办为截止时间，日程为开始时间（全天为当天零点）；没有截止时间的文档待办为 null */
  dueAt: number | null;
  remindAt: number;
  type: "deadline" | "recurring" | "event";
  recurrenceDate?: number;
  allDay?: boolean;
  endAt?: number | null;
}

const MINUTE = 60 * 1000;

/** 日程提醒（不含由待办安排生成的日程，它们跟随待办自身的提醒） */
function eventReminders(db: Database.Database, from: number, to: number) {
  const rows = db
    .prepare(
      `SELECT e.id, e.title, e.start_date, e.start_time, e.end_date, e.end_time, e.all_day, r.offset_ms
       FROM item_reminder r JOIN calendar_event e ON r.owner_type = 'event' AND r.owner_id = e.id
       WHERE e.todo_item_id IS NULL`
    )
    .all() as Array<{
    id: number;
    title: string;
    start_date: number;
    start_time: number | null;
    end_date: number | null;
    end_time: number | null;
    all_day: number;
    offset_ms: number;
  }>;
  const result: Array<Omit<InternalReminder, "type">> = [];
  for (const row of rows) {
    const allDay = !!row.all_day || row.start_time == null;
    const dueAt = row.start_date + (allDay ? 0 : (row.start_time ?? 0) * MINUTE);
    const remindAt = dueAt - row.offset_ms;
    if (remindAt <= from || remindAt > to) continue;
    result.push({
      eventId: row.id,
      title: row.title,
      dueAt,
      remindAt,
      allDay,
      endAt:
        allDay || row.end_time == null
          ? null
          : (row.end_date ?? row.start_date) + row.end_time * MINUTE,
    });
  }
  return result;
}

class TodoReminderModule implements Module {
  name: string;
  private checkInterval: NodeJS.Timeout | null = null;
  private remindedItems: Set<string> = new Set(); // 已提醒的任务（避免重复提醒）
  private readonly CHECK_INTERVAL = 60 * 1000; // 每分钟检查一次

  constructor() {
    this.name = "todo-reminder";
  }

  async init(): Promise<void> {
    // 注册 IPC 事件
    ipcMain.handle("todo-reminder:get-pending", async () => {
      return this.getPendingReminders();
    });

    ipcMain.handle(
      "todo-reminder:dismiss",
      async (_event, { todoId, recurrenceDate }: { todoId: number; recurrenceDate?: number }) => {
        this.dismissReminder(todoId, recurrenceDate);
      }
    );

    ipcMain.handle("todo-reminder:dismiss-all", async () => {
      this.dismissAllReminders();
    });

    // 监听数据库变化
    databaseModule.onDatabaseChange(() => {
      // 数据库切换时清空已提醒列表
      this.remindedItems.clear();
    });

    // 启动定时检查
    this.startChecking();

    log.info("TodoReminderModule initialized");
  }

  private startChecking(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    // 立即执行一次检查
    this.checkReminders();

    // 设置定时检查
    this.checkInterval = setInterval(() => {
      this.checkReminders();
    }, this.CHECK_INTERVAL);
  }

  private stopChecking(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  private checkReminders(): void {
    const db = databaseModule.getCurrentDatabase();
    if (!db) return;

    const now = Date.now();
    const pendingReminders = this.getInternalRemindersFromDb(db, now);

    for (const reminder of pendingReminders) {
      const reminderId = this.reminderKey(reminder);

      // 跳过已提醒的
      if (this.remindedItems.has(reminderId)) {
        continue;
      }

      // 检查是否到了提醒时间
      if (reminder.remindAt <= now) {
        this.sendReminder(reminder);
        this.remindedItems.add(reminderId);
      }
    }
  }

  /** 提醒去重键：assistant 来源用共享 key，普通截止任务用 todoId + 提醒时间 */
  private reminderKey(reminder: InternalReminder): string {
    if (reminder.taskRef) return assistantReminderKey({ ...reminder, taskRef: reminder.taskRef });
    if (reminder.eventId != null) return `event-${reminder.eventId}-${reminder.remindAt}`;
    return `${reminder.todoId}-${reminder.remindAt}${reminder.recurrenceDate ? `-${reminder.recurrenceDate}` : ""}`;
  }

  private getInternalRemindersFromDb(
    db: ReturnType<typeof databaseModule.getDatabase>,
    now: number
  ): InternalReminder[] {
    if (!db) return [];

    try {
      // 查询需要提醒的截止任务和计划任务
      const rows = db
        .prepare(
          `SELECT
            id, title, type, due_at, start_at, remind_before
          FROM todo_item
          WHERE is_completed = 0
            AND is_archived = 0
            AND type = 'deadline'
            AND remind_before IS NOT NULL
            AND due_at IS NOT NULL`
        )
        .all() as Array<{
        id: number;
        title: string;
        type: string;
        due_at: number;
        start_at: number | null;
        remind_before: number;
      }>;

      const reminders: InternalReminder[] = [];
      const extras = ItemReminderTable.extrasByOwner(db, "todo");
      const inWindow = (remindAt: number) =>
        remindAt > now - 24 * 60 * 60 * 1000 && remindAt <= now + 24 * 60 * 60 * 1000;

      for (const row of rows) {
        for (const offset of joinTodoReminders(row.remind_before, extras.get(row.id) ?? [])) {
          const remindAt = row.due_at - offset;
          if (inWindow(remindAt))
            reminders.push({
              todoId: row.id,
              title: row.title,
              dueAt: row.due_at,
              remindAt,
              type: "deadline",
            });
        }
      }

      for (const event of eventReminders(db, now - 24 * 60 * 60 * 1000, now))
        reminders.push({ ...event, type: "event" });

      const name = databaseModule.getCurrentDatabaseName();
      const indexDb = name ? databaseModule.getIndexDatabase(name) : undefined;
      for (const reminder of assistantReminders(db, indexDb, now))
        reminders.push({
          ...reminder,
          todoId: reminder.taskRef.kind === "todo" ? reminder.taskRef.todoId : undefined,
          type: reminder.occurrence ? "recurring" : "deadline",
        });
      return reminders;
    } catch (error) {
      log.error("Failed to get pending reminders:", error);
      return [];
    }
  }

  private sendReminder(reminder: InternalReminder): void {
    // 系统级提醒经通知分流（失焦进系统通知窗口）：sticky 常驻到用户处理；
    // 「查看」带 reveal，由系统通知窗口先把主窗口带到前台
    const isEvent = reminder.type === "event";
    routeNotification(
      {
        id: `todo-reminder:${this.reminderKey(reminder)}`,
        title: reminder.title,
        body: reminderBody({
          kind: isEvent ? "event" : "todo",
          anchor: reminder.dueAt,
          remindAt: Date.now(),
          allDay: reminder.allDay,
          end: reminder.endAt,
        }),
        source: isEvent ? "日程" : "待办",
        icon: "calendarClock",
        tone: "neutral",
        sticky: true,
        actions: [{ label: "查看", primary: true, reveal: true }],
      },
      { kind: "main", handlers: [() => this.openInMainWindow(reminder)] }
    );

    log.info(
      "Sent reminder",
      reminder.taskRef
        ? taskKey(reminder.taskRef)
        : (reminder.todoId ?? `event-${reminder.eventId}`)
    );
  }

  /** 「查看」：主窗口打开对应待办 / 日程（文档待办只带回窗口） */
  private openInMainWindow(reminder: InternalReminder) {
    showOrCreateMainWindow();
    const [win] = getMainWindows();
    if (!win) return;
    const target =
      reminder.eventId != null
        ? { page: "schedule", params: { eventId: reminder.eventId } }
        : reminder.todoId != null
          ? { page: "todos", params: { selectedId: reminder.todoId } }
          : null;
    if (target) win.webContents.send("reminder:open", target);
  }

  private getPendingReminders(): PendingReminder[] {
    const db = databaseModule.getCurrentDatabase();
    if (!db) return [];

    const internalReminders = this.getInternalRemindersFromDb(db, Date.now());
    const pendingReminders: PendingReminder[] = [];

    for (const reminder of internalReminders) {
      // 获取完整的 TodoItem
      const todoItem = reminder.todoId
        ? db.prepare(`SELECT * FROM todo_item WHERE id = ?`).get(reminder.todoId)
        : null;

      if (todoItem || reminder.taskRef) {
        pendingReminders.push({
          todoItem,
          recurrenceDate: reminder.recurrenceDate,
          remindAt: reminder.remindAt,
          taskRef: reminder.taskRef,
        });
      }
    }

    return pendingReminders;
  }

  private dismissReminder(todoId: number, recurrenceDate?: number): void {
    // 将该任务的所有提醒标记为已提醒
    const db = databaseModule.getCurrentDatabase();
    if (!db) return;

    const row = db
      .prepare(`SELECT due_at, remind_before FROM todo_item WHERE id = ?`)
      .get(todoId) as { due_at: number; remind_before: number } | undefined;

    if (row && row.remind_before) {
      const remindAt = row.due_at - row.remind_before;
      const reminderId = `${todoId}-${remindAt}${recurrenceDate ? `-${recurrenceDate}` : ""}`;
      this.remindedItems.add(reminderId);
    }
  }

  private dismissAllReminders(): void {
    const db = databaseModule.getCurrentDatabase();
    if (!db) return;
    for (const reminder of this.getInternalRemindersFromDb(db, Date.now())) {
      this.remindedItems.add(this.reminderKey(reminder));
    }
  }

  destroy(): void {
    this.stopChecking();
    this.remindedItems.clear();
  }
}

export default new TodoReminderModule();
