import Database from "better-sqlite3";

/** better-sqlite3 的 get/all 返回 unknown；行先按此收敛，再在 parse 内逐字段断言，不用 any 穿透 */
export type SqliteRow = Record<string, unknown>;

export interface Table {
  getListenEvents: () => Record<string, (db: Database.Database, ...args: any) => any>;
}
