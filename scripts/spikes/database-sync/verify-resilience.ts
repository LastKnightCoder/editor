import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { performance, monitorEventLoopDelay } from "node:perf_hooks";
import * as Y from "yjs";
import {
  createNodeDocument,
  NodeTree,
  readNodeDocument,
} from "../../../packages/collaboration/src/index";
import { prepareContentContract } from "../../../packages/db-schema/content-contracts";
import {
  DeviceSyncEngine,
  synchronizeDevice,
} from "../../../packages/collaboration/src/device-sync/engine";
import {
  prepareDeviceDocument,
  restoreDeviceDocument,
} from "../../../packages/collaboration/src/device-sync/documents";
import type {
  DeviceCommit,
  DeviceDocument,
  DeviceState,
  DeviceStorage,
} from "../../../packages/collaboration/src/device-sync/protocol";
import {
  DeviceDatabaseStore,
  initializeDeviceSyncDatabase,
  deviceDocument,
  writeDeviceDocument,
  readDeviceSyncState,
  recoverDeviceSyncDatabase,
  ensureDeviceSyncHealthy,
} from "../../../apps/desktop/src-electron/main/modules/device-sync/database-store";
import {
  persistDeviceContent,
  projectDeviceDocument,
} from "../../../apps/desktop/src-electron/main/modules/device-sync/content-state";
import { DeviceAssetStore } from "../../../apps/desktop/src-electron/main/modules/device-sync/asset-store";
import { restoreActiveDeviceContent } from "../../../apps/desktop/src-electron/main/modules/device-sync/content-state";
import {
  readDeviceContent,
  setDeviceSyncDatabase,
} from "../../../apps/mobile/src/services/device-sync/native";
import {
  registerContentSession,
  unregisterContentSession,
  canonicalContentTitle,
  setCanonicalContentTitle,
} from "../../../apps/desktop/src-electron/main/modules/collaboration/content-sessions";

const requireNative = createRequire(join(process.cwd(), "apps/desktop/package.json"));
const Database = requireNative("better-sqlite3");
const schema = readFileSync("packages/db-schema/schema/main.sql", "utf8");
const extension = readFileSync("packages/db-schema/schema/device-sync.sql", "utf8");
const binary = join(
  process.cwd(),
  "apps/mobile/src-tauri/target/debug/device-sync-peer" +
    (process.platform === "win32" ? ".exe" : "")
);
const native = (path: string, action: string, payload: unknown = {}) =>
  JSON.parse(
    execFileSync(binary, [path, action], {
      input: JSON.stringify(payload),
      encoding: "utf8",
      maxBuffer: 128 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    })
  );
