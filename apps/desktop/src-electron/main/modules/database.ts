import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import PathUtil from "../utils/PathUtil";
import Database from "better-sqlite3";
import { join } from "node:path";
import log from "electron-log";
import { setCommandBroadcastSink, type CommandContext } from "@tau/rpc";
import { Module } from "../types/module";
import { Table } from "../types/table";
import CardTable from "./tables/card";
import ArticleTable from "./tables/article";
import WhiteboardTable from "./tables/whiteboard";
import ProjectTable from "./tables/project";
import PdfTable from "./tables/pdf";
import PdfChatTable from "./tables/pdf-chat";
import DailyNoteTable from "./tables/daily-note";
import DiaryTable from "./tables/diary";
import ChatMessageTable from "./tables/chat-message";
import ChatSessionTable from "./tables/chat-session";
import ChatGroupTable from "./tables/chat-group";
import OperationTable from "./tables/operation";
import StatisticTable from "./tables/statistic";
import VecDocumentTable from "./tables/vec-document";
import FtsTable from "./tables/fts";
import VideoNoteTable from "./tables/video-note";
import VideoNoteItemTable from "./tables/video-note-item";
import VideoNoteChatTable from "./tables/video-note-chat";
import AudioNoteTable from "./tables/audio-note";
import AudioNoteItemTable from "./tables/audio-note-item";
import AudioNoteChatTable from "./tables/audio-note-chat";
import { getXiaoyuzhouListenEvents } from "./xiaoyuzhou";
import ContentTable from "./tables/content";
import QuestionTable from "./tables/question";
import QuestionLinkTable from "./tables/question-link";
import EntitySearchTable from "./tables/entity-search";
import QuestionEventTable from "./tables/question-event";
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
import BadgeHardCleanupTable from "./tables/badge-hard-cleanup";
import GoalHardCleanupTable from "./tables/goal-hard-cleanup";
import QuestionGroupTable from "./tables/question-group";
import PomodoroPresetTable from "./tables/pomodoro-preset";
import PomodoroSessionTable from "./tables/pomodoro-session";
import PomodoroCalendarMappingTable from "./tables/pomodoro-calendar-mapping";
import CalendarGroupTable from "./tables/calendar-group";
import CalendarTable from "./tables/calendar";
import CalendarEventTable from "./tables/calendar-event";
import PodcastTable from "./tables/podcast";
import ResourceHardCleanupTable from "./tables/resource-hard-cleanup";
import WebLinkTable from "./tables/web-link";
import WebClipTable from "./tables/web-clip";
import WebNoteTable from "./tables/web-note";
import WebViewPreferenceTable from "./tables/web-view-preference";
import ContentLinkTable from "./tables/content-link";
import WeReadNotebookTable from "./tables/weread-notebook";
import WeReadViewTable from "./tables/weread-view";
import WeReadConfigTable from "./tables/weread-config";
import FlashcardTable from "./tables/flashcard";
import EpubHardCleanupTable from "./tables/epub-hard-cleanup";
import ResourceSyncBlacklistTable from "./tables/resource-sync-blacklist";
import PublishSelectionTable from "./tables/publish-selection";
import PublishHistoryTable from "./tables/publish-history";
import SlideHardCleanupTable from "./tables/slide-hard-cleanup";
import TranscriptionTable from "./tables/transcription";
import VibeLearningResourceTable from "./tables/vibe-learning-resource";
import VibeLearningChatTable from "./tables/vibe-learning-chat";
import VLNoteTable from "./tables/vl-note";
import VLQuizTable from "./tables/vl-quiz";
import { shouldWrapDatabaseEventInTransaction } from "./database-event-transaction";
import { shouldVacuumDatabase } from "./database-maintenance";
import mainContentIndexDBManager, {
  EnsureIndexReadyResult,
  IndexRebuildState,
  IndexRebuildTarget,
} from "./main-content-index-db";
import MAIN_SCHEMA_SQL from "@tau/db-schema/schema/main.sql?raw";
import { upgradeKnowledgeDatabase } from "@tau/db-schema/src/knowledge-migration-node";
import { retireSubscriptions } from "@tau/db-schema/src/subscription-retirement";
import {
  retireEditorBlocks,
  installEditorBlockGuards,
} from "@tau/db-schema/src/editor-block-retirement";
import { migrateContentBindings } from "./collaboration/content-repository";
import { loadSqliteVecExtension } from "../utils/sqlite-vec-loader";
import { executeReadOnlySql, type SqlQueryInput } from "./sql-query";
import { migrateLegacyChatsToSessions } from "./chat-session-migration";
import { mergeChatSessionBranches } from "./chat-session-tree-migration";
import { chatSessionDirOf } from "./pi-session-paths";

