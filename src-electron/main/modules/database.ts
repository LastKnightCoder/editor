import { ipcMain } from 'electron';
import PathUtil from "../utils/PathUtil";
import Database from 'better-sqlite3';
import { join } from "node:path";
import { Module } from "../types/module";
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

import * as sqliteVec from "sqlite-vec";

class DatabaseModule implements Module {
  name: string;

  databases: Map<string, Database.Database>;

  constructor() {
    this.name = 'database';
    this.databases = new Map();
  }

  formatDatabaseName(databaseName: string) {
    let newDatabaseName = databaseName;
    // 如果以 .db 结尾，则去掉
    if (databaseName.endsWith('.db')) {
      newDatabaseName = databaseName.slice(0, -3);
    }
    return newDatabaseName;
  }

  async init() {
    ipcMain.handle('create-or-connect-database', async (_, name) => {
      const appDir = PathUtil.getAppDir();
      const dbPath = join(appDir, `${this.formatDatabaseName(name)}.db`);
      let database;
      if (this.databases.has(name)) {
        database = this.databases.get(name);
      } else {
        console.log(`connect database ${dbPath}`);
        database = new Database(dbPath);
        this.databases.set(name, database);

        database.pragma('journal_mode = WAL');

        sqliteVec.load(database);

        // TODO，多窗口的管理
        // 维护一个窗口和 database 的关系，一一对应？
        new CardTable(database);
        new ArticleTable(database);
        new DocumentTable(database);
        new WhiteboardTable(database);
        new ProjectTable(database);
        new DailyNoteTable(database);
        new TimeRecordTable(database);
        new PdfTable(database);
        new VecDocumentTable(database);
        new ChatMessageTable(database);
      }
    });

    ipcMain.handle('close-database', async (_, name) => {
      if (this.databases.has(name)) {
        const database = this.databases.get(name);
        database!.close();
        this.databases.delete(name);
      }
    });

    ipcMain.handle('close-all-database', async () => {
      for (const [name, database] of this.databases) {
        database.close();
        this.databases.delete(name);
      }
    })
  }
}

export default new DatabaseModule();