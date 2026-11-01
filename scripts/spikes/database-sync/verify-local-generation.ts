import assert from "node:assert/strict";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  deviceGeneration,
  initializeDeviceSyncDatabase,
} from "../../../apps/desktop/src-electron/main/modules/device-sync/database-store";

export async function verifyLocalGeneration(
  source: any,
  Database: any,
  root: string,
  extension: string,
  native: (action: string, payload: unknown, path: string) => any
) {
  const cases = [
    [
      "missing-column",
      "ALTER TABLE _tau_device_local RENAME COLUMN generation TO broken_generation",
      true,
    ],
    ["extra-column", "ALTER TABLE _tau_device_local ADD COLUMN extra TEXT", false],
    ["missing-row", "DELETE FROM _tau_device_local", true],
    ["invalid-value", "UPDATE _tau_device_local SET generation='broken'", true],
    ["missing-table", "DROP TABLE _tau_device_local", true],
  ] as const;
  const materials = (db: any) =>
    [
      "contents",
      "content_documents",
      "cards",
      "_tau_device_state",
      "_tau_device_documents",
      "_tau_device_log",
      "_tau_device_json_intents",
    ].map(table => db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all());
  for (const platform of ["desktop", "rust"]) {
    for (const [name, damage, renew] of cases) {
      const path = join(root, `generation-${platform}-${name}.db`);
      await source.backup(path);
      let db = new Database(path);
      db.prepare("UPDATE cards SET tags=? WHERE id=1").run('["有效未确认修改"]');
      const content = JSON.parse(
        db.prepare("SELECT content FROM contents WHERE id=1").get().content
      );
      content[0].children[0].text += "有效待转换输入";
      db.prepare("UPDATE contents SET content=? WHERE id=1").run(JSON.stringify(content));
      assert.ok(db.prepare("SELECT 1 FROM _tau_device_json_intents").get());
      const generation = randomUUID();
      db.prepare("UPDATE _tau_device_local SET generation=?").run(generation);
      const before = materials(db);
      db.exec(damage);
      if (platform === "desktop") initializeDeviceSyncDatabase(db, extension);
      else {
        db.close();
        native("open", {}, path);
        db = new Database(path);
      }
      const repaired = deviceGeneration(db);
      assert.match(repaired, /^[0-9a-f-]{36}$/);
      if (renew) assert.notEqual(repaired, generation);
      else assert.equal(repaired, generation);
      assert.deepEqual(materials(db), before);
      assert.equal(
        db.prepare("SELECT count(*) AS n FROM pragma_table_info('_tau_device_local')").get().n,
        2
      );
      if (name !== "missing-table")
        assert.ok(
          db
            .prepare("SELECT 1 FROM sqlite_master WHERE name GLOB '_tau_device_quarantine_*_local'")
            .get()
        );
      const detail = db
        .prepare(
          "SELECT c.content,d.contracts,d.revision,d.document_id,l.source_id FROM contents c JOIN content_documents d ON d.content_id=c.id CROSS JOIN library_identity l WHERE c.id=1"
        )
        .get();
      db.close();
      const payload = {
        contentId: 1,
        content: JSON.parse(detail.content),
        count: 4,
        contracts: JSON.parse(detail.contracts),
        expectedRevision: detail.revision,
        expectedDocumentId: detail.document_id,
        expectedSourceId: detail.source_id,
      };
      if (renew)
        assert.throws(
          () => native("json-save", { ...payload, expectedGeneration: generation }, path),
          /DEVICE_SYNC_REPLACED/
        );
      native("json-save", { ...payload, expectedGeneration: repaired }, path);
    }
  }

  const path = join(root, "generation-errors.db");
  await source.backup(path);
  const db = new Database(path, { timeout: 25 });
  const quarantineCount = () =>
    db
      .prepare("SELECT count(*) AS n FROM sqlite_master WHERE name GLOB '_tau_device_quarantine_*'")
      .get().n;
  const before = materials(db),
    count = quarantineCount();
  const reader = new Database(path, { readonly: true });
  assert.equal(deviceGeneration(reader), deviceGeneration(db));
  reader.close();
  db.exec("ALTER TABLE _tau_device_local RENAME COLUMN generation TO broken_generation");
  const damaged = materials(db);
  const readonly = new Database(path, { readonly: true });
  assert.throws(() => deviceGeneration(readonly), /readonly/);
  readonly.close();
  assert.throws(() => native("open", {}, `file:${path}?mode=ro`), /readonly/);
  assert.equal(quarantineCount(), count);
  assert.deepEqual(materials(db), damaged);

  db.exec("BEGIN IMMEDIATE");
  const contender = new Database(path, { timeout: 25 });
  assert.throws(() => deviceGeneration(contender), /locked/);
  contender.close();
  assert.throws(() => native("open", {}, path), /locked/);
  db.exec("ROLLBACK");
  assert.equal(quarantineCount(), count);
  assert.deepEqual(materials(db), before);
  db.exec("CREATE TABLE quota_padding(value BLOB)");
  const pageCount = db.pragma("page_count", { simple: true });
  db.pragma(`max_page_count=${pageCount}`);
  const fill = db.prepare("INSERT INTO quota_padding VALUES(zeroblob(3000))");
  for (;;) {
    try {
      fill.run();
    } catch (error) {
      assert.match(String(error), /full/);
      break;
    }
  }
  assert.throws(() => deviceGeneration(db), /full/);
  assert.throws(() => native("open", { maxPages: pageCount }, path), /full/);
  assert.equal(quarantineCount(), count);
  assert.deepEqual(materials(db), before);
  db.pragma("max_page_count=1073741823");
  db.exec("DROP TABLE quota_padding");
  initializeDeviceSyncDatabase(db, extension);
  db.close();
  console.log("P1-3：两端 10 组结构/记录恢复保全；真实 SQLite 只读、锁忙、磁盘配额失败如实返回");
}
