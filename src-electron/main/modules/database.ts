import { BrowserWindow, ipcMain } from 'electron';
import PathUtil from "../utils/PathUtil";
import Database from 'better-sqlite3';
import { join } from "node:path";
import { Module } from "../types/module";
import { Table } from "../types/table";
import CardTable from "./tables/card";
import ArticleTable from "./tables/article";
import DocumentTable from "./tables/document";
import WhiteboardTable from './tables/whiteboard';
import ProjectTable from './tables/project';
import TimeRecordTable from './tables/time-record';
import PdfTable from './tables/pdf';
import DailyNoteTable from './tables/daily-note';
import VecDocumentTable from './tables/vec-document';
import ChatMessageTable from './tables/chat-message';
import OperationTable from './tables/operation';
import StatisticTable from './tables/statistic';

import * as sqliteVec from "sqlite-vec";

class DatabaseModule implements Module {
  name: string;

  databases: Map<string, Database.Database>;
  windowToDatabase: Map<number, string>;
  tables: Table[];
  eventAndHandlers: Record<string, (db: Database.Database, ...args: any) => any>;
  databasePendingPromiseQueue: Map<string, any[]>;
  databaseLocks: Map<string, boolean>;

  async getDatabase(name: string): Promise<Database.Database | undefined> {
    return new Promise((resolve) => {
      if (this.databaseLocks.has(name)) {
        console.log(`database ${name} is locked, waiting...`)
        const queue = this.databasePendingPromiseQueue.get(name) || [];
        queue.push(resolve);
        this.databasePendingPromiseQueue.set(name, queue);
      } else {
        // console.log(`database ${name} is not locked`)
        const database = this.databases.get(name);
        this.databaseLocks.set(name, true);
        resolve(database);
      }
    });
  }

  returnDatabase(name: string) {
    // console.log(`database ${name} is unlocked`)
    if (this.databaseLocks.has(name)) {
      const queue = this.databasePendingPromiseQueue.get(name);
      if (queue) {
        const resolve = queue.shift();
        if (resolve) {
          console.log('正在从队列中取出 resolve 函数');
          resolve(this.databases.get(name));
        }
        if (queue.length === 0) {
          this.databasePendingPromiseQueue.delete(name);
          this.databaseLocks.delete(name);
        }
      } else {
        this.databaseLocks.delete(name);
      }
    }
  }

  constructor() {
    this.name = 'database';
    this.databases = new Map();
    this.windowToDatabase = new Map();
    this.tables = [
      CardTable,
      ArticleTable,
      DocumentTable,
      WhiteboardTable,
      ProjectTable,
      TimeRecordTable,
      PdfTable,
      DailyNoteTable,
      VecDocumentTable,
      ChatMessageTable,
      OperationTable,
      StatisticTable,
    ] as unknown as Table[];
    this.databasePendingPromiseQueue = new Map();
    this.databaseLocks = new Map();

    this.eventAndHandlers = this.tables.reduce((acc, table) => {
      const events = table.getListenEvents();
      return {
        ...acc,
        ...events,
      };
    }, {} as Record<string, (args: any) => Promise<any>>);

  }

  formatDatabaseName(databaseName: string) {
    let newDatabaseName = databaseName;
    // 如果以 .db 结尾，则去掉
    if (databaseName.endsWith('.db')) {
      newDatabaseName = databaseName.slice(0, -3);
    }
    return newDatabaseName;
  }

  addDbExtension(databaseName: string) {
    let newDatabaseName = databaseName;
    // 如果没有 .db 结尾，则加上
    if (!databaseName.endsWith('.db')) {
      newDatabaseName = `${databaseName}.db`;
    }
    return newDatabaseName;
  }

  async createDatabase(name: string) {
    const appDir = PathUtil.getAppDir();
    const dbPath = join(appDir, `${this.formatDatabaseName(name)}.db`);
    const database = new Database(dbPath);
    if (!database) throw new Error('No database found');
    sqliteVec.load(database);

    database.pragma('journal_mode = WAL');

    for (const table of this.tables) {
      table.initTable(database);
      table.upgradeTable(database);
    }

    try {
      database.exec('VACUUM');
    } catch (e) {
      console.error(e);
    }

    return database;
  }

  async init() {
    ipcMain.handle('create-or-connect-database',  async (event, name, force?: boolean) => {
      const appDir = PathUtil.getAppDir();
      const dbPath = join(appDir, `${this.formatDatabaseName(name)}.db`);
      let database: Database.Database | undefined;
      if (this.databases.has(name) && !force) {
        database = this.databases.get(name);
      } else {
        console.log(`connect database ${dbPath}`);
        if (this.databases.has(name)) {
          this.databases.get(name)!.close();
        }
        database = await this.createDatabase(name);
        this.databases.set(name, database);
      }

      const sender = event.sender;
      const win = BrowserWindow.fromWebContents(sender);
      if (win) {
        this.windowToDatabase.set(win.id, name);
      }
    });

    Object.keys(this.eventAndHandlers).forEach((eventName) => {
      ipcMain.handle(eventName, async (event, ...args) => {
        const sender = event.sender;
        const win = BrowserWindow.fromWebContents(sender);
        if (!win) throw new Error('No window found');

        const dbName = this.windowToDatabase.get(win.id);
        if (!dbName) throw new Error('No database name found');

        const db = await this.getDatabase(dbName);
        if (!db) throw new Error('No database found');

        console.log(`database ${dbName} event ${eventName}`);
        try {
          db.exec('BEGIN');
          const res = this.eventAndHandlers[eventName](db, ...args);
          db.exec('COMMIT');
          return res;
        } catch (e) {
          console.error(e);
          db.exec('ROLLBACK');
        } finally {
          this.returnDatabase(dbName);
        }
      });
    })

    ipcMain.handle('close-database', async (event, name) => {
      if (this.databases.has(name)) {
        const database = this.databases.get(name);
        if (!database) throw new Error('No database found');
        database.close();
        this.databases.delete(name);
        const sender = event.sender;
        const win = BrowserWindow.fromWebContents(sender);
        if (win) {
          this.windowToDatabase.delete(win.id);
        }
      }
    });

    ipcMain.handle('close-all-database', async () => {
      for (const [name, database] of this.databases) {
        database.close();
        this.databases.delete(name);
      }
      this.windowToDatabase.clear();
    });

    ipcMain.handle('get-database-path', (_, name) => {
      const appDir = PathUtil.getAppDir();
      return join(appDir, this.addDbExtension(name));
    })
  }
}

export default new DatabaseModule();
