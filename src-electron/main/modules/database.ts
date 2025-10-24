import { BrowserWindow, ipcMain } from "electron";
import PathUtil from "../utils/PathUtil";
import Database from "better-sqlite3";
import { join } from "node:path";
import log from "electron-log";
import { Module } from "../types/module";
import { Table } from "../types/table";
import CardTable from "./tables/card";
import ArticleTable from "./tables/article";
import DocumentTable from "./tables/document";
import WhiteboardTable from "./tables/whiteboard";
import ProjectTable from "./tables/project";
import PdfTable from "./tables/pdf";
import DailyNoteTable from "./tables/daily-note";
import VecDocumentTable from "./tables/vec-document";
import ChatMessageTable from "./tables/chat-message";
import OperationTable from "./tables/operation";
import StatisticTable from "./tables/statistic";
import FtsTable from "./tables/fts";
import VideoNoteTable from "./tables/video-note";
import ContentTable from "./tables/content";
import QuestionTable from "./tables/question";
import WhiteBoardContentTable from "./tables/white-board-content";
import GoalTable from "./tables/goal";
import GoalItemTable from "./tables/goal-item";
import GoalProgressEntryTable from "./tables/goal-progress-entry";
import DataTableTable from "./tables/data-table";
import DataTableViewTable from "./tables/data-table-view";
import TodoGroupTable from "./tables/todo-group";
import TodoItemTable from "./tables/todo-item";
import TodoNoteLinkTable from "./tables/todo-note-link";
import GoalProgressNoteLinkTable from "./tables/goal-progress-note-link";
import GoalNoteLinkTable from "./tables/goal-note-link";
import QuestionGroupTable from "./tables/question-group";
import ShortcutTable from "./tables/shortcut";
import PomodoroPresetTable from "./tables/pomodoro-preset";
import PomodoroSessionTable from "./tables/pomodoro-session";
import PomodoroCalendarMappingTable from "./tables/pomodoro-calendar-mapping";
import NotionSyncTable from "./tables/notion-sync";
import CalendarGroupTable from "./tables/calendar-group";
import CalendarTable from "./tables/calendar";
import CalendarEventTable from "./tables/calendar-event";

import * as sqliteVec from "sqlite-vec";

class DatabaseModule implements Module {
  name: string;

  databases: Map<string, Database.Database>;
  windowToDatabase: Map<number, string>;
  tables: Table[];
  eventAndHandlers: Record<
    string,
    (db: Database.Database, ...args: any) => any
  >;
  private currentDatabaseName = "data.db"; // 默认数据库
  private databaseChangeCallbacks: Array<(dbName: string) => void> = [];

  getDatabase(name: string): Database.Database | undefined {
    return this.databases.get(name);
  }

  getCurrentDatabase(): Database.Database | undefined {
    return this.getDatabase(this.currentDatabaseName);
  }

  getCurrentDatabaseName(): string {
    return this.currentDatabaseName;
  }

  onDatabaseChange(callback: (dbName: string) => void): void {
    this.databaseChangeCallbacks.push(callback);
  }

  private notifyDatabaseChange(dbName: string): void {
    this.currentDatabaseName = dbName;
    this.databaseChangeCallbacks.forEach((cb) => cb(dbName));
  }

  constructor() {
    this.name = "database";
    this.databases = new Map();
    this.windowToDatabase = new Map();
    this.tables = [
      ContentTable,
      WhiteBoardContentTable,
      WhiteboardTable,
      CardTable,
      ArticleTable,
      ProjectTable,
      DocumentTable,
      PdfTable,
      DailyNoteTable,
      VecDocumentTable,
      ChatMessageTable,
      OperationTable,
      StatisticTable,
      FtsTable,
      VideoNoteTable,
      QuestionGroupTable,
      QuestionTable,
      GoalTable,
      GoalItemTable,
      GoalProgressEntryTable,
      DataTableTable,
      DataTableViewTable,
      TodoGroupTable,
      TodoItemTable,
      TodoNoteLinkTable,
      GoalProgressNoteLinkTable,
      GoalNoteLinkTable,
      ShortcutTable,
      PomodoroPresetTable,
      PomodoroSessionTable,
      PomodoroCalendarMappingTable,
      NotionSyncTable,
      CalendarGroupTable,
      CalendarTable,
      CalendarEventTable,
      // TimeRecordTable 已被迁移并删除
    ] as unknown as Table[];

    this.eventAndHandlers = this.tables.reduce(
      (acc, table) => {
        const events = table.getListenEvents();
        return {
          ...acc,
          ...events,
        };
      },
      {} as Record<string, (args: any) => Promise<any>>,
    );
  }

