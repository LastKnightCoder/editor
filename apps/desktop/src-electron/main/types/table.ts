import Database from "better-sqlite3";

/** better-sqlite3 的 get/all 返回 unknown；行先按此收敛，再在 parse 内逐字段断言，不用 any 穿透 */
export type SqliteRow = Record<string, unknown>;

export interface Table {
  getListenEvents: () => Record<
    string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 异构事件注册表：any 参数位提供双向变体，具体 handler（含必选参数元组）才能赋入
    (db: Database.Database, ...args: any) => unknown
  >;
}
