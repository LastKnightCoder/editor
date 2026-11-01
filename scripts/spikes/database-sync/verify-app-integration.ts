import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { crc32, deflateSync } from "node:zlib";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomUUID, randomBytes } from "node:crypto";
import * as Y from "yjs";
import {
  createNodeDocument,
  NodeTree,
  readNodeDocument,
} from "../../../packages/collaboration/src/index";
import { prepareContentContract } from "../../../packages/db-schema/content-contracts";
import {
  prepareDeviceDocument,
  restoreDeviceDocument,
  mergeDeviceDocument,
} from "../../../packages/collaboration/src/device-sync/documents";
import {
  DeviceSyncEngine,
  synchronizeDevice,
} from "../../../packages/collaboration/src/device-sync/engine";
import type {
  DeviceDocument,
  DeviceState,
  DeviceCommit,
  DeviceReply,
  DeviceOffer,
} from "../../../packages/collaboration/src/device-sync/protocol";
import {
  DeviceDatabaseStore,
  initializeDeviceSyncDatabase,
  writeDeviceDocument,
  deviceDocument,
} from "../../../apps/desktop/src-electron/main/modules/device-sync/database-store";
import {
  projectDeviceDocument,
  persistDeviceContent,
} from "../../../apps/desktop/src-electron/main/modules/device-sync/content-state";
import { DeviceSyncServer } from "../../../apps/desktop/src-electron/main/modules/device-sync/server";
import { DeviceAssetStore } from "../../../apps/desktop/src-electron/main/modules/device-sync/asset-store";
import { deviceCertificate } from "../../../apps/desktop/src-electron/main/modules/device-sync/certificate";
import { applyNodeTreeContent } from "../../../packages/editor-collab/src/nodeTreeDocument";
import {
  startDeviceSync,
  getDeviceSyncStatus,
  downloadDeviceLibrary,
} from "../../../apps/mobile/src/services/device-sync/runtime";
import { emitNativeResume } from "./verify-native-bridge";
import {
  wakeDeviceSync,
  deviceReplacementState,
} from "../../../apps/mobile/src/services/device-sync/native";
import {
  registerDeviceContent,
  persistDeviceContent as persistMobileDeviceContent,
} from "../../../apps/mobile/src/services/device-sync/content";
import { ContentIdentityTable } from "../../../apps/desktop/src-electron/main/modules/tables/content-identity";
import { hasDeviceEntityHold } from "../../../apps/desktop/src-electron/main/modules/device-sync/retention";

