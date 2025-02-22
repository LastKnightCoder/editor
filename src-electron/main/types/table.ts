import Database from "better-sqlite3";

export interface Table {
  initTable: (db: Database.Database) => void;
  upgradeTable: (db: Database.Database) => void;
  getListenEvents: () => Record<string, (db: Database.Database, ...args: any) => any>;
}
