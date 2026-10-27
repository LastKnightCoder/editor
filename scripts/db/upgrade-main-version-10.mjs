#!/usr/bin/env node
import { DatabaseSync, backup } from "node:sqlite";
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// 只接续已完成结构升级的资料库标记，不重写业务数据或 SQL 指纹。
export async function upgradeMainVersion(filename) {
  const path = realpathSync(filename);
  const db = new DatabaseSync(path);
  let backupPath;
  try {
    db.exec("PRAGMA busy_timeout = 5000");
    const tables = new Set(
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map(row => row.name)
    );
    if (!tables.has("contents") || !tables.has("cards")) return { path, status: "skipped" };
    const version = tables.has("schema_meta")
      ? db.prepare("SELECT value FROM schema_meta WHERE key = 'main_schema_version'").get()?.value
      : undefined;
    if (version === "10") return { path, status: "unchanged" };
    const checks = db.prepare("PRAGMA quick_check").all();
    if (checks.length !== 1 || checks[0].quick_check !== "ok")
      throw new Error("数据库完整性检查失败，未修改版本");
    const backupRoot = join(dirname(path), "backup");
    mkdirSync(backupRoot, { recursive: true });
    const backupDir = mkdtempSync(join(backupRoot, "schema-version-10-"));
    backupPath = join(backupDir, basename(path));
    await backup(db, backupPath);
    chmodSync(backupPath, 0o600);
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(
        "CREATE TABLE IF NOT EXISTS schema_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)"
      );
      db.prepare(
        "INSERT INTO schema_meta(key, value, updated_at) VALUES ('main_schema_version', '10', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
      ).run(Date.now());
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return { path, status: "updated", previousVersion: version ?? null, version: "10", backupPath };
  } catch (error) {
    throw new Error(`${path}: ${error.message}${backupPath ? `；备份：${backupPath}` : ""}`, {
      cause: error,
    });
  } finally {
    db.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const targets = process.argv.slice(2);
  if (!targets.length) {
    console.error(
      "用法：node scripts/db/upgrade-main-version-10.mjs <数据库文件或资料库目录> [...更多路径]"
    );
    process.exitCode = 1;
  }
  const seen = new Set();
  for (const target of targets) {
    try {
      const paths = statSync(target).isDirectory()
        ? readdirSync(target, { withFileTypes: true })
            .filter(entry => entry.isFile() && entry.name.endsWith(".db"))
            .map(entry => join(target, entry.name))
        : [target];
      for (const path of paths) {
        const realPath = realpathSync(path);
        if (seen.has(realPath)) continue;
        seen.add(realPath);
        try {
          console.log(JSON.stringify(await upgradeMainVersion(realPath)));
        } catch (error) {
          console.error(error.message);
          process.exitCode = 1;
        }
      }
    } catch (error) {
      console.error(`${target}: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
