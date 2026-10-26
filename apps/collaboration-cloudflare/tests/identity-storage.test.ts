import { createRequire } from "node:module";
import { expect, it } from "vitest";
import { CollaborationStore } from "../src/store";

const require = createRequire(new URL("../../collaboration-server/package.json", import.meta.url));
const Database = require("better-sqlite3");

it("旧身份合并库在任何初始化写入前被拒绝，原表与映射保留", () => {
  const db = new Database(":memory:");
  try {
    db.exec(
      "CREATE TABLE identity_merges(source_id TEXT PRIMARY KEY,target_id TEXT NOT NULL,created_at INTEGER NOT NULL); INSERT INTO identity_merges VALUES ('source','target',1)"
    );
    const before = db.prepare("SELECT name,sql FROM sqlite_master ORDER BY name").all();
    const storage = {
      sql: {
        exec(sql: string, ...values: unknown[]) {
          const statement = db.prepare(sql);
          const rows = statement.reader ? statement.all(...values) : (statement.run(...values), []);
          return { toArray: () => rows };
        },
      },
    } as unknown as DurableObjectStorage;
    expect(() => new CollaborationStore(storage)).toThrow("已退役的身份合并记录");
    expect(db.prepare("SELECT name,sql FROM sqlite_master ORDER BY name").all()).toEqual(before);
    expect(db.prepare("SELECT * FROM identity_merges").all()).toEqual([
      { source_id: "source", target_id: "target", created_at: 1 },
    ]);
  } finally {
    db.close();
  }
});
