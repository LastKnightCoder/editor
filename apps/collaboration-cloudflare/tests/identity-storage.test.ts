import { createHash } from "node:crypto";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { expect, it } from "vitest";
import { CollaborationStore } from "../src/store";

it("原地接管旧存储，保留身份、签名密钥及历史账本，不重新启用旧身份", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE identity_merges(source_id TEXT PRIMARY KEY,target_id TEXT NOT NULL,created_at INTEGER NOT NULL);
      CREATE TABLE collaboration_migrations(operation_id TEXT PRIMARY KEY,document_id TEXT NOT NULL,value TEXT NOT NULL);
      CREATE TABLE devices(id TEXT PRIMARY KEY,nickname TEXT NOT NULL,secret_hash TEXT NOT NULL,banned INTEGER NOT NULL,created_at INTEGER NOT NULL);
      CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    `);
    db.prepare("INSERT INTO identity_merges VALUES (?,?,?)").run("source", "target", 1);
    const receipt = '{ "id":"upgrade", "documentId":"past-room", "state":"COMMITTED" }';
    db.prepare("INSERT INTO collaboration_migrations VALUES (?,?,?)").run(
      "upgrade",
      "past-room",
      receipt
    );
    for (const [id, banned] of [
      ["source", 1],
      ["target", 0],
    ] as const)
      db.prepare("INSERT INTO devices VALUES (?,?,?,?,?)").run(
        id,
        id,
        createHash("sha256")
          .update(id + "-secret")
          .digest("hex"),
        banned,
        1
      );
    db.prepare("INSERT INTO settings VALUES (?,?)").run("signing_key", "a".repeat(64));
    const before = db.prepare("SELECT * FROM devices ORDER BY id").all();
    const storage = {
      sql: {
        exec(sql: string, ...values: SQLInputValue[]) {
          if (!values.length && sql.split(";").filter(part => part.trim()).length > 1) {
            db.exec(sql);
            return { toArray: () => [] };
          }
          const rows = db.prepare(sql).all(...values);
          return { toArray: () => rows };
        },
      },
      transactionSync: <T>(action: () => T): T => {
        db.exec("BEGIN");
        try {
          const result = action();
          db.exec("COMMIT");
          return result;
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      },
    } as unknown as DurableObjectStorage;
    for (let restart = 0; restart < 2; restart++) {
      const store = new CollaborationStore(storage, false);
      expect(store.authenticate("target:target-secret").id).toBe("target");
      expect(() => store.authenticate("source:source-secret")).toThrow("身份凭据无效");
      expect(store.exportMetadata()).toMatchObject({
        format: 6,
        signingKey: "a".repeat(64),
        tables: {
          identity_merges: [{ source_id: "source", target_id: "target", created_at: 1 }],
          collaboration_migrations: [
            { operation_id: "upgrade", document_id: "past-room", value: receipt },
          ],
        },
      });
      expect(db.prepare("SELECT * FROM devices ORDER BY id").all()).toEqual(before);
      expect(store).not.toHaveProperty("mergeIdentity");
    }
  } finally {
    db.close();
  }
});
