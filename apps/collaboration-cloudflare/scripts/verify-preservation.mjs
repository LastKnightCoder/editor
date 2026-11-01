import { readFileSync, mkdtempSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { createHash, randomBytes } from "node:crypto";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import * as Y from "yjs";

const directory = process.argv[2] && resolve(process.argv[2]);
if (!directory) throw new Error("用法：verify-preservation.mjs <仓库外私有备份目录>");
const metadata = JSON.parse(readFileSync(join(directory, "metadata.json"), "utf8"));
const previousScript = join(directory, "live-worker", "index.js");
const currentScript = resolve("dist-production/index.js");
if (!existsSync(previousScript) || !existsSync(currentScript))
  throw new Error("需要线上原始 Worker 和已构建的候选 Worker");
const temporary = mkdtempSync(join(tmpdir(), "tau-storage-preservation-"));
const adminKey = randomBytes(32).toString("hex");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const canonical = value =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map(key => [key, canonical(value[key])])
        )
      : value;
const rowsHash = rows =>
  hash(JSON.stringify(rows.map(row => JSON.stringify(canonical(row))).sort()));
const ensure = (condition, message) => {
  if (!condition) throw new Error(message);
};
const active = metadata.tables.documents.filter(row => row.status === "active");
const states = new Map(
  active.map(row => [row.id, readFileSync(join(directory, "documents", row.id))])
);
const assets = new Map(
  metadata.tables.assets.map(row => [row.hash, readFileSync(join(directory, "assets", row.hash))])
);
for (const [digest, bytes] of assets) ensure(hash(bytes) === digest, "来源附件摘要不匹配");
let worker;
let origin;
async function start(scriptPath, stateDirectory) {
  mkdirSync(stateDirectory, { recursive: true, mode: 0o700 });
  worker = new Miniflare(
    convertV4MiniflareOptions({
      name: "preservation-rehearsal",
      modules: true,
      scriptPath,
      modulesRoot: dirname(scriptPath),
      compatibilityDate: "2026-10-18",
      compatibilityFlags: ["nodejs_compat"],
      durableObjects: { COLLAB: { className: "CollaborationService", useSQLite: true } },
      resourcePersistencePath: stateDirectory,
      r2Buckets: ["ASSETS", "BACKUPS"],
      bindings: {
        MODE: "production",
        ADMIN_KEY: adminKey,
        PUBLIC_URL: "https://collab.taunote.app",
        INSTANCE_NAME: "production-v1",
        BUILD_REV: "preservation-test",
      },
      host: "127.0.0.1",
      port: 0,
    })
  );
  origin = (await worker.ready).origin;
  ensure(new URL(origin).hostname === "127.0.0.1", "演练必须运行在本机隔离环境");
}
async function stop() {
  await worker?.dispose();
  worker = undefined;
}
async function call(path, { method = "GET", body, actor, version = 2 } = {}) {
  const response = await fetch(origin + path, {
    method,
    headers: {
      "content-type": "application/json",
      "x-admin-key": adminKey,
      "x-tau-document-version": String(version),
      ...(actor ? { authorization: actor } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const value = await response.json();
  ensure(
    response.ok,
    `隔离请求失败：${method} ${path.startsWith("/_admin") ? path.split("/").slice(0, 3).join("/") : "/v1/documents/..."} HTTP ${response.status} ${value.code ?? ""}`
  );
  return value;
}
async function install(input, documents = states, resourceBytes = assets) {
  await call("/_admin/import", { method: "POST", body: input });
  const bucket = await worker.getR2Bucket("ASSETS");
  for (const [digest, bytes] of resourceBytes) await bucket.put("assets/" + digest, bytes);
  for (const [id, bytes] of documents)
    await call("/_admin/state/" + id, {
      method: "POST",
      body: { state: bytes.toString("base64") },
    });
  await call("/_admin/finish-import", { method: "POST" });
}
async function verify(input, documents = states, resourceBytes = assets) {
  const exported = await call("/_admin/export");
  ensure(exported.signingKey === input.signingKey, "签名密钥发生变化");
  for (const [table, rows] of Object.entries(input.tables))
    ensure(
      Array.isArray(exported.tables[table]) && rowsHash(exported.tables[table]) === rowsHash(rows),
      `表记录发生变化：${table}`
    );
  for (const [id, bytes] of documents) {
    const saved = await call("/_admin/state/" + id);
    ensure(hash(Buffer.from(saved.state, "base64")) === hash(bytes), "活动文档状态字节发生变化");
  }
  const bucket = await worker.getR2Bucket("ASSETS");
  for (const digest of resourceBytes.keys()) {
    const object = await bucket.get("assets/" + digest);
    ensure(
      object && hash(Buffer.from(await object.arrayBuffer())) === digest,
      "附件丢失或摘要变化"
    );
  }
  return exported;
}

try {
  const pristine = join(temporary, "pristine");
  await start(previousScript, pristine);
  await install(metadata);
  await verify(metadata);
  await stop();
  await start(currentScript, pristine);
  const upgraded = await verify(metadata);
  ensure(upgraded.format === 6, "新备份格式不正确");
  const backup = await call("/_admin/backup", { method: "POST" });
  const bucket = await worker.getR2Bucket("BACKUPS");
  const manifest = await bucket.get(backup.prefix + "/manifest.json");
  ensure(manifest, "备份未完成");
  const backed = JSON.parse(await (await bucket.get(backup.prefix + "/metadata.json")).text());
  for (const [table, rows] of Object.entries(metadata.tables))
    ensure(rowsHash(backed.tables[table]) === rowsHash(rows), `备份未保全原表：${table}`);
  await stop();
  await start(previousScript, pristine);
  await verify(metadata);
  await stop();
  console.log(
    JSON.stringify({
      phase: "原地升级与代码回滚",
      tables: Object.keys(metadata.tables).length,
      activeDocuments: states.size,
      assets: assets.size,
      originalBytesPreserved: true,
    })
  );

  await start(currentScript, join(temporary, "restored"));
  await install(backed);
  await verify(metadata);
  await stop();
  console.log(JSON.stringify({ phase: "格式6备份恢复", allOriginalRecordsPreserved: true }));

  // 功能演练使用独立副本的合成凭据，不读取或使用真实设备密钥。
  const functional = structuredClone(metadata);
  const secret = randomBytes(32).toString("hex");
  const owners = new Set(active.map(row => row.owner_id));
  for (const device of functional.tables.devices)
    if (owners.has(device.id)) device.secret_hash = hash(secret);
  const edits = new Map();
  const working = join(temporary, "functional");
  await start(currentScript, working);
  await install(functional);
  for (const [index, document] of active.entries()) {
    const actor = `Bearer ${document.owner_id}:${secret}`;
    const protocol = await call(`/v1/documents/${document.id}/protocol`, { actor });
    const snapshot = await call(`/v1/documents/${document.id}/state`, {
      actor,
      version: protocol.version,
    });
    const doc = new Y.Doc({ gc: false });
    try {
      Y.applyUpdate(doc, Buffer.from(snapshot.state, "base64"));
      const before = Y.encodeStateVector(doc);
      const title = doc.getText(protocol.version === 3 ? "whiteboard:title" : "title");
      const marker = `演练${index}·`;
      ensure(title.length + marker.length <= 500, "标题不足以执行安全演练");
      title.insert(0, marker);
      const update = Y.encodeStateAsUpdate(doc, before);
      const operationId = "verify-" + crypto.randomUUID();
      const body = {
        operationId,
        version: protocol.version,
        baselineId: protocol.baselineId,
        epoch: protocol.epoch,
        expectedRevision: protocol.revision,
        expectedSequence: protocol.sequence,
        expiresAt: Date.now() + 60_000,
        updateHash: hash(update),
        update: Buffer.from(update).toString("base64"),
      };
      const result = await call(`/v1/documents/${document.id}/operations/${operationId}`, {
        method: "POST",
        body,
        actor,
      });
      ensure(result.operation?.state === "COMMITTED", "编辑未获得提交回执");
      const repeated = await call(`/v1/documents/${document.id}/operations/${operationId}`, {
        method: "POST",
        body,
        actor,
      });
      ensure(
        JSON.stringify(result.operation.receipt) === JSON.stringify(repeated.operation.receipt),
        "重复请求回执不一致"
      );
      const saved = await call(`/_admin/state/${document.id}`);
      ensure(
        hash(Buffer.from(saved.state, "base64")) === hash(Y.encodeStateAsUpdate(doc)),
        "编辑后状态字节不一致"
      );
      edits.set(document.id, Buffer.from(saved.state, "base64"));
    } finally {
      doc.destroy();
    }
  }
  const editedMetadata = await call("/_admin/export");
  await stop();
  await start(currentScript, working);
  await verify(editedMetadata, edits);
  await stop();
  console.log(
    JSON.stringify({
      phase: "当前协议编辑、幂等与重启",
      documents: edits.size,
      testCredentialsOnly: true,
      passed: true,
    })
  );
} finally {
  await stop();
  rmSync(temporary, { recursive: true, force: true });
}
