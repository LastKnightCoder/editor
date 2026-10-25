import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { resolve, join } from "node:path";
import * as Y from "yjs";

const [sourceArg, targetArg] = process.argv.slice(2);
if (!sourceArg || !targetArg)
  throw new Error("用法：export-node.mjs <Node 服务备份目录> <导出目录>");
const source = resolve(sourceArg),
  target = resolve(targetArg);
mkdirSync(target, { recursive: true, mode: 0o700 });
mkdirSync(join(target, "documents"), { recursive: true, mode: 0o700 });
mkdirSync(join(target, "assets"), { recursive: true, mode: 0o700 });
const require = createRequire(new URL("../../collaboration-server/package.json", import.meta.url));
const Database = require("better-sqlite3");
const db = new Database(join(source, "collaboration.db"), { readonly: true });
try {
  if (db.pragma("integrity_check", { simple: true }) !== "ok")
    throw new Error("来源数据库完整性检查失败");
  const tables = Object.fromEntries(
    ["devices", "documents", "members", "invitations", "join_requests", "assets", "audit"].map(
      table => [table, db.prepare("SELECT * FROM " + table).all()]
    )
  );
  tables.identity_merges = [];
  for (const table of [
    "collaboration_protocol",
    "collaboration_migrations",
    "collaboration_asset_history",
    "collaboration_operations",
    "collaboration_sequences",
  ])
    tables[table] = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
      .get(table)
      ? db.prepare("SELECT * FROM " + table).all()
      : [];
  const signingKey = readFileSync(join(source, "signing.key")).toString("hex");
  if (signingKey.length !== 64) throw new Error("来源签名密钥无效");
  for (const row of tables.documents.filter(doc => doc.status === "active")) {
    if (!/^[a-f0-9-]{36}$/.test(row.id)) throw new Error("来源文档标识无效");
    const snapshot = db.prepare("SELECT state FROM snapshots WHERE document_id=?").get(row.id);
    if (!snapshot) throw new Error("来源活动文档缺少快照");
    const doc = new Y.Doc();
    try {
      Y.applyUpdate(doc, snapshot.state);
      for (const update of db
        .prepare("SELECT state FROM updates WHERE document_id=? ORDER BY seq")
        .all(row.id))
        Y.applyUpdate(doc, update.state);
      writeFileSync(join(target, "documents", row.id), Y.encodeStateAsUpdate(doc), { mode: 0o600 });
    } finally {
      doc.destroy();
    }
  }
  for (const digest of new Set(tables.assets.map(row => row.hash))) {
    if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error("来源资源摘要无效");
    copyFileSync(join(source, "assets", digest), join(target, "assets", digest));
  }
  writeFileSync(join(target, "metadata.json"), JSON.stringify({ format: 3, signingKey, tables }), {
    mode: 0o600,
  });
  console.log(
    JSON.stringify({
      documents: tables.documents.filter(row => row.status === "active").length,
      devices: tables.devices.length,
      assets: tables.assets.length,
    })
  );
} finally {
  db.close();
}