export type DatabaseConnectMode = "normal" | "maintenance";
export type DatabaseReconnectSource = "sync_upload_reconnect" | "sync_download_reconnect";
export type DatabaseConnectReason = "connect" | "switch" | "reconnect" | DatabaseReconnectSource;

/** 构造以指定窗口为来源端的命令上下文（排除来源窗口广播） */
function createWindowCommandContext(win: BrowserWindow | null): CommandContext {
  return {
    broadcastOthers: (channel, ...args) => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (window !== win && !window.isDestroyed()) {
          window.webContents.send(channel, ...args);
        }
      }
    },
    broadcastAll: (channel, ...args) => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) {
          window.webContents.send(channel, ...args);
        }
      }
    },
  };
}

class DatabaseModule implements Module {
  name: string;

  databases: Map<string, Database.Database>;
  windowToDatabase: Map<number, string>;
  tables: Table[];
  eventAndHandlers: Record<string, (db: Database.Database, ...args: any) => any>;
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
  private indexEnsurePromises: Map<string, Promise<EnsureIndexReadyResult | null>> = new Map();

  private openReadOnlyDatabase(name: string): Database.Database {
    const dbPath = join(PathUtil.getAppDir(), `${this.formatDatabaseName(name)}.db`);
    return new Database(dbPath, { readonly: true, fileMustExist: true });
  }

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

  getIndexRebuildState(name: string, target: IndexRebuildTarget = "aggregate"): IndexRebuildState {
    return mainContentIndexDBManager.getRebuildState(name, target);
  }

  setIndexRebuildState(
    name: string,
    state: IndexRebuildState,
    target: IndexRebuildTarget = "aggregate"
  ) {
    mainContentIndexDBManager.setRebuildState(name, state, target);
  }

  onDatabaseChange(callback: (dbName: string) => void): () => void {
    this.databaseChangeCallbacks.push(callback);
    return () => {
      this.databaseChangeCallbacks = this.databaseChangeCallbacks.filter(cb => cb !== callback);
    };
  }

  onDatabaseConnected(
    callback: (dbName: string, reason: DatabaseConnectReason) => void
  ): () => void {
    this.databaseConnectedCallbacks.push(callback);
    return () => {
      this.databaseConnectedCallbacks = this.databaseConnectedCallbacks.filter(
        cb => cb !== callback
      );
    };
  }

  private notifyDatabaseChange(dbName: string): void {
    this.databaseChangeCallbacks.forEach(cb => cb(dbName));
  }

  private notifyDatabaseConnected(dbName: string, reason: DatabaseConnectReason): void {
    this.databaseConnectedCallbacks.forEach(cb => cb(dbName, reason));
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
      PdfTable,
      PdfChatTable,
      DailyNoteTable,
      DiaryTable,
      ChatGroupTable,
      ChatMessageTable,
      ChatSessionTable,
      OperationTable,
      StatisticTable,
      VideoNoteItemTable, // Must be before VideoNoteTable for migration
      VideoNoteTable,
      VideoNoteChatTable,
      AudioNoteItemTable,
      AudioNoteTable,
      AudioNoteChatTable,
      QuestionGroupTable,
      QuestionTable,
      QuestionEventTable,
      QuestionLinkTable,
      EntitySearchTable,
      GoalHardCleanupTable,
      DataTableTable,
      DataTableViewTable,
      TodoGroupTable,
      TodoItemTable,
      TodoNoteLinkTable,
      TodoRecurrenceTable,
      TodoRecurrenceCompletionTable,
      TodoCalendarMappingTable,
      BadgeHardCleanupTable,
      PomodoroPresetTable,
      PomodoroSessionTable,
      PomodoroCalendarMappingTable,
      CalendarGroupTable, // 必须在 TodoCalendarSyncTable 和 PomodoroSessionTable 之前
      CalendarTable,
      CalendarEventTable,
      TodoCalendarSyncTable, // 移到 CalendarGroupTable 之后
      ResourceHardCleanupTable,
      WebLinkTable,
      WebClipTable,
      WebNoteTable,
      WebViewPreferenceTable,
      ContentLinkTable,
      WeReadNotebookTable,
      WeReadViewTable,
      WeReadConfigTable,
      FlashcardTable,
      EpubHardCleanupTable,
      ResourceSyncBlacklistTable,
      PublishSelectionTable,
      PublishHistoryTable,
      SlideHardCleanupTable,
      TranscriptionTable,
      VibeLearningResourceTable,
      VibeLearningChatTable,
      VLNoteTable,
      VLQuizTable,
    ] as unknown as Table[];

