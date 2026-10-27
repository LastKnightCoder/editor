import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { upgradeMainVersion } from "../upgrade-main-version-10.mjs";

for (const version of [null, "4", "9", "999"]) {
  test(`版本 ${version} 补为 10，备份包含 WAL 数据，正文与指纹不变且可重复执行`, async () => {
    const directory = mkdtempSync(join(tmpdir(), "tau-version-test-"));
    const path = join(directory, "data.db");
    const db = new DatabaseSync(path);
    try {
      db.exec(
        "PRAGMA journal_mode = WAL; CREATE TABLE contents(id INTEGER PRIMARY KEY, content TEXT); CREATE TABLE cards(id INTEGER PRIMARY KEY, links TEXT); INSERT INTO contents VALUES (1, '正文不能丢'); INSERT INTO cards VALUES (7, '[8]')"
      );
      if (version !== null) {
        db.exec(
          "CREATE TABLE schema_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL); INSERT INTO schema_meta VALUES ('main_schema_hash', 'original', 0)"
        );
        db.prepare("INSERT INTO schema_meta VALUES ('main_schema_version', ?, 0)").run(version);
      }
      const result = await upgradeMainVersion(path);
      assert.equal(result.status, "updated");
      assert.equal(
        db.prepare("SELECT value FROM schema_meta WHERE key='main_schema_version'").get().value,
        "10"
      );
      const saved = new DatabaseSync(result.backupPath, { readOnly: true });
      try {
        for (const table of ["contents", "cards"])
          assert.deepEqual(
            db.prepare(`SELECT * FROM ${table}`).all(),
            saved.prepare(`SELECT * FROM ${table}`).all()
          );
        if (version !== null) {
          assert.equal(
            saved.prepare("SELECT value FROM schema_meta WHERE key='main_schema_version'").get()
              .value,
            version
          );
          assert.equal(
            db.prepare("SELECT value FROM schema_meta WHERE key='main_schema_hash'").get().value,
            "original"
          );
        }
      } finally {
        saved.close();
      }
      assert.equal((await upgradeMainVersion(path)).status, "unchanged");
    } finally {
      db.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
}

test("跳过非主库，不创建不存在的文件", async () => {
  const directory = mkdtempSync(join(tmpdir(), "tau-version-test-"));
  const path = join(directory, "usage.db");
  const db = new DatabaseSync(path);
  try {
    db.exec("CREATE TABLE usage(id INTEGER PRIMARY KEY)");
    assert.equal((await upgradeMainVersion(path)).status, "skipped");
    assert.equal(
      db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='schema_meta'").get().n,
      0
    );
    await assert.rejects(upgradeMainVersion(join(directory, "missing.db")));
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
