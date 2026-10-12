import { ipcMain, BrowserWindow } from "electron";
import { routeNotification } from "../windows";
import { Module } from "../types/module";
import databaseModule from "./database";
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
  taskRef?: TaskRef;
  occurrence?: TaskOccurrenceRef;
  title: string;
  dueAt: number;
  remindAt: number;
  type: "deadline" | "recurring";
  recurrenceDate?: number;
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
    return reminder.taskRef
      ? assistantReminderKey({ ...reminder, taskRef: reminder.taskRef })
      : `${reminder.todoId}-${reminder.remindAt}${reminder.recurrenceDate ? `-${reminder.recurrenceDate}` : ""}`;
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

      for (const row of rows) {
        const remindAt = row.due_at - row.remind_before;

        // 只添加即将到来的提醒（提前 24 小时到当前时间）
        if (remindAt > now - 24 * 60 * 60 * 1000 && remindAt <= now + 24 * 60 * 60 * 1000) {
          reminders.push({
            todoId: row.id,
            title: row.title,
            dueAt: row.due_at,
            remindAt,
            type: "deadline",
          });
        }
      }

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
    // 「查看」沿用原原生通知的 click 行为（通知渲染端 + 聚焦窗口）
    routeNotification(
      {
        id: `todo-reminder:${this.reminderKey(reminder)}`,
        title: this.getNotificationTitle(reminder),
        body: reminder.title,
        icon: "calendarClock",
        tone: "neutral",
        sticky: true,
        actions: [{ label: "查看", primary: true }],
      },
      {
        kind: "main",
        handlers: [
          () => {
            this.sendToRenderer("todo-reminder:clicked", reminder);
            const windows = BrowserWindow.getAllWindows();
            if (windows.length > 0) {
              const win = windows[0];
              if (win.isMinimized()) {
                win.restore();
              }
              win.focus();
            }
          },
        ],
      }
    );

    // 发送应用内提醒到渲染进程
    this.sendToRenderer("todo-reminder:show", reminder);

    log.info("Sent task reminder", reminder.taskRef ? taskKey(reminder.taskRef) : reminder.todoId);
  }

  private getNotificationTitle(reminder: InternalReminder): string {
    const now = Date.now();
    const timeUntilDue = reminder.dueAt - now;

    if (timeUntilDue <= 0) {
      return "任务已逾期";
    }

    const minutes = Math.floor(timeUntilDue / (60 * 1000));
    const hours = Math.floor(timeUntilDue / (60 * 60 * 1000));
    const days = Math.floor(timeUntilDue / (24 * 60 * 60 * 1000));

    if (days > 0) {
      return `任务将在 ${days} 天后到期`;
    } else if (hours > 0) {
      return `任务将在 ${hours} 小时后到期`;
    } else if (minutes > 0) {
      return `任务将在 ${minutes} 分钟后到期`;
    } else {
      return "任务即将到期";
    }
  }

  private sendToRenderer(channel: string, data: any): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, data);
      }
    }
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
