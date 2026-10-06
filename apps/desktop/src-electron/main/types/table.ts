import Database from "better-sqlite3";

export interface Table {
  getListenEvents: () => Record<string, (db: Database.Database, ...args: any) => any>;
}