  formatDatabaseName(databaseName: string) {
    let newDatabaseName = databaseName;
    // 如果以 .db 结尾，则去掉
    if (databaseName.endsWith(".db")) {
      newDatabaseName = databaseName.slice(0, -3);
    }
    return newDatabaseName;
  }

  addDbExtension(databaseName: string) {
    let newDatabaseName = databaseName;
    // 如果没有 .db 结尾，则加上
    if (!databaseName.endsWith(".db")) {
      newDatabaseName = `${databaseName}.db`;
    }
    return newDatabaseName;
  }

  createDatabase(name: string) {
    const appDir = PathUtil.getAppDir();
    const dbPath = join(appDir, `${this.formatDatabaseName(name)}.db`);
    const database = new Database(dbPath);
    if (!database) throw new Error("No database found");
    sqliteVec.load(database);

    const { vec_version } = database
      .prepare("select vec_version() as vec_version;")
      .get() as any;

    log.info(`vec_version=${vec_version}`);

    database.pragma("journal_mode = WAL");

    for (const table of this.tables) {
      table.initTable(database);
    }
    for (const table of this.tables) {
      table.upgradeTable(database);
    }

    try {
      database.exec("VACUUM");
    } catch (e) {
      console.error(e);
    }

    return database;
  }

  forceCheckpoint(name: string) {
    const db = this.getDatabase(name);
    if (!db) return false;

    try {
      const { busy, log } = db
        .prepare("PRAGMA wal_checkpoint(FULL)")
        .get() as any;
      if (busy !== 0) throw new Error("存在未释放的数据库锁");
      if (log !== 0) throw new Error("WAL 文件未完全合并");
      return true;
    } catch (err) {
      // @ts-ignore
      log.error("检查点执行失败:", err.message);
      return false;
    }
  }

  async init() {
    ipcMain.handle(
      "create-or-connect-database",
      async (event, name, force?: boolean) => {
        const appDir = PathUtil.getAppDir();
        const dbPath = join(appDir, `${this.formatDatabaseName(name)}.db`);

        // 检测数据库切换
        const oldDbName = this.currentDatabaseName;
        const dbChanged = oldDbName !== name;

        if (!this.databases.has(name) || force) {
          log.info(`connect database ${dbPath}`);
          if (this.databases.has(name)) {
            this.databases.get(name)!.close();
          }
          const database = this.createDatabase(name);
          this.databases.set(name, database);

          this.forceCheckpoint(name);
        }

        const sender = event.sender;
        const win = BrowserWindow.fromWebContents(sender);
        if (win) {
          this.windowToDatabase.set(win.id, name);
        }

        // 通知数据库已切换
        if (dbChanged) {
          log.info(`Database changed from ${oldDbName} to ${name}`);
          this.notifyDatabaseChange(name);
        }
      },
    );

    ipcMain.handle("force-checkpoint", async (_event, name) => {
      return this.forceCheckpoint(name);
    });

    Object.keys(this.eventAndHandlers).forEach((eventName) => {
      ipcMain.handle(eventName, async (event, ...args) => {
        const sender = event.sender;
        const win = BrowserWindow.fromWebContents(sender);
        if (!win) throw new Error("No window found");

        const dbName = this.windowToDatabase.get(win.id);
        if (!dbName) throw new Error("No database name found");

        const db = this.getDatabase(dbName);
        if (!db) throw new Error("No database found");

        log.info(`database ${dbName} event ${eventName}`);
        try {
          db.exec("BEGIN");
          const res = this.eventAndHandlers[eventName](db, ...args, win);
          db.exec("COMMIT");
          return res;
        } catch (e) {
          log.error(e);
          db.exec("ROLLBACK");
        }
      });
    });

    ipcMain.handle("close-database", async (_event, name) => {
      if (this.databases.has(name)) {
        const database = this.databases.get(name);
        if (!database) throw new Error("No database found");

        this.forceCheckpoint(name);

        database.close();
        this.databases.delete(name);
        for (const [id, dbName] of this.windowToDatabase) {
          if (dbName === name) {
            this.windowToDatabase.delete(id);
          }
        }
      }
    });

    ipcMain.handle("close-all-database", async () => {
      for (const [name, database] of this.databases) {
        database.close();
        this.databases.delete(name);
      }
      this.windowToDatabase.clear();
    });

    ipcMain.handle("get-database-path", (_, name) => {
      const appDir = PathUtil.getAppDir();
      return join(appDir, this.addDbExtension(name));
    });
  }
}

export default new DatabaseModule();
