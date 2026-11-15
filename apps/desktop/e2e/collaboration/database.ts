import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseConnectReason } from "../../src-electron/main/modules/database";

const directory = process.env.TAU_COLLAB_E2E_DIR!;
const databases = new Map<string, Database.Database>();
for (const name of ["primary", "secondary", "coedit"]) {
  const db = new Database(join(directory, `${name}.db`));
  db.exec(readFileSync(process.env.TAU_COLLAB_E2E_SCHEMA!, "utf8"));
  const content = JSON.stringify([
    {
      type: "paragraph",
      children: [{ type: "formatted", text: name === "primary" ? "同步测试正文" : "另一个数据库" }],
    },
  ]);
  db.prepare(
    "INSERT OR IGNORE INTO contents(id,create_time,update_time,content,count) VALUES (7,100,100,?,6)"
  ).run(content);
  db.exec(
    "INSERT OR IGNORE INTO articles(id,title,create_time,update_time,content_id) VALUES (1,'协作测试标题',1,1,7); INSERT OR IGNORE INTO project_item(id,title,create_time,update_time,content_id) VALUES (2,'项目旧标题',1,1,7),(3,'共享项目旧标题',1,1,7);"
  );
  databases.set(name, db);
}

const windowToDatabase = new Map<number, string>();
const connected = new Set<(name: string, reason: DatabaseConnectReason) => void>();

export default {
  databases,
  windowToDatabase,
  getDatabase: (name: string) => databases.get(name),
  onDatabaseConnected(callback: (name: string, reason: DatabaseConnectReason) => void) {
    connected.add(callback);
    return () => {
      connected.delete(callback);
    };
  },
  bindWindow(windowId: number, name: string) {
    if (!databases.has(name)) throw new Error("验收资料库不存在");
    const previous = windowToDatabase.get(windowId);
    windowToDatabase.set(windowId, name);
    if (previous === name) return;
    for (const callback of connected) {
      try {
        callback(name, previous === undefined ? "connect" : "switch");
      } catch (error) {
        console.warn("验收资料库连接通知失败", error);
      }
    }
  },
};
