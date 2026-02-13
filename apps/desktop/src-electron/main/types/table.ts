import Database from "better-sqlite3";

export interface Table {
  upgradeTable: (db: Database.Database) => void;
  getListenEvents: () => Record<
    string,
    (db: Database.Database, ...args: any) => any
  >;
}