const immediate = () => new Promise<void>(resolve => setImmediate(resolve));
const open = (path: string) => {
  const db = new Database(path, { timeout: 100 });
  db.pragma("journal_mode=WAL");
  db.pragma("synchronous=FULL");
  db.pragma("foreign_keys=ON");
  initializeDeviceSyncDatabase(db, extension);
  return db;
};
const ioStalls: { operation: string; ms: number }[] = [];
const measuredDatabases = new WeakSet<object>();
const storeOf = (db: any) => {
  if (!measuredDatabases.has(db)) {
    measuredDatabases.add(db);
    const original = db.transaction.bind(db);
    db.transaction = (...args: any[]) =>
      new Proxy(original(...args), {
        apply(target, thisArg, argumentsList) {
          const start = performance.now();
          try {
            return Reflect.apply(target, thisArg, argumentsList);
          } finally {
            ioStalls.push({ operation: "transaction", ms: performance.now() - start });
          }
        },
      });
  }
  const store = new DeviceDatabaseStore(db, (document, options) =>
    projectDeviceDocument(db, document, options)
  );
  for (const operation of ["read", "commit", "loadDocuments"] as const) {
    const original = store[operation].bind(store) as (...args: any[]) => Promise<any>;
    (store as any)[operation] = (...args: any[]) => {
      const start = performance.now();
      const promise = original(...args);
      ioStalls.push({ operation, ms: performance.now() - start });
      return promise;
    };
  }
  return store;
};
const body = (entry: DeviceDocument) => {
  const doc = restoreDeviceDocument(entry);
  try {
    return JSON.stringify(readNodeDocument(doc).content);
  } finally {
    doc.destroy();
  }
};
async function fixture(path: string) {
  const db = new Database(path);
  db.exec(schema);
  initializeDeviceSyncDatabase(db, extension);
  const { id, contract } = await prepareContentContract("tau.editor", {
    type: "paragraph",
    dataVersion: 1,
    kind: "block",
  });
  const doc = await createNodeDocument(
    { documentId: randomUUID(), baselineId: randomUUID(), epoch: 0 },
    {
      title: "",
      bannerBg: "",
      bannerPosition: "center",
      content: [
        { type: "paragraph", collabId: "p", tauContract: id, children: [{ text: "开端" }] },
      ],
    },
    { [id]: contract }
  );
  const document = await prepareDeviceDocument({
    contentId: 1,
    documentId: String(doc.getMap("meta").get("documentId")),
    baselineId: String(doc.getMap("meta").get("baselineId")),
    epoch: 0,
    state: Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64"),
    paths: {},
    updatedAt: 1000,
  });
  doc.destroy();
  const state: DeviceState = {
    library: randomUUID(),
    schema: createHash("sha1").update(schema).digest("hex"),
    node: randomUUID(),
    authority: "",
    epoch: randomUUID(),
    head: randomUUID(),
    ackHead: "",
    ackSeq: 0,
    enabled: true,
    revision: 0,
  };
  state.authority = state.node;
  state.ackHead = state.head;
  db.prepare("INSERT INTO library_identity VALUES(1,?,?,NULL,1000)").run(
    state.library,
    randomUUID()
  );
  db.prepare(
    "INSERT INTO contents(id,create_time,update_time,content,count,ref_count) VALUES(1,1000,1000,?,2,1)"
  ).run(document.projection.contentJson);
  db.prepare(
    "INSERT INTO content_documents(content_id,document_id,format_version,contracts,revision) VALUES(1,?,2,?,'initial')"
  ).run(document.documentId, document.projection.contractsJson);
  db.exec(
    "INSERT INTO cards(id,create_time,update_time,content_id) VALUES(1,1000,1000,1);INSERT INTO home_panel_layout VALUES('p',0,0,1000)"
  );
  writeDeviceDocument(db, document);
  db.prepare("INSERT INTO _tau_device_state(id,payload) VALUES(1,?)").run(JSON.stringify(state));
  initializeDeviceSyncDatabase(db, extension);
  db.pragma("journal_mode=WAL");
  db.pragma("synchronous=FULL");
  db.pragma("foreign_keys=ON");
  return db;
}
async function edit(db: any, value: string) {
  const entry = deviceDocument(db, 1)!,
    doc = restoreDeviceDocument(entry),
    tree = new NodeTree(doc);
  try {
    tree.insertText(
      "p",
      tree.spans("p").reduce((sum, span) => sum + span.length, 0),
      value,
      {}
    );
    persistDeviceContent(db, 1, doc, () => null);
  } finally {
    tree.dispose();
    doc.destroy();
  }
}
async function nativeEdit(path: string, value: string) {
  const entry = native(path, "documents", { ids: [1] })[0] as DeviceDocument,
    doc = restoreDeviceDocument(entry),
    tree = new NodeTree(doc);
  try {
    tree.insertText(
      "p",
      tree.spans("p").reduce((sum, span) => sum + span.length, 0),
      value,
      {}
    );
    const document = await prepareDeviceDocument({
      ...entry,
      state: Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64"),
      updatedAt: Date.now(),
    });
    native(path, "save", { document, expectedState: entry.state });
  } finally {
    tree.dispose();
    doc.destroy();
  }
}
async function rebuildBody(db: any, path?: string) {
  if (path ? native(path, "documents", { ids: [1] }).length : deviceDocument(db, 1)) return;
  const row = db
    .prepare(
      "SELECT c.content,d.document_id,d.contracts FROM contents c JOIN content_documents d ON d.content_id=c.id WHERE c.id=1"
    )
    .get();
  const doc = await createNodeDocument(
    { documentId: row.document_id, baselineId: randomUUID(), epoch: 0 },
    { title: "", bannerBg: "", bannerPosition: "center", content: JSON.parse(row.content) },
    JSON.parse(row.contracts)
  );
  try {
    if (path)
      native(path, "save", {
        document: await prepareDeviceDocument({
          contentId: 1,
          documentId: row.document_id,
          baselineId: String(doc.getMap("meta").get("baselineId")),
          epoch: 0,
          state: Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64"),
          paths: {},
          updatedAt: Date.now(),
        }),
      });
    else persistDeviceContent(db, 1, doc, () => null);
  } finally {
    doc.destroy();
  }
}
function nativeStore(path: string): DeviceStorage {
  return {
    read: async (snapshot = false) => native(path, "read", { snapshot }),
    commit: async (plan: DeviceCommit) => {
      native(path, "commit", plan);
    },
    loadDocuments: async (ids: number[]) => native(path, "documents", { ids }),
  };
}
async function main() {
  const root = mkdtempSync(join(tmpdir(), "tau-device-resilience-")),
    started = performance.now(),
    delay = monitorEventLoopDelay({ resolution: 10 });
  delay.enable();
  const db = await fixture(join(root, "authority.db")),
    base = db.serialize(),
    store = storeOf(db);
  let authority = new DeviceSyncEngine(store);
  const results: Record<string, unknown> = { root },
    timings: number[] = [];
  const faults = [
    "UPDATE _tau_device_state SET payload='{'",
    "UPDATE _tau_device_state SET payload='null'",
    'UPDATE _tau_device_state SET payload=\'{"epoch":"damaged"}\'',
    "DELETE FROM _tau_device_state",
    "INSERT INTO _tau_device_log(table_name,row_key,after_json) VALUES('cards','{','{}')",
    "INSERT INTO _tau_device_log(table_name,row_key,after_json) VALUES('cards','null','null')",
    "INSERT INTO _tau_device_history(id,payload) VALUES('broken','{')",
    "INSERT INTO _tau_device_history(id,payload) VALUES('broken','null')",
    "INSERT INTO _tau_device_receipts VALUES('broken',1,'x','{')",
    "UPDATE _tau_device_documents SET paths='{'",
    "UPDATE _tau_device_documents SET metric_rules='null'",
    "INSERT INTO _tau_device_json_intents VALUES(1,'{','[]','{}','x')",
    "INSERT INTO _tau_device_branches VALUES('broken','x','{')",
    "INSERT INTO _tau_device_note_copies VALUES('broken','x','{')",
    "DROP TABLE _tau_device_log",
    "ALTER TABLE _tau_device_state RENAME COLUMN projection_bytes TO broken",
    "ALTER TABLE _tau_device_documents RENAME COLUMN baseline_id TO broken",
    "UPDATE home_panel_layout SET sort=3 WHERE panel_id='p';DELETE FROM _tau_device_log",
    "UPDATE home_panel_layout SET sort=3 WHERE panel_id='p';UPDATE _tau_device_log SET after_json=json_set(after_json,'$.sort',99) WHERE table_name='home_panel_layout'",
    'INSERT INTO _tau_device_history(id,payload) VALUES(\'x\',\'{"id":"x","parent":"a","changes":[],"documents":[]}\');UPDATE _tau_device_history SET payload=json_set(payload,\'$.parent\',\'b\')',
    "UPDATE _tau_device_documents SET updated_at=updated_at+1",
    "UPDATE _tau_device_documents SET paths='null'",
    "INSERT INTO sqlite_sequence(name,seq) VALUES('_tau_device_log',9223372036854775807)",
  ];
  for (const rust of [false, true])
    for (let i = 0; i < faults.length; i++) {
      const path = join(root, `fault-${rust ? "rust" : "node"}-${i}.db`);
      writeFileSync(path, base);
      if (rust) {
        native(path, "sql", { sql: faults[i] });
        if (i === faults.length - 1)
          native(path, "sql", {
            sql: "UPDATE home_panel_layout SET sort=40 WHERE panel_id='p';UPDATE contents SET content=replace(content,'开端','开端计数期间') WHERE id=1",
          });
        native(path, "open");
        native(path, "sql", { sql: "UPDATE home_panel_layout SET sort=41 WHERE panel_id='p'" });
        const check = new Database(path);
        await rebuildBody(check, path);
        await nativeEdit(path, "损坏恢复后输入");
        assert.equal(check.prepare("SELECT sort FROM home_panel_layout").get().sort, 41);
        assert.match(
          check.prepare("SELECT content FROM contents WHERE id=1").get().content,
          /开端/
        );
        if (i === faults.length - 1)
          assert.match(
            check.prepare("SELECT content FROM contents WHERE id=1").get().content,
            /计数期间/
          );
        assert.equal(check.pragma("integrity_check", { simple: true }), "ok");
        check.close();
      } else {
        const check = open(path);
        check.exec(faults[i]);
        if (i < 3 || i === faults.length - 1)
          check.exec("UPDATE home_panel_layout SET sort=40 WHERE panel_id='p'");
        if (i === faults.length - 1)
          check.exec(
            "UPDATE contents SET content=replace(content,'开端','开端计数期间') WHERE id=1"
          );
        initializeDeviceSyncDatabase(check, extension);
        await rebuildBody(check);
        await edit(check, "损坏恢复后输入");
        check.exec("UPDATE home_panel_layout SET sort=41 WHERE panel_id='p'");
        assert.equal(check.prepare("SELECT sort FROM home_panel_layout").get().sort, 41);
        assert.match(
          check.prepare("SELECT content FROM contents WHERE id=1").get().content,
          /开端/
        );
        if (i === faults.length - 1)
          assert.match(
            check.prepare("SELECT content FROM contents WHERE id=1").get().content,
            /计数期间/
          );
        assert.equal(check.pragma("integrity_check", { simple: true }), "ok");
        check.close();
      }
      await immediate();
    }
  results.corruptionOpenAndEditCases = faults.length * 2;
  const binaryFaultPath = join(root, "broken-body.db");
  writeFileSync(binaryFaultPath, base);
  const binaryFault = open(binaryFaultPath);
  const activeEntry = deviceDocument(binaryFault, 1)!,
    activeDoc = restoreDeviceDocument(activeEntry),
    activeTree = new NodeTree(activeDoc);
  binaryFault.exec("UPDATE _tau_device_documents SET state='AQ=='");
  assert.equal(deviceDocument(binaryFault, 1), null);
  assert.match(
    binaryFault.prepare("SELECT content FROM contents WHERE id=1").get().content,
    /开端/
  );
  assert.equal(readDeviceSyncState(binaryFault)?.recovering, true);
  activeTree.insertText("p", 2, "活动恢复", {});
  const activeSource = {
    databaseName: "stress-active",
    contentId: 1,
    contentCreatedAt: 1000,
    projectionRevision: binaryFault
      .prepare("SELECT revision FROM content_documents WHERE content_id=1")
      .get().revision,
  };
  const activeSession = {
    doc: activeDoc,
    info: { mode: "local", source: activeSource },
    persistDeviceState: () => persistDeviceContent(binaryFault, 1, activeDoc, () => null),
  } as any;
  registerContentSession(binaryFault, 1, activeSession);
  assert.equal(await restoreActiveDeviceContent(binaryFault, 1), true);
  assert.equal(deviceDocument(binaryFault, 1)!.baselineId, activeEntry.baselineId);
  assert.match(body(deviceDocument(binaryFault, 1)!), /活动恢复/);
  unregisterContentSession(activeSession);
  activeTree.dispose();
  activeDoc.destroy();
  results.activeDesktopSessionKeepsBaseline = true;
  binaryFault.close();
  const nativeBinaryPath = join(root, "broken-native-body.db");
  writeFileSync(nativeBinaryPath, base);
  native(nativeBinaryPath, "sql", { sql: "UPDATE _tau_device_documents SET state='AQ=='" });
  setDeviceSyncDatabase("stress.db");
  (globalThis as any).__deviceSyncNative = async (_command: string, args: any) => {
    if (args.action === "intents") return [];
    if (args.action === "document")
      return native(nativeBinaryPath, "documents", { ids: [1] })[0] ?? null;
    return native(nativeBinaryPath, args.action, args.payload);
  };
  assert.equal(await readDeviceContent(1), null);
  const nativeBroken = new Database(nativeBinaryPath);
  await rebuildBody(nativeBroken, nativeBinaryPath);
  await nativeEdit(nativeBinaryPath, "原生损坏后继续");
  nativeBroken.close();
  results.brokenBinaryRemainsEditableOnBothHosts = true;
  const titlePath = join(root, "title-owner.db");
  writeFileSync(titlePath, base);
  const titleDb = open(titlePath),
    titleDoc = restoreDeviceDocument(deviceDocument(titleDb, 1)!);
  titleDb.exec(
    "INSERT INTO articles(id,create_time,update_time,content_id,title) VALUES(1,1000,1000,1,'线性标题');DELETE FROM _tau_device_state;DELETE FROM _tau_device_anchor"
  );
  const titleSession = {
    doc: titleDoc,
    info: {
      mode: "local",
      source: { contentId: 1, contentCreatedAt: 1000, titleAuthority: "database" },
    },
  } as any;
  registerContentSession(titleDb, 1, titleSession);
  assert.equal(canonicalContentTitle(titleDb, 1), "线性标题");
  setCanonicalContentTitle(titleDb, 1, "旧正文标题");
  assert.equal(titleDoc.getText("title").toString(), "");
  delete titleSession.info.source.titleAuthority;
  setCanonicalContentTitle(titleDb, 1, "普通本机标题");
  assert.equal(titleDoc.getText("title").toString(), "普通本机标题");
  unregisterContentSession(titleSession);
  titleDoc.destroy();
  titleDb.close();
  results.titleOwnershipSurvivesAuxiliaryLoss = true;
  const interruptedPath = join(root, "interrupted-repair.db");
  writeFileSync(interruptedPath, base);
  const interrupted = open(interruptedPath),
    originalExec = interrupted.exec.bind(interrupted);
  let hit = false;
  interrupted.exec = (sql: string) => {
    if (!hit && sql.startsWith("ALTER TABLE")) {
      hit = true;
      throw new Error("恢复中断");
    }
    return originalExec(sql);
  };
  assert.throws(() => recoverDeviceSyncDatabase(interrupted), /恢复中断/);
  interrupted.exec = originalExec;
  assert.ok(deviceDocument(interrupted, 1));
  assert.equal(
    interrupted
      .prepare("SELECT count(*) AS n FROM sqlite_master WHERE name GLOB '_tau_device_quarantine_*'")
      .get().n,
    0
  );
  recoverDeviceSyncDatabase(interrupted);
  interrupted.close();
  results.recoveryIsAtomic = true;
  const peers = [] as {
    path: string;
    db?: any;
    storage: DeviceStorage;
    engine: DeviceSyncEngine;
    rust: boolean;
  }[];
  for (let i = 0; i < 8; i++) {
    const path = join(root, `peer-${i}.db`);
    writeFileSync(path, base);
    const copy = open(path),
      state = readDeviceSyncState(copy)!;
    copy
      .prepare("UPDATE _tau_device_state SET payload=? WHERE id=1")
      .run(JSON.stringify({ ...state, node: randomUUID() }));
    const rust = i >= 6;
    if (rust) copy.close();
    const storage = rust ? nativeStore(path) : storeOf(copy);
    peers.push({
      path,
      db: rust ? undefined : copy,
      storage,
      engine: new DeviceSyncEngine(storage),
      rust,
    });
  }
  let seed = Number(process.env.TAU_SYNC_STRESS_SEED ?? 0x6a09e667);
  results.seed = seed;
  const random = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
  const expected: string[] = [];
  let lost = 0,
    restarts = 0,
    repairs = 0;
  for (let round = 0; round < 160; round++) {
    const index = Math.floor(random() * peers.length),
      peer = peers[index],
      token = `【${round}💡】`;
    expected.push(token);
    const before = performance.now();
    if (peer.rust) await nativeEdit(peer.path, token);
    else await edit(peer.db, token);
    timings.push(performance.now() - before);
    if (round % 11 === 0) {
      const token = `【桌面${round}】`;
      expected.push(token);
      await edit(db, token);
    }
    if (round % 19 === 0) {
      if (peer.rust)
        native(peer.path, "sql", {
          sql: `UPDATE home_panel_layout SET sort=${round + 100} WHERE panel_id='p'`,
        });
      else
        peer.db.prepare("UPDATE home_panel_layout SET sort=? WHERE panel_id='p'").run(round + 100);
      db.prepare("UPDATE home_panel_layout SET sort=? WHERE panel_id='p'").run(round);
    }
    if (round % 37 === 0) {
      if (peer.rust) {
        native(peer.path, "sql", { sql: "UPDATE _tau_device_state SET payload='{'" });
        native(peer.path, "open");
      } else {
        peer.db.exec("UPDATE _tau_device_state SET payload='{'");
        initializeDeviceSyncDatabase(peer.db, extension);
      }
      repairs++;
    }
    if (random() < 0.7) {
      let drop = random() < 0.25;
      try {
        await synchronizeDevice(peer.engine, async offer => {
          const reply = await authority.accept(offer);
          if (drop && ["delta", "snapshot"].includes(reply.kind)) {
            drop = false;
            lost++;
            throw new Error("模拟响应丢失");
          }
          return reply;
        });
      } catch (error) {
        if (!String(error).includes("模拟响应丢失")) throw error;
      }
    }
    if (round % 13 === 0) {
      if (peer.db) {
        peer.db.close();
        peer.db = open(peer.path);
        peer.storage = storeOf(peer.db);
      }
      peer.engine = new DeviceSyncEngine(peer.storage);
      authority = new DeviceSyncEngine(store);
      restarts++;
    }
    if (round % 43 === 0) db.exec("DELETE FROM _tau_device_history");
    await immediate();
  }
  for (let pass = 0; pass < 3; pass++)
    for (const peer of peers)
      await synchronizeDevice(peer.engine, offer => authority.accept(offer));
  const canonical = (await store.read(true)).snapshot!,
    value = body(deviceDocument(db, 1)!);
  for (const token of expected) assert.equal(value.split(token).length - 1, 1, token);
  for (const peer of peers) {
    const snapshot = (await peer.storage.read(true)).snapshot!;
    assert.deepEqual(snapshot.rows, canonical.rows);
    assert.equal(body(snapshot.documents[0]), value);
  }
  results.randomized = {
    devices: 9,
    rounds: 160,
    uniqueEdits: expected.length,
    lostResponses: lost,
    restarts,
    repairs,
    all98TablesEqual: true,
  };
  const duplicatePeer = peers[0];
  await edit(duplicatePeer.db, "【重复提交】");
  const duplicate = await duplicatePeer.engine.offer();
  await authority.accept(duplicate);
  const accepted = (await store.read()).state.head;
  const receiptBefore = (await store.read()).receipts[duplicate.state.node];
  await Promise.all(Array.from({ length: 32 }, () => authority.accept(duplicate)));
  const afterDuplicates = await store.read();
  assert.equal(
    afterDuplicates.state.head,
    accepted,
    JSON.stringify({
      offerSequence: duplicate.sequence,
      sourceRecovering: duplicate.state.recovering,
      receiptBefore,
      receiptAfter: afterDuplicates.receipts[duplicate.state.node],
      dirtyRows: afterDuplicates.allChanges.length,
      dirtyDocs: afterDuplicates.documents.length,
    })
  );
  await synchronizeDevice(duplicatePeer.engine, offer => authority.accept(offer));
  results.concurrentDuplicateRequests = 32;
  const resetPeer = peers[6],
    resetState = (await resetPeer.storage.read()).state;
  native(resetPeer.path, "sql", {
    sql: "DELETE FROM _tau_device_state;DELETE FROM _tau_device_anchor;DELETE FROM _tau_device_log;DELETE FROM sqlite_sequence WHERE name='_tau_device_log'",
  });
  native(resetPeer.path, "restore-state", {
    ...(await authority.head(resetState.node)),
    node: resetState.node,
    library: resetState.library,
  });
  await synchronizeDevice(resetPeer.engine, offer => authority.accept(offer));
  assert.deepEqual(
    (await resetPeer.storage.read(true)).snapshot!.rows,
    (await store.read(true)).snapshot!.rows
  );
  results.lostBothIdentityRecordsRecovered = true;
  const repairedBranches = new Set<string>();
  for (let i = 0; i < 2; i++) {
    native(resetPeer.path, "sql", {
      sql: `UPDATE home_panel_layout SET sort=${700 + i} WHERE panel_id='p';UPDATE _tau_device_state SET payload='{'`,
    });
    native(resetPeer.path, "open");
    const repaired = await synchronizeDevice(resetPeer.engine, offer => authority.accept(offer));
    assert.equal(repaired.preserved, true);
    repairedBranches.add(repaired.branchId!);
  }
  assert.equal(repairedBranches.size, 2);
  results.repeatedRepairKeepsDistinctCopies = true;
  const oldOffer = await duplicatePeer.engine.offer();
  await edit(duplicatePeer.db, "【新输入】");
  const oldReply = await authority.accept(oldOffer);
  if (oldReply.kind === "delta" || oldReply.kind === "snapshot")
    await assert.rejects(
      () => duplicatePeer.engine.install(oldOffer, oldReply),
      /DEVICE_SYNC_RETRY/
    );
  await synchronizeDevice(duplicatePeer.engine, offer => authority.accept(offer));
  results.staleResponseRejected = true;
  await edit(duplicatePeer.db, "【原子重试】");
  const faultOffer = await duplicatePeer.engine.offer(),
    beforeFault = (await store.read(true)).snapshot!.rows;
  db.exec(
    "CREATE TRIGGER _tau_device_injected_fault BEFORE INSERT ON _tau_device_history BEGIN SELECT RAISE(ABORT,'injected failure'); END;"
  );
  await assert.rejects(() => authority.accept(faultOffer), /injected failure/);
  assert.deepEqual((await store.read(true)).snapshot!.rows, beforeFault);
  db.exec("DROP TRIGGER _tau_device_injected_fault");
  await synchronizeDevice(duplicatePeer.engine, offer => authority.accept(offer));
  results.failedCommitRolledBack = true;
  for (const bad of ["AQ==", "%%%%", Buffer.from([255, 255, 255, 255]).toString("base64")]) {
    const source = await duplicatePeer.engine.offer(true),
      before = (await store.read(true)).snapshot!.rows;
    await assert.rejects(() =>
      authority.accept({
        ...source,
        documents: [{ ...deviceDocument(db, 1)!, state: bad }],
        snapshot: { ...source.snapshot!, documents: [{ ...deviceDocument(db, 1)!, state: bad }] },
      })
    );
    assert.deepEqual((await store.read(true)).snapshot!.rows, before);
  }
  results.malformedYjsRejectedWithoutBusinessWrites = true;
  const fullPath = join(root, "disk-full.db");
  writeFileSync(fullPath, base);
  const full = open(fullPath),
    pageCount = full.pragma("page_count", { simple: true });
  const blobView = native(fullPath, "read", { snapshot: true }),
    blobBefore = blobView.snapshot.rows.home_panel_layout[0];
  assert.throws(
    () =>
      native(fullPath, "commit", {
        expectedSequence: blobView.sequence,
        expectedHead: blobView.state.head,
        state: blobView.state,
        changes: [
          {
            table: "home_panel_layout",
            key: ["p"],
            before: blobBefore,
            after: { ...blobBefore, sort: { $blob: "😀" } },
          },
        ],
      }),
    (error: any) => error.status === 1
  );
  assert.equal(full.prepare("SELECT sort FROM home_panel_layout").get().sort, 0);
  results.nonAsciiBlobRejectedWithoutNativePanic = true;
  full.pragma(`max_page_count=${pageCount}`);
  assert.throws(
    () =>
      full
        .prepare("INSERT INTO home_panel_layout VALUES(?,0,0,1)")
        .run("x".repeat(2 * 1024 * 1024)),
    /full/i
  );
  full.pragma("max_page_count=1073741823");
  await edit(full, "空间恢复后继续");
  assert.match(body(deviceDocument(full, 1)!), /空间恢复后继续/);
  full.close();
  results.diskFullRolledBack = true;
  const lockedPath = join(root, "busy.db");
  writeFileSync(lockedPath, base);
  const locked = open(lockedPath),
    prepare = locked.prepare.bind(locked);
  locked.prepare = (sql: string) => {
    if (sql.includes("AS damaged"))
      throw Object.assign(new Error("database is locked"), { code: "SQLITE_BUSY" });
    return prepare(sql);
  };
  assert.throws(() => ensureDeviceSyncHealthy(locked), /locked/);
  locked.prepare = prepare;
  assert.equal(
    locked
      .prepare("SELECT count(*) AS n FROM sqlite_master WHERE name GLOB '_tau_device_quarantine_*'")
      .get().n,
    0
  );
  await edit(locked, "锁解除后继续");
  locked.close();
  results.busyDoesNotQuarantineHealthyData = true;
  const contestedPath = join(root, "contested.db");
  writeFileSync(contestedPath, base);
  const contested = open(contestedPath),
    contestedStore = storeOf(contested),
    contestedView = await contestedStore.read();
  const locker = spawn(process.execPath, [process.argv[1], "--worker", contestedPath, "before"], {
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise<void>((resolve, reject) => {
    locker.once("error", reject);
    locker.stdout.once("data", () => resolve());
    locker.once("exit", () => reject(new Error("锁进程提前退出")));
  });
  const lockPlan = {
    expectedSequence: contestedView.sequence,
    expectedHead: contestedView.state.head,
    state: contestedView.state,
  };
  const busyTimeout = contested.pragma("busy_timeout", { simple: true }),
    lockStart = performance.now();
  await assert.rejects(() => contestedStore.commit(lockPlan), /locked/);
  assert.ok(performance.now() - lockStart < 1000);
  assert.equal(contested.pragma("busy_timeout", { simple: true }), busyTimeout);
  assert.throws(
    () => native(contestedPath, "commit", lockPlan),
    (error: any) => error.status === 1 && String(error.stderr).includes("locked")
  );
  locker.kill("SIGKILL");
  await new Promise(resolve => locker.once("exit", resolve));
  assert.equal(contested.prepare("SELECT sort FROM home_panel_layout").get().sort, 0);
  await edit(contested, "争锁后继续保存");
  contested.close();
  results.realWriterContentionRecovers = true;
  for (let round = 0; round < 12; round++) {
    const path = join(root, `crash-${round}.db`);
    writeFileSync(path, base);
    const child = spawn(
      process.execPath,
      [process.argv[1], "--worker", path, round < 8 ? "before" : "after"],
      { env: process.env, stdio: ["ignore", "pipe", "pipe"] }
    );
    await new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", code => reject(new Error(`崩溃子进程提前退出 ${code}`)));
      child.stdout.once("data", () => resolve());
    });
    child.kill("SIGKILL");
    await new Promise(resolve => child.once("exit", resolve));
    const reopened = open(path);
    assert.equal(reopened.pragma("integrity_check", { simple: true }), "ok");
    assert.equal(
      reopened.prepare("SELECT sort FROM home_panel_layout WHERE panel_id='p'").get().sort,
      round < 8 ? 0 : 999
    );
    assert.ok(deviceDocument(reopened, 1));
    await edit(reopened, "崩溃后可编辑");
    reopened.close();
  }
  results.sigkillBeforeAndAfterCommit = 12;
  const assets = new DeviceAssetStore(join(root, "resources")),
    assetBytes = Buffer.alloc(512 * 1024, 97),
    source = join(root, "asset.bin");
  writeFileSync(source, assetBytes);
  const name = assets.import(source).split("/").at(-1)!;
  writeFileSync(join(assets.directory, name), Buffer.alloc(assetBytes.length, 98));
  assert.equal(assets.has(name), false);
  for (const invalid of ["../private", name + "/../secret", "x".repeat(1000)])
    assert.throws(() => assets.read(invalid, 0));
  assets.import(source);
  assert.equal(assets.has(name), true);
  results.corruptAssetRepaired = true;
  const growth = performance.now();
  db.transaction(() => {
    const insert = db.prepare("INSERT INTO home_panel_layout VALUES(?,0,0,1000)");
    for (let i = 0; i < 10000; i++) insert.run(`load-${i}`);
  })();
  const large = await peers[1].engine.offer();
  await authority.accept(large);
  const reply = await synchronizeDevice(peers[1].engine, offer => authority.accept(offer));
  assert.ok(reply.kind === "delta" || reply.kind === "snapshot");
  assert.deepEqual(
    (await peers[1].storage.read(true)).snapshot!.rows,
    (await store.read(true)).snapshot!.rows
  );
  results.tenThousandRowCatchupMs = Math.round(performance.now() - growth);
  const metadataPeer = peers[7];
  native(metadataPeer.path, "sql", {
    sql: "UPDATE _tau_device_state SET metadata_bytes=9000000 WHERE id=1;UPDATE home_panel_layout SET sort=987 WHERE panel_id='p'",
  });
  const compacted = await synchronizeDevice(metadataPeer.engine, offer => authority.accept(offer));
  assert.equal(compacted.preserved, true);
  assert.equal(
    native(metadataPeer.path, "query", {
      sql: "SELECT CAST(metadata_bytes AS TEXT) FROM _tau_device_state",
    })[0],
    "0"
  );
  results.metadataLogBudgetPreservesFullCopy = true;
  const largeField = "大".repeat(350000),
    fieldStart = performance.now();
  await edit(db, largeField);
  await synchronizeDevice(peers[1].engine, offer => authority.accept(offer));
  assert.ok(body((await peers[1].storage.loadDocuments([1]))[0]).includes(largeField));
  results.oneMiBBodyRoundTripMs = Math.round(performance.now() - fieldStart);
  const oversized = { ...deviceDocument(db, 1)!, state: "X".repeat(12 * 1024 * 1024 + 4) },
    sourceOffer = await peers[1].engine.offer(true);
  await assert.rejects(
    () =>
      authority.accept({
        ...sourceOffer,
        documents: [oversized],
        snapshot: { ...sourceOffer.snapshot!, documents: [oversized] },
      }),
    /BUDGET/
  );
  db.exec("UPDATE home_panel_layout SET sort=901 WHERE panel_id='p'");
  assert.equal(db.prepare("SELECT sort FROM home_panel_layout WHERE panel_id='p'").get().sort, 901);
  results.oversizedBodyRejectedAndLocalWritesContinue = true;
  for (const peer of peers) peer.db?.close();
  db.close();
  delay.disable();
  timings.sort((a, b) => a - b);
  results.localSaveMs = {
    p50: Math.round(timings[Math.floor(timings.length * 0.5)]),
    p95: Math.round(timings[Math.floor(timings.length * 0.95)]),
    max: Math.round(timings.at(-1)!),
  };
  results.eventLoopMaxMs = Math.round(delay.max / 1e6);
  results.longestSynchronousStorage = ioStalls
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 5)
    .map(value => ({ ...value, ms: Math.round(value.ms) }));
  results.rssMiB = Math.round(process.memoryUsage().rss / 1024 / 1024);
  results.durationMs = Math.round(performance.now() - started);
  console.log(JSON.stringify(results, null, 2));
}
if (process.argv[2] === "--worker") {
  const db = open(process.argv[3]);
  db.exec("BEGIN IMMEDIATE;UPDATE home_panel_layout SET sort=999 WHERE panel_id='p'");
  if (process.argv[4] === "after") db.exec("COMMIT");
  process.stdout.write("ready\n");
  setInterval(() => {}, 1000);
} else
  void main().catch(error => {
    console.error(error);
    process.exit(1);
  });
