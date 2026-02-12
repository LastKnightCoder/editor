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
import DiaryTable from "./tables/diary";
import ChatMessageTable from "./tables/chat-message";
import ChatGroupTable from "./tables/chat-group";
import OperationTable from "./tables/operation";
import StatisticTable from "./tables/statistic";
import VecDocumentTable from "./tables/vec-document";
import FtsTable from "./tables/fts";
import VideoNoteTable from "./tables/video-note";
import VideoNoteItemTable from "./tables/video-note-item";
import ContentTable from "./tables/content";
import QuestionTable from "./tables/question";
import WhiteBoardContentTable from "./tables/white-board-content";
import DataTableTable from "./tables/data-table";
import DataTableViewTable from "./tables/data-table-view";
import TodoGroupTable from "./tables/todo-group";
import TodoItemTable from "./tables/todo-item";
import TodoNoteLinkTable from "./tables/todo-note-link";
import TodoRecurrenceTable from "./tables/todo-recurrence";
import TodoRecurrenceCompletionTable from "./tables/todo-recurrence-completion";
import TodoCalendarMappingTable from "./tables/todo-calendar-mapping";
import TodoCalendarSyncTable from "./tables/todo-calendar-sync";
import GoalHardCleanupTable from "./tables/goal-hard-cleanup";
import QuestionGroupTable from "./tables/question-group";
import PomodoroPresetTable from "./tables/pomodoro-preset";
import PomodoroSessionTable from "./tables/pomodoro-session";
import PomodoroCalendarMappingTable from "./tables/pomodoro-calendar-mapping";
import NotionSyncTable from "./tables/notion-sync";
import CalendarGroupTable from "./tables/calendar-group";
import CalendarTable from "./tables/calendar";
import CalendarEventTable from "./tables/calendar-event";
import PodcastTable from "./tables/podcast";
import ResourceTable from "./tables/resource";
import ResourceGroupTable from "./tables/resource-group";
import WebLinkTable from "./tables/web-link";
import WebClipTable from "./tables/web-clip";
import WebNoteTable from "./tables/web-note";
import WebViewPreferenceTable from "./tables/web-view-preference";
import ContentLinkTable from "./tables/content-link";
import PromptTable from "./tables/prompt";
import WeReadNotebookTable from "./tables/weread-notebook";
import WeReadViewTable from "./tables/weread-view";
import WeReadConfigTable from "./tables/weread-config";
import FlashcardTable from "./tables/flashcard";
import EpubTable from "./tables/epub";
import ResourceSyncBlacklistTable from "./tables/resource-sync-blacklist";
import PublishSelectionTable from "./tables/publish-selection";
import PublishHistoryTable from "./tables/publish-history";
import SlideHardCleanupTable from "./tables/slide-hard-cleanup";
import TranscriptionTable from "./tables/transcription";
import VibeLearningResourceTable from "./tables/vibe-learning-resource";
import VibeLearningChatTable from "./tables/vibe-learning-chat";
import VLNoteTable from "./tables/vl-note";
import VLQuizTable from "./tables/vl-quiz";
import mainContentIndexDBManager, {
  IndexRebuildState,
} from "./main-content-index-db";

import * as sqliteVec from "sqlite-vec";

export type DatabaseConnectReason = "connect" | "switch" | "reconnect";

class DatabaseModule implements Module {
  name: string;

  databases: Map<string, Database.Database>;
  windowToDatabase: Map<number, string>;
  tables: Table[];
  eventAndHandlers: Record<
    string,
    (db: Database.Database, ...args: any) => any
  >;
  indexEventAndHandlers: Record<
    string,
    (mainDb: Database.Database, indexDb: Database.Database, ...args: any) => any
  >;
  private currentDatabaseName = "data.db"; // 默认数据库
  private databaseChangeCallbacks: Array<(dbName: string) => void> = [];
  private hasConnectedDatabase = false;
  private databaseConnectedCallbacks: Array<
    (dbName: string, reason: DatabaseConnectReason) => void
  > = [];

  getDatabase(name: string): Database.Database | undefined {
    return this.databases.get(name);
  }

  getCurrentDatabase(): Database.Database | undefined {
    return this.getDatabase(this.currentDatabaseName);
  }

  getCurrentDatabaseName(): string {
    return this.currentDatabaseName;
  }