    this.eventAndHandlers = this.tables.reduce(
      (acc, table) => {
        const events = table.getListenEvents();
        return {
          ...acc,
          ...events,
        };
      },
      {} as Record<string, (args: any) => Promise<any>>
    );
    Object.assign(this.eventAndHandlers, getXiaoyuzhouListenEvents());
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

  openDatabase(name: string, mode: DatabaseConnectMode = "maintenance") {
    const startedAt = Date.now();
    const appDir = PathUtil.getAppDir();
    const dbPath = join(appDir, `${this.formatDatabaseName(name)}.db`);
    log.info(`[database] openDatabase start: db=${name}, mode=${mode}, dbPath=${dbPath}`);

    const openStartAt = Date.now();
    const database = new Database(dbPath);
    try {
      if (!database) throw new Error("No database found");
      log.info(
        `[database] openDatabase sqlite open done: db=${name}, elapsedMs=${Date.now() - openStartAt}`
      );

      const extensionStartAt = Date.now();
      loadSqliteVecExtension(database);
      log.info(
        `[database] openDatabase load sqlite-vec done: db=${name}, elapsedMs=${Date.now() - extensionStartAt}`
      );

      const vecVersionStartAt = Date.now();
      const { vec_version } = database.prepare("select vec_version() as vec_version;").get() as any;

      log.info(
        `[database] openDatabase vec_version read: db=${name}, vec_version=${vec_version}, elapsedMs=${Date.now() - vecVersionStartAt}`
      );

      const pragmaStartAt = Date.now();
      database.pragma("journal_mode = WAL");
      log.info(
        `[database] openDatabase journal_mode done: db=${name}, elapsedMs=${Date.now() - pragmaStartAt}`
      );

      const schemaStartAt = Date.now();
      retireSubscriptions(database, dbPath);
      database.exec(MAIN_SCHEMA_SQL);
      upgradeKnowledgeDatabase(database, dbPath);
      migrateContentBindings(database);
      retireEditorBlocks(database, dbPath);
      log.info(
        `[database] openDatabase main schema done: db=${name}, elapsedMs=${Date.now() - schemaStartAt}`
      );

      if (mode === "maintenance") {
        const upgradeStartAt = Date.now();
        for (const table of this.tables) {
          table.upgradeTable(database);
        }
        installEditorBlockGuards(database);
        log.info(
          `[database] openDatabase maintenance upgrades done: db=${name}, tableCount=${this.tables.length}, elapsedMs=${Date.now() - upgradeStartAt}`
        );

        database.exec("DROP TABLE IF EXISTS shortcuts");
        // 旧聊天链路的运行记录（pi 迁移 M8）：只存运行中状态，渲染端早已零调用，无需备份
        database.exec("DROP TABLE IF EXISTS chat_run");

        const pageCount = Number(database.pragma("page_count", { simple: true }));
        const freelistCount = Number(database.pragma("freelist_count", { simple: true }));
        const pageSize = Number(database.pragma("page_size", { simple: true }));
        if (shouldVacuumDatabase({ pageCount, freelistCount, pageSize })) {
          try {
            const vacuumStartAt = Date.now();
            database.exec("VACUUM");
            database.pragma("wal_checkpoint(TRUNCATE)");
            log.info(
              `[database] openDatabase vacuum done: db=${name}, reclaimedPages=${freelistCount}, elapsedMs=${Date.now() - vacuumStartAt}`
            );
          } catch (e) {
            console.error(e);
          }
        }
      }

      log.info(
        `[database] openDatabase done: db=${name}, mode=${mode}, totalElapsedMs=${Date.now() - startedAt}`
      );

      return database;
    } catch (error) {
      database.close();
      throw error;
    }
  }

