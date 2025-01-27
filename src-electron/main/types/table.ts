import Database from "better-sqlite3";

export interface Table {
  initTable: (db: Database.Database) => Promise<void>;
  getListenEvents: () => Record<string, (db: Database.Database, ...args: any) => Promise<any>>;
}