  getIndexDatabase(name: string): Database.Database | undefined {
    try {
      return mainContentIndexDBManager.getDatabase(name);
    } catch (error) {
      log.error("[database] getIndexDatabase failed:", error);
      return undefined;
    }
  }

  getCurrentIndexDatabase(): Database.Database | undefined {
    return this.getIndexDatabase(this.currentDatabaseName);
  }

  getIndexRebuildState(name: string): IndexRebuildState {
    return mainContentIndexDBManager.getRebuildState(name);
  }

  setIndexRebuildState(name: string, state: IndexRebuildState) {
    mainContentIndexDBManager.setRebuildState(name, state);
  }

  onDatabaseChange(callback: (dbName: string) => void): () => void {
    this.databaseChangeCallbacks.push(callback);
    return () => {
      this.databaseChangeCallbacks = this.databaseChangeCallbacks.filter(
        (cb) => cb !== callback,
      );
    };
  }

  onDatabaseConnected(
    callback: (dbName: string, reason: DatabaseConnectReason) => void,
  ): () => void {
    this.databaseConnectedCallbacks.push(callback);
    return () => {
      this.databaseConnectedCallbacks = this.databaseConnectedCallbacks.filter(
        (cb) => cb !== callback,
      );
    };
  }

  private notifyDatabaseChange(dbName: string): void {
    this.databaseChangeCallbacks.forEach((cb) => cb(dbName));
  }

  private notifyDatabaseConnected(
    dbName: string,
    reason: DatabaseConnectReason,
  ): void {
    this.databaseConnectedCallbacks.forEach((cb) => cb(dbName, reason));
  }