async function main() {
  const requireNative = createRequire(join(process.cwd(), "apps/desktop/package.json"));
  const Database = requireNative("better-sqlite3");
  const root = mkdtempSync(join(tmpdir(), "tau-real-device-sync-"));
  const peer = join(
    process.cwd(),
    "apps/mobile/src-tauri/target/debug/device-sync-peer" +
      (process.platform === "win32" ? ".exe" : "")
  );
  const mobilePath = join(root, "mobile.db"),
    desktopPath = join(root, "desktop.db");
  const run = (action: string, payload: unknown = {}, path = mobilePath) =>
    JSON.parse(
      execFileSync(peer, [path, action], {
        input: JSON.stringify(
          action === "save"
            ? { expectedGeneration: run("generation", {}, path), ...(payload as object) }
            : payload
        ),
        maxBuffer: 128 * 1024 * 1024,
        encoding: "utf8",
      })
    );
  const request = (payload: unknown) =>
    new Promise<any>((resolve, reject) => {
      const child = execFile(
        peer,
        [mobilePath, "request"],
        { maxBuffer: 128 * 1024 * 1024, encoding: "utf8" },
        (error, stdout, stderr) =>
          error ? reject(new Error(stderr || error.message)) : resolve(JSON.parse(stdout))
      );
      child.stdin!.end(JSON.stringify(payload));
    });
  let db = new Database(desktopPath);
  db.pragma("journal_mode=WAL");
  db.pragma("synchronous=FULL");
  db.pragma("foreign_keys=ON");
  const schema = readFileSync("packages/db-schema/schema/main.sql", "utf8"),
    extension = readFileSync("packages/db-schema/schema/device-sync.sql", "utf8");
  db.exec(schema);
  initializeDeviceSyncDatabase(db, extension);
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
  const contract = await prepareContentContract("tau.editor", {
    type: "paragraph",
    dataVersion: 1,
    kind: "block",
  });
  const identity = { documentId: randomUUID(), baselineId: randomUUID(), epoch: 0 };
  const doc = await createNodeDocument(
    identity,
    {
      title: "笔记",
      bannerBg: "",
      bannerPosition: "center",
      content: [
        {
          type: "paragraph",
          collabId: "paragraph-1",
          tauContract: contract.id,
          opaque: { "\uE000": "普通键", 𐀀: "扩展键" },
          children: [{ text: "初始" }],
        },
      ],
    },
    { [contract.id]: contract.contract }
  );
  const initial: DeviceDocument = {
    contentId: 1,
    ...identity,
    state: Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64"),
    paths: {},
    updatedAt: 1000,
  };
  doc.destroy();
  const initialProjection = await prepareDeviceDocument(initial);
  db.prepare("INSERT INTO library_identity VALUES (1,?,?,NULL,1000)").run(
    state.library,
    randomUUID()
  );
  db.prepare(
    "INSERT INTO contents(id,create_time,update_time,content,count,ref_count) VALUES (1,1000,1000,?,2,1)"
  ).run(JSON.stringify(initialProjection.projection.content));
  db.prepare(
    "INSERT INTO content_documents(content_id,document_id,format_version,contracts,revision) VALUES (1,?,2,?,'initial')"
  ).run(identity.documentId, JSON.stringify(initialProjection.projection.contracts));
  db.prepare(
    "INSERT INTO cards(id,create_time,update_time,content_id) VALUES (1,1000,1000,1)"
  ).run();
  writeDeviceDocument(db, initial);
  db.prepare("INSERT INTO _tau_device_state(id,payload) VALUES (1,?)").run(JSON.stringify(state));
  initializeDeviceSyncDatabase(db, extension);
  let store = new DeviceDatabaseStore(db, (document, options) =>
      projectDeviceDocument(db, document, options)
    ),
    authority = new DeviceSyncEngine(store);
  const mobileNode = randomUUID(),
    assets = new DeviceAssetStore(join(root, "desktop-resources")),
    serverDirectory = join(root, "server");
  let server = new DeviceSyncServer(
    serverDirectory,
    authority,
    assets,
    async () => {},
    () => {}
  );
  await server.listen(0);
  let code = JSON.parse(
    Buffer.from(
      (await server.pairingCode()).code.slice("tau-pair:v1:".length),
      "base64url"
    ).toString()
  );
  let endpoint = { addresses: ["127.0.0.1"], port: code.port, certificate: code.certificate };
  const paired = await request({
    ...endpoint,
    body: { kind: "pair", secret: code.secret, node: mobileNode, name: "验证手机" },
  });
  const mobileState = {
    ...paired.reply.state,
    node: mobileNode,
    ackHead: paired.reply.state.head,
    ackSeq: 0,
  };
  run("init", mobileState);
  run("commit", {
    expectedSequence: 0,
    expectedHead: mobileState.head,
    state: mobileState,
    snapshot: paired.reply.snapshot,
    documents: await Promise.all(paired.reply.snapshot.documents.map(prepareDeviceDocument)),
  });
  const nativeStore = {
    loadDocuments: async (ids: number[]) => run("documents", { ids }),
    read: async (snapshot = false) => run("read", { snapshot }),
    commit: async (plan: DeviceCommit) => {
      run("commit", plan);
    },
  };
  const client = new DeviceSyncEngine(nativeStore);
  const exchange = async (offer: DeviceOffer) =>
    request({
      ...endpoint,
      token: paired.token,
      body: { kind: "sync", offer },
    }) as Promise<DeviceReply>;
  const readMobile = (): DeviceDocument => run("documents", { ids: [1] })[0];
  const initialMobile = readMobile();
  const initialMobilePlan = await prepareDeviceDocument(initialMobile);
  for (const field of ["expectedDocumentId", "expectedSourceId"]) {
    assert.throws(
      () =>
        run("save", {
          document: initialMobilePlan,
          expectedState: initialMobile.state,
          [field]: randomUUID(),
        }),
      /CONTENT_(REVISION|SOURCE)_CONFLICT/
    );
    assert.deepEqual(readMobile(), initialMobile);
  }
  const text = (entry: DeviceDocument) => {
    const document = restoreDeviceDocument(entry);
    try {
      return JSON.stringify(readNodeDocument(document).content);
    } finally {
      document.destroy();
    }
  };
  const editDesktop = (value: string) => {
    const entry = deviceDocument(db, 1)!,
      document = restoreDeviceDocument(entry),
      tree = new NodeTree(document);
    try {
      tree.insertText(
        "paragraph-1",
        tree.spans("paragraph-1").reduce((size, span) => size + span.length, 0),
        value,
        {}
      );
      persistDeviceContent(db, 1, document, () => null);
    } finally {
      tree.dispose();
      document.destroy();
    }
  };
  const editMobile = async (value: string, contentId = 1, nodeId = "paragraph-1") => {
    const entry: DeviceDocument = run("documents", { ids: [contentId] })[0],
      document = restoreDeviceDocument(entry),
      tree = new NodeTree(document);
    try {
      tree.insertText(
        nodeId,
        tree.spans(nodeId).reduce((size, span) => size + span.length, 0),
        value,
        {}
      );
      const prepared = await prepareDeviceDocument({
        ...entry,
        state: Buffer.from(Y.encodeStateAsUpdate(document)).toString("base64"),
        updatedAt: Date.now(),
      });
      run("save", { document: prepared, expectedState: entry.state });
    } finally {
      tree.dispose();
      document.destroy();
    }
  };

  editDesktop("电脑甲");
  await editMobile("手机乙");
  const first = await synchronizeDevice(client, exchange);
  assert.equal(text(readMobile()), text(deviceDocument(db, 1)!));
  assert.match(text(readMobile()), /电脑甲/);
  assert.match(text(readMobile()), /手机乙/);
  const firstKind = first.kind;
  const sameRows = async () =>
    assert.deepEqual(
      run("read", { snapshot: true }).snapshot.rows,
      (await store.read(true)).snapshot!.rows
    );
  await sameRows();

  await server.close();
  db.close();
  await editMobile("离线丙");
  await assert.rejects(() => synchronizeDevice(client, exchange));
  db = new Database(desktopPath);
  db.pragma("foreign_keys=ON");
  store = new DeviceDatabaseStore(db, (document, options) =>
    projectDeviceDocument(db, document, options)
  );
  authority = new DeviceSyncEngine(store);
  db.exec("DELETE FROM _tau_device_history");
  editDesktop("重启丁");
  const maintenance = await authority.offer();
  await authority.accept({
    ...maintenance,
    state: { ...maintenance.state, node: randomUUID(), ackHead: "" },
    sequence: 0,
    changes: [],
    documents: [],
  });
  db.exec("DELETE FROM _tau_device_history");
  server = new DeviceSyncServer(
    serverDirectory,
    authority,
    assets,
    async () => {},
    () => {}
  );
  await server.listen(0);
  code = JSON.parse(
    Buffer.from(
      (await server.pairingCode()).code.slice("tau-pair:v1:".length),
      "base64url"
    ).toString()
  );
  endpoint = { ...endpoint, port: code.port };
  const catchup = await synchronizeDevice(client, exchange);
  assert.equal(catchup.kind, "snapshot");
  assert.equal(text(readMobile()), text(deviceDocument(db, 1)!));
  assert.match(text(readMobile()), /离线丙/);
  assert.match(text(readMobile()), /重启丁/);

  const observed = readMobile(),
    snapshot = run("read", { snapshot: true }).snapshot;
  snapshot.rows.contents.find((row: any) => row.id === 1 || row.id?.$integer === "1").content =
    JSON.stringify(initialProjection.projection.content);
  const before = run("read");
  run("commit", {
    expectedSequence: before.sequence,
    expectedHead: before.state.head,
    state: before.state,
    snapshot,
    documents: await Promise.all(snapshot.documents.map(prepareDeviceDocument)),
  });
  assert.equal(text(readMobile()), text(observed));
  assert.match(run("query", { sql: "SELECT content FROM contents WHERE id=1" })[0], /离线丙/);

  const current = await prepareDeviceDocument(readMobile()),
    target = structuredClone(current.projection.content);
  (target[0].children![0] as any).text += "业务戊";
  const escaped = JSON.stringify(target).replaceAll("'", "''");
  run("sql", { sql: `UPDATE contents SET content='${escaped}' WHERE id=1` });
  const intent = JSON.parse(
    run("query", {
      sql: "SELECT json_object('base',json(base_entry),'content',json(target_content),'contracts',json(target_contracts),'token',token) FROM _tau_device_json_intents WHERE content_id=1",
    })[0]
  );
  const draft = restoreDeviceDocument(intent.base),
    tree = new NodeTree(draft);
  await tree.installContracts(intent.contracts, null);
  applyNodeTreeContent(tree, intent.content, {});
  const converted = await mergeDeviceDocument(readMobile(), {
    ...intent.base,
    state: Buffer.from(Y.encodeStateAsUpdate(draft)).toString("base64"),
    updatedAt: Date.now(),
  });
  tree.dispose();
  draft.destroy();
  run("save", {
    document: converted,
    expectedState: readMobile().state,
    intentToken: intent.token,
  });
  await synchronizeDevice(client, exchange);
  assert.match(text(deviceDocument(db, 1)!), /业务戊/);

  db.prepare("UPDATE cards SET tags=? WHERE id=1").run('["电脑标签"]');
  run("sql", { sql: "UPDATE cards SET tags='[\"手机标签\"]' WHERE id=1" });
  editDesktop("己");
  await editMobile("庚");
  const conflict = await synchronizeDevice(client, exchange);
  assert.equal(conflict.preserved, true);
  assert.equal(text(readMobile()), text(deviceDocument(db, 1)!));
  assert.match(text(readMobile()), /己/);
  assert.match(text(readMobile()), /庚/);
  assert.equal((db.prepare("SELECT count(*) AS n FROM _tau_device_branches").get() as any).n, 1);
  assert.equal(
    run("query", { sql: "SELECT CAST(count(*) AS TEXT) FROM _tau_device_branches" })[0],
    "1"
  );

  const pngChunk = (type: string, data: Buffer) => {
    const header = Buffer.alloc(4),
      crc = Buffer.alloc(4),
      body = Buffer.concat([Buffer.from(type), data]);
    header.writeUInt32BE(data.length);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([header, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(400, 0);
  ihdr.writeUInt32BE(400, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const pixels = Buffer.concat(
    Array.from({ length: 400 }, () => Buffer.concat([Buffer.from([0]), randomBytes(1600)]))
  );
  const image = Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      pngChunk("IHDR", ihdr),
      pngChunk("IDAT", deflateSync(pixels)),
      pngChunk("IEND", Buffer.alloc(0)),
    ]),
    imagePath = join(root, "image.png");
  writeFileSync(imagePath, image);
  const reference = assets.import(imagePath),
    name = reference.split("/").at(-1)!;
  const imageContract = await prepareContentContract("tau.editor", {
    type: "image",
    dataVersion: 1,
    kind: "block",
    isVoid: true,
    resources: [{ path: "url", kind: "image" }],
  });
  const imageDocument = restoreDeviceDocument(deviceDocument(db, 1)!),
    imageTree = new NodeTree(imageDocument),
    imageReference = "tau-collab-local:" + randomUUID();
  await imageTree.installContracts({ [imageContract.id]: imageContract.contract }, null);
  imageTree.insertNode(
    {
      type: "image",
      collabId: "image-1",
      tauContract: imageContract.id,
      url: imageReference,
      children: [{ text: "" }],
    },
    null,
    imageTree.spans(null).reduce((size, span) => size + span.length, 0),
    {},
    true
  );
  persistDeviceContent(db, 1, imageDocument, url => (url === imageReference ? reference : null));
  imageTree.dispose();
  imageDocument.destroy();
  await synchronizeDevice(client, exchange);
  assert.ok(Object.values(readMobile().paths).includes(reference));
  assert.match(
    run("query", { sql: "SELECT content FROM contents WHERE id=1" })[0],
    /resources\/device-sync\//
  );
  let chunk = await request({
    ...endpoint,
    token: paired.token,
    body: { kind: "asset-read", name, offset: 0 },
  });
  run("asset-write", { name, offset: 0, ...chunk }, join(root, "phone"));
  assert.equal(run("asset-has", { name }, join(root, "phone")).exists, false);
  for (let offset = 0; offset < image.length; offset += 256 * 1024) {
    chunk = await request({
      ...endpoint,
      token: paired.token,
      body: { kind: "asset-read", name, offset },
    });
    run("asset-write", { name, offset, ...chunk }, join(root, "phone"));
  }
  assert.equal(run("asset-has", { name }, join(root, "phone")).exists, true);
  assert.throws(() =>
    run(
      "asset-write",
      { name, offset: 0, size: 1, bytes: Buffer.from([0]).toString("base64") },
      join(root, "phone")
    )
  );
  const phoneRoot = join(root, "phone");
  let syncCalls = 0;
  (globalThis as any).__deviceSyncNative = async (command: string, args: any) => {
    if (command === "device_sync_request") {
      if (args.kind === "sync") syncCalls++;
      return request({
        ...endpoint,
        token: paired.token,
        body: { kind: args.kind, ...args.payload },
      });
    }
    if (command === "device_sync_asset")
      return run(`asset-${args.action}`, args.payload, phoneRoot);
    if (command === "device_sync_store") {
      if (args.action === "generation") return run("generation");
      if (args.action === "replacement-base") {
        run("open");
        return run("replacement-base");
      }
      if (args.action === "status") {
        run("open");
        const raw = run("query", { sql: "SELECT payload FROM _tau_device_state WHERE id=1" });
        return { state: raw.length ? JSON.parse(raw[0]) : null, paired: { database: "mobile.db" } };
      }
      if (args.action === "restore-state")
        return run("restore-state", { ...args.payload, node: mobileNode, library: state.library });
      if (args.action === "recover") return run("recover", args.payload);
      if (args.action === "missing")
        return run("query", {
          sql: "SELECT json_object('contentId',c.id,'documentId',d.document_id,'content',json(c.content),'contracts',json(d.contracts),'revision',d.revision) FROM contents c JOIN content_documents d ON d.content_id=c.id LEFT JOIN _tau_device_documents s ON s.content_id=c.id WHERE s.content_id IS NULL",
        }).map(JSON.parse);
      if (args.action === "intents") return [];
      if (args.action === "save-document") return run("save", args.payload);
      if (args.action === "assets")
        return Object.values(readMobile().paths).map(path => path.split("/").at(-1));
      if (args.action === "read") return run("read", args.payload);
      if (args.action === "commit") {
        const result = run("commit", args.payload);
        if (args.payload.replaceLocal)
          run(
            "cache-reset",
            { database: "mobile.db", workspace: state.library },
            join(phoneRoot, "collaboration.db")
          );
        return result;
      }
      if (args.action === "document") return readMobile();
      if (args.action === "documents") return run("documents", args.payload);
      throw new Error(`验证桥未处理 ${args.action}`);
    }
    throw new Error(`验证桥未处理 ${command}`);
  };
  const windowTarget = new EventTarget(),
    documentTarget = new EventTarget() as EventTarget & { visibilityState: string };
  documentTarget.visibilityState = "visible";
  (globalThis as any).window = windowTarget;
  (globalThis as any).document = documentTarget;
  const until = async (check: () => boolean) => {
    const deadline = Date.now() + 10000;
    while (!check()) {
      if (Date.now() > deadline)
        throw new Error(`前台恢复验证超时：${JSON.stringify(getDeviceSyncStatus())}`);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  };
  let stopRuntime = startDeviceSync("mobile.db");
  await until(() => getDeviceSyncStatus().phase === "synced");
  documentTarget.visibilityState = "hidden";
  documentTarget.dispatchEvent(new Event("visibilitychange"));
  windowTarget.dispatchEvent(new Event("pagehide"));
  await new Promise(resolve => setTimeout(resolve, 100));
  const backgroundCalls = syncCalls;
  editDesktop("后台辛");
  unlinkSync(join(phoneRoot, "resources/device-sync", name));
  await new Promise(resolve => setTimeout(resolve, 1100));
  assert.equal(syncCalls, backgroundCalls);
  documentTarget.visibilityState = "visible";
  emitNativeResume();
  await until(
    () =>
      text(readMobile()).includes("后台辛") &&
      run("asset-has", { name }, phoneRoot).exists &&
      getDeviceSyncStatus().phase === "synced"
  );
  stopRuntime();
  editDesktop("冷启壬");
  stopRuntime = startDeviceSync("mobile.db");
  await until(
    () => text(readMobile()).includes("冷启壬") && getDeviceSyncStatus().phase === "synced"
  );
  stopRuntime();
  const liveEntry = readMobile(),
    liveDocument = restoreDeviceDocument(liveEntry),
    liveTree = new NodeTree(liveDocument),
    livePaths = new Map(Object.entries(liveEntry.paths));
  liveTree.insertText(
    "paragraph-1",
    liveTree.spans("paragraph-1").reduce((size, span) => size + span.length, 0),
    "活动恢复后保留",
    {}
  );
  const releaseLive = registerDeviceContent(
    1,
    () => {},
    () => persistMobileDeviceContent(1, liveDocument, livePaths)
  );
  run("sql", { sql: "UPDATE _tau_device_documents SET checksum='broken' WHERE content_id=1" });
  stopRuntime = startDeviceSync("mobile.db");
  await until(
    () =>
      Boolean(readMobile()?.state) &&
      text(readMobile()).includes("活动恢复后保留") &&
      getDeviceSyncStatus().phase === "synced"
  );
  stopRuntime();
  releaseLive();
  assert.equal(readMobile().baselineId, liveEntry.baselineId);
  liveTree.dispose();
  liveDocument.destroy();
  await sameRows();
  run("sql", {
    sql: "DELETE FROM _tau_device_state;DELETE FROM _tau_device_anchor;DELETE FROM _tau_device_log;DELETE FROM sqlite_sequence WHERE name='_tau_device_log'",
  });
  editDesktop("身份丢失后自动补齐");
  stopRuntime = startDeviceSync("mobile.db");
  await until(
    () =>
      text(readMobile()).includes("身份丢失后自动补齐") && getDeviceSyncStatus().phase === "synced"
  );
  stopRuntime();
  await sameRows();
  run("sql", { sql: "UPDATE cards SET tags='[\"单端标签\"]' WHERE id=1" });
  const metadata = await synchronizeDevice(client, exchange);
  assert.notEqual(metadata.preserved, true);
  assert.equal(db.prepare("SELECT tags FROM cards WHERE id=1").get().tags, '["单端标签"]');
  await sameRows();

  db.exec(
    "INSERT INTO operation(id,operation_time,operation_id,operation_content_type,operation_action) VALUES (9007199254740993,1000.5,1,'content','update')"
  );
  await synchronizeDevice(client, exchange);
  assert.equal(
    run("query", { sql: "SELECT CAST(id AS TEXT) FROM operation WHERE id=9007199254740993" })[0],
    "9007199254740993"
  );
  run("sql", { sql: "UPDATE operation SET operation_time=2000.5 WHERE id=9007199254740993" });
  await synchronizeDevice(client, exchange);
  await sameRows();

  const insertNote = async (
    contentId: number,
    body: string,
    kind: "card" | "article" | "orphan" = "card",
    refCount = 1
  ) => {
    const identity = { documentId: randomUUID(), baselineId: randomUUID(), epoch: 0 };
    const doc = await createNodeDocument(
      identity,
      {
        title: kind === "article" ? "原标题" : "",
        bannerBg: "",
        bannerPosition: "center",
        content: [
          {
            type: "paragraph",
            collabId: `paragraph-${contentId}`,
            tauContract: contract.id,
            children: [{ text: body }],
          },
        ],
      },
      { [contract.id]: contract.contract }
    );
    const entry: DeviceDocument = {
      contentId,
      ...identity,
      state: Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64"),
      paths: {},
      updatedAt: 2000,
    };
    doc.destroy();
    const prepared = await prepareDeviceDocument(entry);
    db.transaction(() => {
      db.prepare(
        "INSERT INTO contents(id,create_time,update_time,content,count,ref_count) VALUES (?,2000,2000,?,?,?)"
      ).run(contentId, prepared.projection.contentJson, prepared.projection.count, refCount);
      db.prepare(
        "INSERT INTO content_documents(content_id,document_id,format_version,contracts,revision) VALUES (?,?,2,?,?)"
      ).run(
        contentId,
        identity.documentId,
        prepared.projection.contractsJson,
        createHash("sha256")
          .update(prepared.projection.contentJson + "\n" + prepared.projection.contractsJson)
          .digest("hex")
      );
      if (kind === "card")
        db.prepare(
          "INSERT INTO cards(id,create_time,update_time,content_id) VALUES (?,2000,2000,?)"
        ).run(contentId, contentId);
      if (kind === "article")
        db.prepare(
          "INSERT INTO articles(id,title,create_time,update_time,content_id) VALUES (?,'原标题',2000,2000,?)"
        ).run(contentId, contentId);
      writeDeviceDocument(db, prepared);
    })();
    return entry;
  };
  await insertNote(5, "文章正文", "article");
  await synchronizeDevice(client, exchange);
  run("sql", { sql: "UPDATE articles SET title='手机改过的标题' WHERE id=5" });
  await editMobile("正文续写", 5, "paragraph-5");
  await synchronizeDevice(client, exchange);
  assert.equal(db.prepare("SELECT title FROM articles WHERE id=5").get().title, "手机改过的标题");
  await sameRows();

  await insertNote(4, "表格里的正文", "orphan", 0);
  db.prepare(
    "INSERT INTO data_tables(id,create_time,update_time,columns,rows,ref_count) VALUES (100,2000,2000,'[]',?,0)"
  ).run(JSON.stringify([{ id: "row-1", detailContentId: 4 }]));
  const tableRef = ContentIdentityTable.bind(db, "data-table", 100, 2000),
    tableContract = await prepareContentContract("host.database", {
      type: "database",
      dataVersion: 1,
      kind: "block",
      isVoid: true,
    });
  const referenced = restoreDeviceDocument(deviceDocument(db, 1)!),
    referenceTree = new NodeTree(referenced);
  await referenceTree.installContracts({ [tableContract.id]: tableContract.contract }, null);
  referenceTree.insertNode(
    {
      type: "database",
      collabId: "table-reference",
      tauContract: tableContract.id,
      entityRef: tableRef,
      children: [{ text: "" }],
    },
    null,
    referenceTree.spans(null).reduce((sum, span) => sum + span.length, 0),
    {},
    true
  );
  persistDeviceContent(db, 1, referenced, () => null);
  referenceTree.dispose();
  referenced.destroy();
  await synchronizeDevice(client, exchange);
  assert.equal(
    run("query", { sql: "SELECT CAST(ref_count AS TEXT) FROM contents WHERE id=4" })[0],
    "1"
  );
  const removed = restoreDeviceDocument(readMobile()),
    removeTree = new NodeTree(removed);
  removeTree.removeNode("table-reference", {});
  const removePlan = await prepareDeviceDocument({
    ...readMobile(),
    state: Buffer.from(Y.encodeStateAsUpdate(removed)).toString("base64"),
    updatedAt: Date.now(),
  });
  removeTree.dispose();
  removed.destroy();
  run("save", { document: removePlan, expectedState: readMobile().state });
  await synchronizeDevice(client, exchange);
  assert.equal(db.prepare("SELECT ref_count FROM contents WHERE id=4").get().ref_count, 0);
  assert.equal(
    run("query", { sql: "SELECT CAST(ref_count AS TEXT) FROM contents WHERE id=4" })[0],
    "0"
  );
  assert.equal(
    run("query", {
      sql: "SELECT CAST(count(*) AS TEXT) FROM content_pending_releases WHERE content_id=4",
    })[0],
    "1"
  );
  await sameRows();
  assert.equal(hasDeviceEntityHold(db, "data-table", 100), true);
  assert.equal(hasDeviceEntityHold(db, "data-table", 101), false);
  assert.equal(hasDeviceEntityHold(db, "content", 4), true);

  editDesktop("压缩前");
  await editMobile("压缩后");
  run("sql", {
    sql: "INSERT INTO _tau_device_log(table_name,row_key,before_json,after_json,phase) VALUES ('cards','[{\"$integer\":\"1\"}]',json_object('padding',hex(zeroblob(4500000))),NULL,1)",
  });
  assert.equal(run("read").forceSnapshot, true);
  const compacted = await synchronizeDevice(client, exchange);
  assert.equal(compacted.kind, "snapshot");
  assert.match(text(readMobile()), /压缩后/);
  await sameRows();

  const phonePixels = Buffer.from(pixels);
  phonePixels[1] ^= 1;
  const phoneImage = Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      pngChunk("IHDR", ihdr),
      pngChunk("IDAT", deflateSync(phonePixels)),
      pngChunk("IEND", Buffer.alloc(0)),
    ]),
    phoneImagePath = join(phoneRoot, "new-image.png");
  writeFileSync(phoneImagePath, phoneImage);
  const phoneReference = run("asset-import", { path: phoneImagePath }, phoneRoot) as string,
    phoneName = phoneReference.split("/").at(-1)!,
    phoneOpaque = "tau-collab-local:" + randomUUID();
  const phoneEntry = readMobile(),
    phoneDoc = restoreDeviceDocument(phoneEntry),
    phoneTree = new NodeTree(phoneDoc);
  phoneTree.insertNode(
    {
      type: "image",
      collabId: "phone-image",
      tauContract: imageContract.id,
      url: phoneOpaque,
      children: [{ text: "" }],
    },
    null,
    phoneTree.spans(null).reduce((sum, span) => sum + span.length, 0),
    {},
    true
  );
  const phonePlan = await prepareDeviceDocument({
    ...phoneEntry,
    state: Buffer.from(Y.encodeStateAsUpdate(phoneDoc)).toString("base64"),
    paths: { ...phoneEntry.paths, [phoneOpaque]: phoneReference },
    updatedAt: Date.now(),
  });
  phoneTree.dispose();
  phoneDoc.destroy();
  run("save", { document: phonePlan, expectedState: phoneEntry.state });
  stopRuntime = startDeviceSync("mobile.db");
  wakeDeviceSync();
  await until(() => assets.has(phoneName) && getDeviceSyncStatus().phase === "synced");
  stopRuntime();
  await sameRows();

  const overwriteSnapshot = (await request({
    ...endpoint,
    token: paired.token,
    body: { kind: "download" },
  })) as DeviceReply;
  const cachePath = join(phoneRoot, "collaboration.db");
  run(
    "sql",
    { sql: readFileSync("packages/db-schema/schema/collaboration.sql", "utf8") },
    cachePath
  );
  run(
    "sql",
    {
      sql: `INSERT INTO sessions(id,metadata,state) VALUES('discarded',json_object('mode','local','source',json_object('databaseName','${state.library}','librarySourceId','${state.library}')),X'0102');INSERT INTO sessions(id,metadata,state) VALUES('other',json_object('mode','local','source',json_object('databaseName','other.db','librarySourceId','other')),X'0102');INSERT INTO input_drafts VALUES('${state.library}','discarded','baseline',0,'view','node','text','旧草稿','r',1,0,1);INSERT INTO node_views VALUES('${state.library}','body','node','owner','{}','r');`,
    },
    cachePath
  );
  await editMobile("覆盖时丢弃的本地正文");
  run("sql", {
    sql: "UPDATE cards SET tags='[\"覆盖时丢弃的本地标签\"]' WHERE id=1;INSERT INTO home_panel_layout VALUES('discard-on-download',0,0,1)",
  });
  const discardedEntry = readMobile(),
    discardedDoc = restoreDeviceDocument(discardedEntry),
    discardedPaths = new Map(Object.entries(discardedEntry.paths));
  await persistMobileDeviceContent(1, discardedDoc, discardedPaths);
  const beforeOverwrite = run("read"),
    oldGeneration = run("generation");
  await downloadDeviceLibrary();
  assert.equal(
    text(readMobile()),
    text(overwriteSnapshot.snapshot!.documents.find(doc => doc.contentId === 1)!)
  );
  assert.doesNotMatch(text(readMobile()), /覆盖时丢弃/);
  assert.doesNotMatch(text(deviceDocument(db, 1)!), /覆盖时丢弃/);
  assert.notEqual(run("generation"), oldGeneration);
  assert.equal(run("read").changes.length, 0);
  assert.equal(run("read").documents.length, 0);
  assert.equal(
    run("query", {
      sql: "SELECT CAST(count(*) AS TEXT) FROM home_panel_layout WHERE panel_id='discard-on-download'",
    })[0],
    "0"
  );
  assert.equal(
    run(
      "query",
      { sql: "SELECT CAST(count(*) AS TEXT) FROM sessions WHERE id='discarded'" },
      cachePath
    )[0],
    "0"
  );
  assert.equal(
    run(
      "query",
      { sql: "SELECT CAST(count(*) AS TEXT) FROM sessions WHERE id='other'" },
      cachePath
    )[0],
    "1"
  );
  assert.equal(
    run("query", { sql: "SELECT CAST(count(*) AS TEXT) FROM input_drafts" }, cachePath)[0],
    "0"
  );
  assert.equal(
    run("query", { sql: "SELECT CAST(count(*) AS TEXT) FROM node_views" }, cachePath)[0],
    "0"
  );
  await assert.rejects(
    () => persistMobileDeviceContent(1, discardedDoc, discardedPaths),
    /REPLACED/
  );
  assert.throws(
    () =>
      run("commit", {
        expectedHead: beforeOverwrite.state.head,
        expectedSequence: beforeOverwrite.sequence,
        expectedGeneration: oldGeneration,
        state: beforeOverwrite.state,
      }),
    /REPLACED|RETRY/
  );
  discardedDoc.destroy();
  for (let cycle = 0; cycle < 30; cycle++) {
    await editMobile(`覆盖压力${cycle}`);
    await new DeviceSyncEngine({
      ...nativeStore,
      replacementBase: async () => run("replacement-base"),
    }).replace(overwriteSnapshot);
    assert.doesNotMatch(text(readMobile()), /覆盖压力/);
  }
  const nodeCopyPath = join(root, "overwrite-node.db");
  writeFileSync(nodeCopyPath, db.serialize());
  const nodeCopy = new Database(nodeCopyPath),
    nodeCopyStore = new DeviceDatabaseStore(nodeCopy, (document, options) =>
      projectDeviceDocument(nodeCopy, document, options)
    ),
    nodeCopyEngine = new DeviceSyncEngine(nodeCopyStore);
  for (let cycle = 0; cycle < 30; cycle++) {
    nodeCopy.prepare("UPDATE cards SET tags=? WHERE id=1").run(`node-${cycle}`);
    await nodeCopyEngine.replace(overwriteSnapshot);
    assert.deepEqual(
      (await nodeCopyStore.read(true)).snapshot!.rows,
      overwriteSnapshot.snapshot!.rows
    );
  }
  const invalidReply = structuredClone(overwriteSnapshot);
  invalidReply.snapshot!.rows.contents[0].create_time = null;
  const intact = run("read", { snapshot: true });
  await assert.rejects(() =>
    new DeviceSyncEngine({
      ...nativeStore,
      replacementBase: async () => run("replacement-base"),
    }).replace(invalidReply)
  );
  assert.deepEqual(run("read", { snapshot: true }).snapshot, intact.snapshot);
  for (let cycle = 0; cycle < 12; cycle++) {
    const copy = join(root, `overwrite-crash-${cycle}.db`),
      reader = new Database(mobilePath);
    writeFileSync(copy, reader.serialize());
    reader.close();
    run("sql", { sql: "UPDATE cards SET tags='[\"中断前本地数据\"]' WHERE id=1" }, copy);
    const base = run("read", { snapshot: true }, copy),
      nextGeneration = randomUUID(),
      crashPoint = cycle < 6 ? "before" : "after";
    const plan = {
      expectedHead: base.state.head,
      expectedSequence: base.sequence,
      expectedGeneration: base.generation,
      replaceLocal: true,
      generation: nextGeneration,
      state: {
        ...overwriteSnapshot.state,
        node: base.state.node,
        ackHead: overwriteSnapshot.state.head,
        ackSeq: base.sequence,
      },
      snapshot: overwriteSnapshot.snapshot,
      documents: await Promise.all(
        overwriteSnapshot.snapshot!.documents.map(prepareDeviceDocument)
      ),
      crashPoint,
    };
    assert.throws(
      () => run("commit-crash", plan, copy),
      (error: any) => error.status === (crashPoint === "before" ? 86 : 87)
    );
    run("open", {}, copy);
    const reopened = run("read", { snapshot: true }, copy);
    assert.deepEqual(
      reopened.snapshot.rows,
      crashPoint === "before" ? base.snapshot.rows : overwriteSnapshot.snapshot!.rows
    );
    assert.equal(reopened.generation, crashPoint === "before" ? base.generation : nextGeneration);
    const entry = run("documents", { ids: [1] }, copy)[0],
      document = restoreDeviceDocument(entry),
      tree = new NodeTree(document);
    tree.insertText("paragraph-1", 0, "中断恢复可编辑", {});
    run(
      "save",
      {
        document: await prepareDeviceDocument({
          ...entry,
          state: Buffer.from(Y.encodeStateAsUpdate(document)).toString("base64"),
          updatedAt: Date.now(),
        }),
        expectedState: entry.state,
      },
      copy
    );
    tree.dispose();
    document.destroy();
    assert.match(text(run("documents", { ids: [1] }, copy)[0]), /中断恢复可编辑/);
  }
  const nativeBridge = (globalThis as any).__deviceSyncNative;
  (globalThis as any).__deviceSyncNative = (command: string, args: any) =>
    command === "device_sync_request" && args.kind === "download"
      ? Promise.reject(new Error("模拟下载断网"))
      : nativeBridge(command, args);
  try {
    await assert.rejects(() => downloadDeviceLibrary(), /模拟下载断网/);
  } finally {
    (globalThis as any).__deviceSyncNative = nativeBridge;
  }
  assert.equal(deviceReplacementState("mobile.db").active, false);
  nodeCopy.close();
  await editMobile("覆盖后重启仍可编辑");
  await synchronizeDevice(new DeviceSyncEngine(nativeStore), exchange);
  assert.match(text(deviceDocument(db, 1)!), /覆盖后重启仍可编辑/);
  await sameRows();

  await editMobile("回执癸");
  const pending = await client.offer(),
    fullBytes = Buffer.from(readMobile().state, "base64").length,
    deltaBytes = Buffer.from(pending.documents[0].state, "base64").length;
  assert.ok(deltaBytes < fullBytes);
  await exchange(pending);
  const acceptedHead = (await store.read()).state.head;
  await synchronizeDevice(new DeviceSyncEngine(nativeStore), exchange);
  assert.equal((await store.read()).state.head, acceptedHead);
  await sameRows();

  await server.close();
  await editMobile("关闭期间保留");
  let enteredCommit = false,
    finishedCommit = false,
    releaseCommit = () => {};
  const commitGate = new Promise<void>(resolve => {
    releaseCommit = resolve;
  });
  const guardedStore = new DeviceDatabaseStore(
    db,
    (document, options) => projectDeviceDocument(db, document, options),
    async () => {
      enteredCommit = true;
      await commitGate;
      return () => {
        finishedCommit = true;
      };
    }
  );
  server = new DeviceSyncServer(
    serverDirectory,
    new DeviceSyncEngine(guardedStore),
    assets,
    async () => {},
    () => {}
  );
  await server.listen(0);
  endpoint.port = JSON.parse(
    Buffer.from(
      (await server.pairingCode()).code.slice("tau-pair:v1:".length),
      "base64url"
    ).toString()
  ).port;
  const delayedOffer = await client.offer();
  const interruptedRequest = exchange(delayedOffer).then(
    () => false,
    () => true
  );
  await until(() => enteredCommit);
  await server.close();
  releaseCommit();
  assert.equal(await interruptedRequest, true);
  await until(() => finishedCommit);
  assert.equal((await store.read()).state.head, acceptedHead);
  server = new DeviceSyncServer(
    serverDirectory,
    new DeviceSyncEngine(store),
    assets,
    async () => {},
    () => {}
  );
  await server.listen(0);
  endpoint.port = JSON.parse(
    Buffer.from(
      (await server.pairingCode()).code.slice("tau-pair:v1:".length),
      "base64url"
    ).toString()
  ).port;
  await synchronizeDevice(client, exchange);
  assert.match(text(readMobile()), /关闭期间保留/);
  await sameRows();

  await insertNote(2, "将被删除的正文");
  await synchronizeDevice(client, exchange);
  await editMobile("离线留存", 2, "paragraph-2");
  db.transaction(() => {
    db.exec(
      "DELETE FROM cards WHERE id=2;DELETE FROM content_documents WHERE content_id=2;DELETE FROM contents WHERE id=2"
    );
  })();
  const deletion = await synchronizeDevice(client, exchange);
  assert.equal(deletion.noteCopies?.length, 1);
  assert.equal(
    run("query", { sql: "SELECT CAST(count(*) AS TEXT) FROM contents WHERE id=2" })[0],
    "0"
  );
  assert.match(JSON.stringify(deletion.noteCopies), /正文已删除/);
  assert.match(text(deletion.noteCopies![0].document), /离线留存/);
  await sameRows();

  const currentCode = JSON.parse(
    Buffer.from(
      (await server.pairingCode()).code.slice("tau-pair:v1:".length),
      "base64url"
    ).toString()
  );
  const renewed = await request({
    ...endpoint,
    body: {
      kind: "pair",
      secret: currentCode.secret,
      node: mobileNode,
      name: "验证手机",
      existing: true,
    },
  });
  assert.equal(renewed.reply.snapshot, undefined);
  assert.equal(server.listPeers().length, 1);
  const oldToken = paired.token;
  paired.token = renewed.token;
  await assert.rejects(() =>
    request({ ...endpoint, token: oldToken, body: { kind: "sync", offer: {} } })
  );
  const other = deviceCertificate(join(root, "wrong-identity"));
  await assert.rejects(() =>
    request({
      ...endpoint,
      certificate: other.cert,
      token: paired.token,
      body: { kind: "sync", offer: {} },
    })
  );
  server.revoke(mobileNode);
  await assert.rejects(() => exchange({} as DeviceOffer));
  await server.close();
  const latest = (await store.read()).state;
  db.prepare("UPDATE _tau_device_state SET payload=? WHERE id=1").run(
    JSON.stringify({ ...latest, revision: latest.revision - 1, head: randomUUID() })
  );
  const stale = new DeviceSyncServer(
    serverDirectory,
    new DeviceSyncEngine(store),
    assets,
    async () => {},
    () => {}
  );
  await assert.rejects(() => stale.listen(0), /AUTHORITY_BEHIND/);
  db.prepare("UPDATE _tau_device_state SET payload=? WHERE id=1").run(JSON.stringify(latest));
  db.close();
  console.log(
    JSON.stringify(
      {
        desktop: "Electron + better-sqlite3",
        mobile: "真实 Rust 存储与投影模块",
        transport: "固定证书 HTTPS",
        firstTransfer: firstKind,
        offlineRestartCatchup: catchup.kind,
        offlineBodiesMerged: true,
        oldJsonDidNotOverwrite: true,
        businessJsonIntentMerged: true,
        metadataBranchesPreserved: 2,
        allBusinessTablesEqual: true,
        titleStayedLinear: true,
        int64RoundTrip: true,
        canonicalReferenceCounts: true,
        deletedReferencesRetained: true,
        projectionCompactionCatchup: true,
        bodyDeltaBytes: deltaBytes,
        bodyFullBytes: fullBytes,
        lostResponseRestartIdempotent: true,
        closedServerRejectedLateCommit: true,
        nativeIdentityGuardVerified: true,
        deletedNoteCopiesPreserved: 2,
        libraryChoiceRequired: false,
        imageBytes: image.length,
        imageRetryVerified: true,
        bidirectionalImages: true,
        nativeResumeCatchup: true,
        coldStartCatchup: true,
        explicitDownloadDiscardsLocal: true,
        overwriteCyclesBothAdapters: 60,
        staleWriterRejected: true,
        overwriteFailureRolledBack: true,
        overwriteCrashRecoveryCases: 12,
        failedDownloadUnblocksEditing: true,
        trustedIdentityRestoreAndCatchup: true,
        activeMobileSessionKeepsBaseline: true,
        certificateMismatchRejected: true,
        revocationVerified: true,
        staleAuthorityRejected: true,
        artifacts: root,
      },
      null,
      2
    )
  );
}
void main().catch(error => {
  console.error(error);
  process.exit(1);
});