  forceCheckpoint(name: string) {
    const db = this.getDatabase(name);
    if (!db) return false;
    const indexDb = mainContentIndexDBManager.getExistingDatabase(name);

    try {
      const { busy, log } = db.prepare("PRAGMA wal_checkpoint(FULL)").get() as any;
      if (busy !== 0) throw new Error("存在未释放的数据库锁");
      if (log !== 0) throw new Error("WAL 文件未完全合并");
      if (indexDb) {
        const indexCheckpoint = indexDb.prepare("PRAGMA wal_checkpoint(FULL)").get() as any;
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

  ensureIndexDatabaseReady(
    name: string,
    reason = "unspecified"
  ): Promise<EnsureIndexReadyResult | null> {
    const existing = this.indexEnsurePromises.get(name);
    if (existing) {
      log.info(`[database] index ensureReady reuse in-flight task: db=${name}, reason=${reason}`);
      return existing;
    }

    log.info(`[database] index ensureReady enqueue: db=${name}, reason=${reason}`);

    const task = new Promise<EnsureIndexReadyResult | null>((resolve, reject) => {
      setImmediate(() => {
        log.info(`[database] index ensureReady task start: db=${name}, reason=${reason}`);
        const database = this.getDatabase(name);
        if (!database) {
          log.warn(
            `[database] index ensure skipped: db=${name}, reason=${reason}, main database missing`
          );
          resolve(null);
          return;
        }

        const ensureStartAt = Date.now();
        try {
          const ensureResult = mainContentIndexDBManager.ensureReady(name, database);
          log.info(
            `[database] index ensureReady done: db=${name}, reason=${reason}, migrationState=${ensureResult.migrationState}, rebuildState=${ensureResult.rebuildState}, elapsedMs=${Date.now() - ensureStartAt}`
          );
          resolve(ensureResult);
        } catch (error) {
          log.error(`[database] index ensureReady failed: db=${name}, reason=${reason}`, error);
          reject(error);
        } finally {
          this.indexEnsurePromises.delete(name);
        }
      });
    });

    this.indexEnsurePromises.set(name, task);
    return task;
  }

  warmIndexDatabaseInBackground(name: string, reason: string) {
    void this.ensureIndexDatabaseReady(name, reason).catch(() => {
      // 已在 ensureIndexDatabaseReady 内记录日志
    });
  }

  /**
   * 老对话一次性迁移到 pi 会话（M4）。会话目录取法与 pi-session-host 的 currentDatabaseName
   * 一致（库名去 .db）——两处不一致的话迁移写出的文件宿主找不到。
   */
  private async migrateChatSessions(database: Database.Database, name: string, dbPath: string) {
    const startedAt = Date.now();
    try {
      const appDir = PathUtil.getAppDir();
      const result = await migrateLegacyChatsToSessions({
        db: database,
        databasePath: dbPath,
        sessionDir: chatSessionDirOf(this.formatDatabaseName(name)),
        cwd: appDir,
      });
      if (result.skipped) return;
      log.info(
        `[database] chat session migration done: db=${name}, migrated=${result.migrated}, failed=${result.failed.length}, backup=${result.backupPath ?? "none"}, elapsedMs=${Date.now() - startedAt}`
      );
      for (const failure of result.failed) {
        log.error(
          `[database] chat session migration row failed: db=${name}, table=${failure.table}, id=${failure.id}, error=${failure.error}`
        );
      }
    } catch (error) {
      // 整体失败不阻塞开库：旧表原样保留，migration_meta 没记账，下次开库重试
      log.error(`[database] chat session migration failed: db=${name}`, error);
    }
    this.mergeChatSessionTrees(database, name, dbPath);
  }

  /**
   * 分支族合并成会话树（M4-d）：在老对话迁移之后跑（迁移出来的分支族一起并）。
   * 同步下载后重连也要跑：下载来的 .db 与会话包是配对的，对面若还没合并过，这里补上
   */
  private mergeChatSessionTrees(database: Database.Database, name: string, dbPath: string) {
    const startedAt = Date.now();
    try {
      const result = mergeChatSessionBranches({
        db: database,
        databasePath: dbPath,
        sessionDir: chatSessionDirOf(this.formatDatabaseName(name)),
      });
      if (result.skipped) return;
      log.info(
        `[database] chat session tree migration done: db=${name}, merged=${result.merged}, detached=${result.detached}, failed=${result.failed.length}, backup=${result.backupPath ?? "none"}, elapsedMs=${Date.now() - startedAt}`
      );
      for (const failure of result.failed) {
        log.error(
          `[database] chat session tree migration branch failed (kept as standalone): db=${name}, id=${failure.id}, error=${failure.error}`
        );
      }
    } catch (error) {
      log.error(`[database] chat session tree migration failed: db=${name}`, error);
    }
  }

  reconnectForSync(name: string, source: DatabaseReconnectSource) {
    log.info(`[database] reconnectForSync: db=${name}, source=${source}`);
    if (this.databases.has(name)) {
      this.databases.get(name)!.close();
      mainContentIndexDBManager.closeDatabase(name);
    }
    const database = this.openDatabase(name, "normal");
    this.databases.set(name, database);
    if (source === "sync_download_reconnect") {
      this.mergeChatSessionTrees(
        database,
        name,
        join(PathUtil.getAppDir(), `${this.formatDatabaseName(name)}.db`)
      );
    }
    this.warmIndexDatabaseInBackground(name, "connect_or_reconnect");
    this.currentDatabaseName = name;
    this.notifyDatabaseConnected(name, source);
    this.hasConnectedDatabase = true;
  }

  async init() {
    ipcMain.handle("validate-downloaded-database", (_event, name: string) => {
      const path = join(PathUtil.getAppDir(), `${this.formatDatabaseName(name)}.db.download.tmp`);
      const db = new Database(path, { fileMustExist: true });
      try {
        loadSqliteVecExtension(db);
        if (db.pragma("quick_check", { simple: true }) !== "ok")
          throw new Error("下载数据库完整性检查失败");
        if (
          !db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='contents'").get()
        ) {
          throw new Error("下载的文件不是 Tau 数据库");
        }
        retireSubscriptions(db, path);
        db.exec(MAIN_SCHEMA_SQL);
        // 知识库迁移可复用下载副本，订阅退役仍保留专属快照。
        upgradeKnowledgeDatabase(db, path, { skipBackup: true });
        migrateContentBindings(db);
        retireEditorBlocks(db, path);
        const checkpoint = db.pragma("wal_checkpoint(TRUNCATE)") as { busy: number }[];
        if (checkpoint.some(row => row.busy !== 0)) throw new Error("下载数据库尚未完整落盘");
        return true;
      } finally {
        db.close();
      }
    });
    ipcMain.handle("reset-content-index", (_event, name: string) => {
      // 同步替换主库后本地索引的 ID 空间整体失效，删除索引文件令其全量重建。
      mainContentIndexDBManager.resetDatabase(name);
      return true;
    });
    // 无来源上下文（联动调用链）的全广播出口，须早于任何命令调用装配
    setCommandBroadcastSink((channel, args) => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) {
          window.webContents.send(channel, ...args);
        }
      }
    });

    const connectDatabase = async (
      event: IpcMainInvokeEvent,
      name: string,
      force?: boolean,
      mode?: DatabaseConnectMode,
      source?: DatabaseReconnectSource
    ) => {
      const connectMode: DatabaseConnectMode = mode === "normal" ? "normal" : "maintenance";
      const appDir = PathUtil.getAppDir();
      const dbPath = join(appDir, `${this.formatDatabaseName(name)}.db`);
      const existedBeforeConnect = this.databases.has(name);

      // 检测数据库切换
      const oldDbName = this.currentDatabaseName;
      const dbChanged = oldDbName !== name;

      if (!this.databases.has(name) || force) {
        log.info(
          `[database] create-or-connect-database start: db=${name}, dbPath=${dbPath}, force=${Boolean(force)}, mode=${connectMode}`
        );
        if (this.databases.has(name)) {
          this.databases.get(name)!.close();
          mainContentIndexDBManager.closeDatabase(name);
        }
        const database = this.openDatabase(name, connectMode);
        this.databases.set(name, database);
        // 老对话迁到 pi 会话文件（M4）：必须在 notifyDatabaseConnected 之前跑完——
        // 渲染端一连上就查目录表，迁移没完成会看到空列表
        if (connectMode === "maintenance") {
          await this.migrateChatSessions(database, name, dbPath);
        }
      }

      const database = this.getDatabase(name);
      if (!database) {
        throw new Error(`No database found after connect: ${name}`);
      }

      const ensureMode = existedBeforeConnect && !force ? "warm_recheck" : "connect_or_reconnect";
      log.info(
        `[database] create-or-connect-database index ensureReady scheduled: db=${name}, mode=${ensureMode}`
      );
      this.warmIndexDatabaseInBackground(name, ensureMode);

      if (connectMode === "maintenance" && (!existedBeforeConnect || force)) {
        const checkpointStartAt = Date.now();
        const checkpointOk = this.forceCheckpoint(name);
        log.info(
          `[database] create-or-connect-database checkpoint result: db=${name}, success=${checkpointOk}, elapsedMs=${Date.now() - checkpointStartAt}`
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
        connectReason = source || "reconnect";
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
    };

    ipcMain.handle(
      "create-or-connect-database",
      async (
        event,
        name,
        force?: boolean,
        mode?: DatabaseConnectMode,
        source?: DatabaseReconnectSource
      ) => {
        await connectDatabase(event, name, force, mode, source);
      }
    );

    ipcMain.handle(
      "reconnect-database-fast",
      async (event, name, source?: DatabaseReconnectSource) => {
        await connectDatabase(event, name, true, "normal", source);
      }
    );

    ipcMain.handle("force-checkpoint", async (_event, name) => {
      return this.forceCheckpoint(name);
    });

    ipcMain.handle("sql-query", async (event, input: SqlQueryInput) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) throw new Error("No window found");
      const dbName = this.windowToDatabase.get(win.id);
      if (!dbName || !this.getDatabase(dbName)) {
        return {
          error: {
            code: "SQL_EXECUTION_ERROR",
            message: "当前没有已连接的数据库。",
            hint: "请先连接一个数据库后重试。",
          },
        };
      }
      const readOnlyDb = this.openReadOnlyDatabase(dbName);
      try {
        return { result: executeReadOnlySql(readOnlyDb, input) };
      } catch (error) {
        return {
          error: {
            code: (error as { code?: string }).code ?? "SQL_EXECUTION_ERROR",
            message: error instanceof Error ? error.message : "SQL 查询执行失败。",
            hint: (error as { hint?: string }).hint,
          },
        };
      } finally {
        readOnlyDb.close();
      }
    });

    Object.keys(this.eventAndHandlers).forEach(eventName => {
      ipcMain.handle(eventName, async (event, ...args) => {
        const sender = event.sender;
        const win = BrowserWindow.fromWebContents(sender);
        if (!win) throw new Error("No window found");

        const dbName = this.windowToDatabase.get(win.id);
        if (!dbName) throw new Error("No database name found");

        const db = this.getDatabase(dbName);
        if (!db) throw new Error("No database found");

        log.info(`database ${dbName} event ${eventName}`);
        const useTransaction = shouldWrapDatabaseEventInTransaction(eventName);
        try {
          if (useTransaction) {
            db.exec("BEGIN");
          }
          const res = await this.eventAndHandlers[eventName](
            db,
            ...args,
            createWindowCommandContext(win)
          );
          if (useTransaction) {
            db.exec("COMMIT");
          }
          return res;
        } catch (e) {
          log.error(`[database] event failed: db=${dbName}, event=${eventName}`, e);
          if (useTransaction) {
            db.exec("ROLLBACK");
          }
          throw e;
        }
      });
    });

    const readOnlyIndexEvents = new Set([
      "search-hybrid-content",
      "fts-search-content",
      "fts-check-index-exists",
      "get-all-fts-results",
      "vec-document-search-content",
      "vec-document-check-index-exists",
      "get-all-vec-document-results",
    ]);

    Object.keys(this.indexEventAndHandlers).forEach(eventName => {
      ipcMain.handle(eventName, async (event, ...args) => {
        const sender = event.sender;
        const win = BrowserWindow.fromWebContents(sender);
        if (!win) throw new Error("No window found");

        const dbName = this.windowToDatabase.get(win.id);
        if (!dbName) throw new Error("No database name found");

        const mainDb = this.getDatabase(dbName);
        if (!mainDb) throw new Error("No main database found");

        await this.ensureIndexDatabaseReady(dbName, `ipc:${eventName}`);

        const indexDb = this.getIndexDatabase(dbName);
        if (!indexDb) throw new Error("No index database found");

        log.info(`database ${dbName} index event ${eventName}`);

        if (readOnlyIndexEvents.has(eventName)) {
          return await this.indexEventAndHandlers[eventName](
            mainDb,
            indexDb,
            ...args,
            createWindowCommandContext(win)
          );
        }

        try {
          mainDb.exec("BEGIN");
          indexDb.exec("BEGIN");
          const res = await this.indexEventAndHandlers[eventName](
            mainDb,
            indexDb,
            ...args,
            createWindowCommandContext(win)
          );
          indexDb.exec("COMMIT");
          mainDb.exec("COMMIT");
          return res;
        } catch (e) {
          log.error(`[database] index event failed: db=${dbName}, event=${eventName}`, e);
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
        this.indexEnsurePromises.delete(name);
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
        this.indexEnsurePromises.delete(name);
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