  constructor() {
    this.name = "database";
    this.databases = new Map();
    this.windowToDatabase = new Map();
    this.tables = [
      PodcastTable,
      ContentTable,
      WhiteBoardContentTable,
      WhiteboardTable,
      CardTable,
      ArticleTable,
      ProjectTable,
      DocumentTable,
      PdfTable,
      DailyNoteTable,
      DiaryTable,
      ChatGroupTable,
      ChatMessageTable,
      OperationTable,
      StatisticTable,
      VideoNoteItemTable, // Must be before VideoNoteTable for migration
      VideoNoteTable,
      QuestionGroupTable,
      QuestionTable,
      GoalHardCleanupTable,
      DataTableTable,
      DataTableViewTable,
      TodoGroupTable,
      TodoItemTable,
      TodoNoteLinkTable,
      TodoRecurrenceTable,
      TodoRecurrenceCompletionTable,
      TodoCalendarMappingTable,
      PomodoroPresetTable,
      PomodoroSessionTable,
      PomodoroCalendarMappingTable,
      NotionSyncTable,
      CalendarGroupTable, // 必须在 TodoCalendarSyncTable 和 PomodoroSessionTable 之前
      CalendarTable,
      CalendarEventTable,
      TodoCalendarSyncTable, // 移到 CalendarGroupTable 之后
      ResourceGroupTable,
      ResourceTable,
      WebLinkTable,
      WebClipTable,
      WebNoteTable,
      WebViewPreferenceTable,
      ContentLinkTable,
      PromptTable,
      WeReadNotebookTable,
      WeReadViewTable,
      WeReadConfigTable,
      FlashcardTable,
      EpubTable,
      ResourceSyncBlacklistTable,
      PublishSelectionTable,
      PublishHistoryTable,
      SlideHardCleanupTable,
      TranscriptionTable,
      VibeLearningResourceTable,
      VibeLearningChatTable,
      VLNoteTable,
      VLQuizTable,
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
    this.indexEventAndHandlers = {
      ...FtsTable.getListenEvents(),
      ...VecDocumentTable.getListenEvents(),
    };
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

    database.exec("DROP TABLE IF EXISTS shortcuts");

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
    const indexDb = this.getIndexDatabase(name);

    try {
      const { busy, log } = db
        .prepare("PRAGMA wal_checkpoint(FULL)")
        .get() as any;
      if (busy !== 0) throw new Error("存在未释放的数据库锁");
      if (log !== 0) throw new Error("WAL 文件未完全合并");
      if (indexDb) {
        const indexCheckpoint = indexDb
          .prepare("PRAGMA wal_checkpoint(FULL)")
          .get() as any;
        if (indexCheckpoint?.busy !== 0) {
          throw new Error("索引数据库存在未释放的数据库锁");
        }
        if (indexCheckpoint?.log !== 0) {
          throw new Error("索引数据库 WAL 文件未完全合并");
        }
      }
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
        const existedBeforeConnect = this.databases.has(name);

        // 检测数据库切换
        const oldDbName = this.currentDatabaseName;
        const dbChanged = oldDbName !== name;

        if (!this.databases.has(name) || force) {
          log.info(
            `[database] create-or-connect-database start: db=${name}, dbPath=${dbPath}, force=${Boolean(force)}`,
          );
          if (this.databases.has(name)) {
            this.databases.get(name)!.close();
            mainContentIndexDBManager.closeDatabase(name);
          }
          const database = this.createDatabase(name);
          this.databases.set(name, database);
        }

        const database = this.getDatabase(name);
        if (!database) {
          throw new Error(`No database found after connect: ${name}`);
        }

        const ensureStartAt = Date.now();
        const ensureResult = mainContentIndexDBManager.ensureReady(
          name,
          database,
        );
        const ensureMode =
          existedBeforeConnect && !force
            ? "warm_recheck"
            : "connect_or_reconnect";
        log.info(
          `[database] create-or-connect-database index ensureReady done: db=${name}, mode=${ensureMode}, migrationState=${ensureResult.migrationState}, rebuildState=${ensureResult.rebuildState}, elapsedMs=${Date.now() - ensureStartAt}`,
        );

        if (!existedBeforeConnect || force) {
          const checkpointStartAt = Date.now();
          const checkpointOk = this.forceCheckpoint(name);
          log.info(
            `[database] create-or-connect-database checkpoint result: db=${name}, success=${checkpointOk}, elapsedMs=${Date.now() - checkpointStartAt}`,
          );
        }

        const sender = event.sender;
        const win = BrowserWindow.fromWebContents(sender);
        if (win) {
          this.windowToDatabase.set(win.id, name);
        }

        let connectReason: DatabaseConnectReason | null = null;
        if (!this.hasConnectedDatabase) {
          connectReason = "connect";
        } else if (dbChanged) {
          connectReason = "switch";
        } else if (force) {
          connectReason = "reconnect";
        } else if (!existedBeforeConnect) {
          connectReason = "connect";
        }

        if (connectReason) {
          this.currentDatabaseName = name;
          if (dbChanged) {
            log.info(`Database changed from ${oldDbName} to ${name}`);
            this.notifyDatabaseChange(name);
          }
          this.notifyDatabaseConnected(name, connectReason);
          this.hasConnectedDatabase = true;
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
          const res = await this.eventAndHandlers[eventName](db, ...args, win);
          db.exec("COMMIT");
          return res;
        } catch (e) {
          log.error(
            `[database] event failed: db=${dbName}, event=${eventName}`,
            e,
          );
          db.exec("ROLLBACK");
        }
      });
    });

    Object.keys(this.indexEventAndHandlers).forEach((eventName) => {
      ipcMain.handle(eventName, async (event, ...args) => {
        const sender = event.sender;
        const win = BrowserWindow.fromWebContents(sender);
        if (!win) throw new Error("No window found");

        const dbName = this.windowToDatabase.get(win.id);
        if (!dbName) throw new Error("No database name found");

        const mainDb = this.getDatabase(dbName);
        if (!mainDb) throw new Error("No main database found");

        const indexDb = this.getIndexDatabase(dbName);
        if (!indexDb) throw new Error("No index database found");

        log.info(`database ${dbName} index event ${eventName}`);
        try {
          mainDb.exec("BEGIN");
          indexDb.exec("BEGIN");
          const res = await this.indexEventAndHandlers[eventName](
            mainDb,
            indexDb,
            ...args,
            win,
          );
          indexDb.exec("COMMIT");
          mainDb.exec("COMMIT");
          return res;
        } catch (e) {
          log.error(
            `[database] index event failed: db=${dbName}, event=${eventName}`,
            e,
          );
          try {
            indexDb.exec("ROLLBACK");
          } catch {
            // ignore rollback error
          }
          try {
            mainDb.exec("ROLLBACK");
          } catch {
            // ignore rollback error
          }
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
        mainContentIndexDBManager.closeDatabase(name);
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
      mainContentIndexDBManager.closeAll();
      this.windowToDatabase.clear();
    });

    ipcMain.handle("get-database-path", (_, name) => {
      const appDir = PathUtil.getAppDir();
      return join(appDir, this.addDbExtension(name));
    });
  }
}

export default new DatabaseModule();
