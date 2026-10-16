import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import PathUtil from "../utils/PathUtil";
import Database from "better-sqlite3";
import { join } from "node:path";
import log from "electron-log";
import { recordIpcCall, recordSqlCall } from "./perf-monitor";
import { setCommandBroadcastSink, type CommandContext } from "@tau/rpc";
import { Module } from "../types/module";
import { Table } from "../types/table";
import CardTable from "./tables/card";
import ArticleTable from "./tables/article";
import WhiteboardTable from "./tables/whiteboard";
import ProjectTable from "./tables/project";
import PdfTable from "./tables/pdf";
import DailyNoteTable from "./tables/daily-note";
import DiaryTable from "./tables/diary";
import ChatSessionTable from "./tables/chat-session";
import ChatGroupTable from "./tables/chat-group";
import OperationTable from "./tables/operation";
import StatisticTable from "./tables/statistic";
import VecDocumentTable from "./tables/vec-document";
import FtsTable from "./tables/fts";
import VideoNoteTable from "./tables/video-note";
import VideoNoteItemTable from "./tables/video-note-item";
import ContentTable, { CONTENT_RELEASE_GRACE_MS } from "./tables/content";
import QuestionTable from "./tables/question";
import QuestionLinkTable from "./tables/question-link";
import ContentLinkTable from "./tables/content-link";
import ComposeBoardTable from "./tables/compose-board";
import EntitySearchTable from "./tables/entity-search";
import QuestionEventTable from "./tables/question-event";
import QuestionChatTable from "./tables/question-chat";
import WhiteBoardContentTable from "./tables/white-board-content";
import DataTableTable from "./tables/data-table";
import DatabaseItemTable from "./tables/database-item";
import VibeLearningProjectTable from "./tables/vibe-learning-project";
import DataTableViewTable from "./tables/data-table-view";
import TodoGroupTable from "./tables/todo-group";
import TodoItemTable from "./tables/todo-item";
import TodoNoteLinkTable from "./tables/todo-note-link";
import TodoRecurrenceTable from "./tables/todo-recurrence";
import TodoRecurrenceCompletionTable from "./tables/todo-recurrence-completion";
import TodoCalendarMappingTable from "./tables/todo-calendar-mapping";
import TodoCalendarSyncTable from "./tables/todo-calendar-sync";
import QuestionGroupTable from "./tables/question-group";
import PomodoroPresetTable from "./tables/pomodoro-preset";
import PomodoroSessionTable from "./tables/pomodoro-session";
import PomodoroCalendarMappingTable from "./tables/pomodoro-calendar-mapping";
import CalendarGroupTable from "./tables/calendar-group";
import CalendarTable from "./tables/calendar";
import CalendarEventTable from "./tables/calendar-event";
import PodcastTable from "./tables/podcast";
import WebLinkTable from "./tables/web-link";
import WebClipTable from "./tables/web-clip";
import WebNoteTable from "./tables/web-note";
import WebViewPreferenceTable from "./tables/web-view-preference";
import EntityLineageTable from "./tables/entity-lineage";
import ExcerptTable from "./tables/excerpt";
import MaterialTable from "./tables/material";
import FlashcardTable from "./tables/flashcard";
import RandomWalkTable from "./tables/random-walk";
import ResourceSyncBlacklistTable from "./tables/resource-sync-blacklist";
import PublishSelectionTable from "./tables/publish-selection";
import PublishHistoryTable from "./tables/publish-history";
import TranscriptionTable from "./tables/transcription";
import VibeLearningResourceTable from "./tables/vibe-learning-resource";
import VLNoteTable from "./tables/vl-note";
import VLQuizTable from "./tables/vl-quiz";
import { shouldVacuumDatabase } from "./database-maintenance";
import mainContentIndexDBManager, {
  EnsureIndexReadyResult,
  IndexRebuildState,
  IndexRebuildTarget,
} from "./main-content-index-db";
import MAIN_SCHEMA_SQL from "@tau/db-schema/schema/main.sql?raw";
import { loadSqliteVecExtension } from "../utils/sqlite-vec-loader";
import { executeReadOnlySql, type SqlQueryInput } from "./sql-query";
import { recoverSessionDownload } from "./pi-session-store";
import { assertDatabaseNotSyncing } from "@tau/db-schema/sync";
import { assertNoLegacyTables } from "@tau/db-schema/src/legacy-table-guard";
import { upgradeWhiteboardCardElements } from "./whiteboard-document-upgrade";
import { upgradeDataTableViewOptions } from "./data-table-view-options-upgrade";
import { upgradeDiaryEntityReferences } from "./diary-entity-upgrade";
import { upgradeExcerptProviders } from "./excerpt-provider-upgrade";
import { broadcastScheduleChange, isScheduleWrite } from "./schedule-changes";
import { broadcastDatabaseChange } from "./database-notifications";
import { getExtraTableRefsProvider } from "./extra-table-refs";

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
  private readyDatabaseTasks: Map<string, Promise<Database.Database>> = new Map();
  private databaseWriteCallbacks: Array<(dbName: string, eventName: string) => void> = [];

  /** 渲染进程发起的数据库写命令提交成功后回调（索引调度等据此感知内容变化） */
  onDatabaseWrite(callback: (dbName: string, eventName: string) => void): () => void {
    this.databaseWriteCallbacks.push(callback);
    return () => {
      this.databaseWriteCallbacks = this.databaseWriteCallbacks.filter(cb => cb !== callback);
    };
  }

  /** 不经 eventAndHandlers 的写入（如自有 IPC 的模块）提交后，补发写事件给订阅方 */
  notifyExternalWrite(eventName: string): void {
    const dbName = this.getCurrentDatabaseName();
    if (dbName) this.notifyDatabaseWrite(dbName, eventName);
  }

  private notifyDatabaseWrite(dbName: string, eventName: string): void {
    if (isScheduleWrite(eventName)) broadcastScheduleChange(dbName);
    if (/^vl-quiz:(create|update|delete)(-|$)/.test(eventName)) {
      broadcastDatabaseChange("vl-quiz:changed", dbName);
    }
    for (const cb of this.databaseWriteCallbacks) {
      try {
        cb(dbName, eventName);
      } catch (error) {
        log.warn(`[database] write callback failed: event=${eventName}`, error);
      }
    }
  }

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
      DailyNoteTable,
      DiaryTable,
      ChatGroupTable,
      ChatSessionTable,
      OperationTable,
      StatisticTable,
      VideoNoteItemTable,
      VideoNoteTable,
      QuestionGroupTable,
      QuestionTable,
      QuestionEventTable,
      QuestionLinkTable,
      QuestionChatTable,
      ContentLinkTable,
      ComposeBoardTable,
      EntitySearchTable,
      DataTableTable,
      DatabaseItemTable,
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
      CalendarGroupTable, // 必须在 TodoCalendarSyncTable 和 PomodoroSessionTable 之前
      CalendarTable,
      CalendarEventTable,
      TodoCalendarSyncTable, // 移到 CalendarGroupTable 之后
      WebLinkTable,
      WebClipTable,
      WebNoteTable,
      WebViewPreferenceTable,
      EntityLineageTable,
      ExcerptTable,
      MaterialTable,
      FlashcardTable,
      RandomWalkTable,
      ResourceSyncBlacklistTable,
      PublishSelectionTable,
      PublishHistoryTable,
      TranscriptionTable,
      VibeLearningProjectTable,
      VibeLearningResourceTable,
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

  openDatabase(name: string, mode: DatabaseConnectMode = "maintenance", allowOwnedSync = false) {
    const startedAt = Date.now();
    const appDir = PathUtil.getAppDir();
    const dbPath = join(appDir, `${this.formatDatabaseName(name)}.db`);
    assertDatabaseNotSyncing(dbPath, allowOwnedSync);
    recoverSessionDownload(dbPath);
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

      // 数据基线门禁：残留历史旧表的库来自未完成最后升级的旧版本，在任何写入之前拒绝进入
      assertNoLegacyTables(database);

      const schemaStartAt = Date.now();
      database.exec(MAIN_SCHEMA_SQL);
      log.info(
        `[database] openDatabase main schema done: db=${name}, elapsedMs=${Date.now() - schemaStartAt}`
      );

      const upgradedPages = upgradeWhiteboardCardElements(database);
      if (upgradedPages > 0)
        log.info(`[database] 白板卡片元素升级为文档卡: db=${name}, pages=${upgradedPages}`);

      const upgradedViews = upgradeDataTableViewOptions(database);
      if (upgradedViews > 0)
        log.info(`[database] 数据表视图配置收进 viewOptions: db=${name}, views=${upgradedViews}`);

      upgradeDiaryEntityReferences(database);

      if (upgradeExcerptProviders(database))
        log.info(`[database] 摘录补齐位置、外链与提供方: db=${name}`);

      if (mode === "maintenance") {
        const maintenanceStartAt = Date.now();
        TodoGroupTable.ensureSystemGroups(database);
        QuestionGroupTable.ensureDefaultGroup(database);
        DiaryTable.ensureDefaultTagSettings(database);
        FlashcardTable.upgradeTable(database);
        ContentLinkTable.migrateCardsLinks(database);
        TodoCalendarSyncTable.ensureTodoCalendars(database);
        try {
          TodoCalendarSyncTable.cleanupOrphanedEvents(database);
        } catch (error) {
          log.error("[database] 清理孤立日历事件失败:", error);
        }
        try {
          // 表回收先于正文回收：表按实际引用复活时 retain 正文，能救回同批待回收正文（D-136）。
          // 协作私有块是表引用的事实来源之一，来源未就绪或读取失败就不能确认无引用，跳过本次
          const extraTableRefs = getExtraTableRefsProvider();
          if (extraTableRefs) {
            const collectedTables = DataTableTable.collectPendingTables(database, {
              now: Date.now(),
              graceMs: CONTENT_RELEASE_GRACE_MS,
              extraTableRefs: () => extraTableRefs(name),
            });
            if (collectedTables > 0)
              log.info(`[database] 回收超宽限期数据表: db=${name}, count=${collectedTables}`);
          } else {
            log.warn(`[database] 协作模块未就绪，本次跳过数据表回收: db=${name}`);
          }
        } catch (error) {
          log.error("[database] 回收待释放数据表失败:", error);
        }
        try {
          const purgedContents = ContentTable.collectPendingReleases(database, {
            now: Date.now(),
            graceMs: CONTENT_RELEASE_GRACE_MS,
          });
          if (purgedContents > 0)
            log.info(`[database] 回收超宽限期正文: db=${name}, count=${purgedContents}`);
        } catch (error) {
          log.error("[database] 回收待释放正文失败:", error);
        }
        StatisticTable.doStatistic(database);
        log.info(
          `[database] openDatabase maintenance done: db=${name}, tableCount=${this.tables.length}, elapsedMs=${Date.now() - maintenanceStartAt}`
        );

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
      const {
        busy,
        log: frames,
        checkpointed,
      } = db.prepare("PRAGMA wal_checkpoint(FULL)").get() as any;
      if (busy !== 0) throw new Error("存在未释放的数据库锁");
      if (checkpointed < frames) throw new Error("WAL 文件未完全合并");
      if (indexDb) {
        const indexCheckpoint = indexDb.prepare("PRAGMA wal_checkpoint(FULL)").get() as any;
        if (indexCheckpoint?.busy !== 0) {
          throw new Error("索引数据库存在未释放的数据库锁");
        }
        if (indexCheckpoint?.checkpointed < indexCheckpoint?.log) {
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
          const ensureResult = mainContentIndexDBManager.ensureReady(name);
          log.info(
            `[database] index ensureReady done: db=${name}, reason=${reason}, rebuildState=${ensureResult.rebuildState}, elapsedMs=${Date.now() - ensureStartAt}`
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

  private openReadyDatabase(name: string, mode: DatabaseConnectMode, allowOwnedSync = false) {
    const pending = this.readyDatabaseTasks.get(name);
    if (pending) return pending;
    const task = Promise.resolve()
      .then(async () => {
        const database = this.openDatabase(name, mode, allowOwnedSync);
        this.databases.set(name, database);
        return database;
      })
      .finally(() => {
        this.readyDatabaseTasks.delete(name);
      });
    this.readyDatabaseTasks.set(name, task);
    return task;
  }

  async reconnectForSync(name: string, source: DatabaseReconnectSource) {
    log.info(`[database] reconnectForSync: db=${name}, source=${source}`);
    if (this.databases.has(name)) {
      this.databases.get(name)!.close();
      this.databases.delete(name);
      mainContentIndexDBManager.closeDatabase(name);
    }
    await this.openReadyDatabase(
      name,
      source === "sync_download_reconnect" ? "maintenance" : "normal",
      true
    );
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
        // 数据基线门禁：与本地开库同一接受边界，旧端上传的快照在这里被拒绝
        assertNoLegacyTables(db);
        db.exec(MAIN_SCHEMA_SQL);
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
          this.databases.delete(name);
          mainContentIndexDBManager.closeDatabase(name);
        }
        await this.openReadyDatabase(
          name,
          connectMode,
          source === "sync_upload_reconnect" || source === "sync_download_reconnect"
        );
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

    ipcMain.handle(
      "sql-query",
      async (event, input: SqlQueryInput, scope?: { toolDatabaseName?: string }) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win) throw new Error("No window found");
        const dbName = scope?.toolDatabaseName
          ? [...this.databases.keys()].find(
              name =>
                this.formatDatabaseName(name) === this.formatDatabaseName(scope.toolDatabaseName!)
            )
          : this.windowToDatabase.get(win.id);
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
      }
    );

    Object.keys(this.eventAndHandlers).forEach(eventName => {
      ipcMain.handle(eventName, async (event, ...args) => {
        const sender = event.sender;
        const win = BrowserWindow.fromWebContents(sender);
        if (!win) throw new Error("No window found");

        const scope = args.at(-1);
        const explicit =
          scope && typeof scope.toolDatabaseName === "string"
            ? scope.toolDatabaseName
            : eventName.startsWith("chat-session:") && typeof scope?.chatDatabaseName === "string"
              ? scope.chatDatabaseName
              : undefined;
        if (explicit !== undefined) args.pop();
        const dbName = explicit
          ? [...this.databases.keys()].find(
              name => this.formatDatabaseName(name) === this.formatDatabaseName(explicit)
            )
          : this.windowToDatabase.get(win.id);
        if (!dbName) throw new Error("No database name found");

        const db = this.getDatabase(dbName);
        if (!db) throw new Error("No database found");

        log.info(`database ${dbName} event ${eventName}`);
        // 完成日志与开始日志成对出现：排查 IPC 挂起时，缺 done 的最后一条 event 即卡住点
        const startedAt = Date.now();
        try {
          db.exec("BEGIN");
          const res = await this.eventAndHandlers[eventName](
            db,
            ...args,
            createWindowCommandContext(win)
          );
          db.exec("COMMIT");
          const elapsedMs = Date.now() - startedAt;
          recordSqlCall(dbName, eventName, elapsedMs, true);
          // database 事件是主要 IPC 流量，计入速率统计供洪水检测（聚焦刷新风暴等）
          recordIpcCall(eventName, elapsedMs, true);
          this.notifyDatabaseWrite(dbName, eventName);
          log.info(`database ${dbName} event ${eventName} done elapsedMs=${elapsedMs}`);
          return res;
        } catch (e) {
          const elapsedMs = Date.now() - startedAt;
          recordSqlCall(dbName, eventName, elapsedMs, false);
          recordIpcCall(eventName, elapsedMs, false);
          log.error(
            `[database] event failed: db=${dbName}, event=${eventName}, elapsedMs=${Date.now() - startedAt}`,
            e
          );
          db.exec("ROLLBACK");
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

        const scope = args.at(-1);
        const explicit =
          typeof scope?.toolDatabaseName === "string" ? scope.toolDatabaseName : undefined;
        if (explicit !== undefined) args.pop();
        const dbName = explicit
          ? [...this.databases.keys()].find(
              name => this.formatDatabaseName(name) === this.formatDatabaseName(explicit)
            )
          : this.windowToDatabase.get(win.id);
        if (!dbName) throw new Error("No database name found");

        const mainDb = this.getDatabase(dbName);
        if (!mainDb) throw new Error("No main database found");

        await this.ensureIndexDatabaseReady(dbName, `ipc:${eventName}`);

        const indexDb = this.getIndexDatabase(dbName);
        if (!indexDb) throw new Error("No index database found");

        log.info(`database ${dbName} index event ${eventName}`);
        const indexStartedAt = Date.now();
        const logIndexDone = () =>
          log.info(
            `database ${dbName} index event ${eventName} done elapsedMs=${Date.now() - indexStartedAt}`
          );

        const startedAt = Date.now();
        if (readOnlyIndexEvents.has(eventName)) {
          const res = await this.indexEventAndHandlers[eventName](
            mainDb,
            indexDb,
            ...args,
            createWindowCommandContext(win)
          );
          const elapsedMs = Date.now() - startedAt;
          recordSqlCall(dbName, eventName, elapsedMs, true);
          recordIpcCall(eventName, elapsedMs, true);
          logIndexDone();
          return res;
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
          const elapsedMs = Date.now() - startedAt;
          recordSqlCall(dbName, eventName, elapsedMs, true);
          recordIpcCall(eventName, elapsedMs, true);
          logIndexDone();
          return res;
        } catch (e) {
          const elapsedMs = Date.now() - startedAt;
          recordSqlCall(dbName, eventName, elapsedMs, false);
          recordIpcCall(eventName, elapsedMs, false);
          log.error(
            `[database] index event failed: db=${dbName}, event=${eventName}, elapsedMs=${Date.now() - indexStartedAt}`,
            e
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

        if (!this.forceCheckpoint(name)) throw new Error("数据库仍在使用，不能安全关闭和同步");

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
