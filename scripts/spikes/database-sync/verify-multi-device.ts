import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { crc32, deflateSync } from "node:zlib";
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
} from "../../../packages/collaboration/src/device-sync/documents";
import {
  DeviceSyncEngine,
  synchronizeDevice,
} from "../../../packages/collaboration/src/device-sync/engine";
import type {
  DeviceDocument,
  DeviceReply,
  DeviceState,
} from "../../../packages/collaboration/src/device-sync/protocol";
import {
  DeviceDatabaseStore,
  deviceDocument,
  deviceGeneration,
  initializeDeviceSyncDatabase,
  readDeviceSyncState,
  writeDeviceDocument,
} from "../../../apps/desktop/src-electron/main/modules/device-sync/database-store";
import {
  projectDeviceDocument,
  persistDeviceContent,
} from "../../../apps/desktop/src-electron/main/modules/device-sync/content-state";
import { DeviceSyncServer } from "../../../apps/desktop/src-electron/main/modules/device-sync/server";
import { DeviceAssetStore } from "../../../apps/desktop/src-electron/main/modules/device-sync/asset-store";
import { DeviceSyncClient } from "../../../apps/desktop/src-electron/main/modules/device-sync/client";
import {
  pairDesktopReplica,
  prepareReplicaDownload,
  readDesktopPeer,
} from "../../../apps/desktop/src-electron/main/modules/device-sync/replica";
import {
  parseDevicePairCode,
  requestDevice,
} from "../../../apps/desktop/src-electron/main/modules/device-sync/transport";
import { ensureMainSchema } from "../../../apps/desktop/src-electron/main/modules/main-schema";
import { installDatabaseDownload } from "../../../apps/desktop/src-electron/main/modules/database-download";
import { deviceCertificate } from "../../../apps/desktop/src-electron/main/modules/device-sync/certificate";

const requireNative = createRequire(join(process.cwd(), "apps/desktop/package.json"));
const Database = requireNative("better-sqlite3");
const SQL = readFileSync("packages/db-schema/schema/device-sync.sql", "utf8");
const binary = join(process.cwd(), "apps/mobile/src-tauri/target/debug/device-sync-peer");
const native = (path: string, action: string, payload: unknown = {}) =>
  JSON.parse(
    execFileSync(binary, [path, action], {
      input: JSON.stringify(payload),
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      maxBuffer: 128 * 1024 * 1024,
    })
  );
const nativeRequest = (path: string, payload: unknown) =>
  new Promise<any>((resolve, reject) => {
    const child = execFile(
      binary,
      [path, "request"],
      { encoding: "utf8", maxBuffer: 128 * 1024 * 1024 },
      (error, output, stderr) =>
        error ? reject(new Error(stderr || error.message)) : resolve(JSON.parse(output))
    );
    child.stdin!.end(JSON.stringify(payload));
  });
const body = (entry: DeviceDocument) => {
  const doc = restoreDeviceDocument(entry);
  try {
    return JSON.stringify(readNodeDocument(doc).content);
  } finally {
    doc.destroy();
  }
};
const edit = async (
  entry: DeviceDocument,
  word: string,
  save: (doc: Y.Doc) => Promise<void> | void
) => {
  const doc = restoreDeviceDocument(entry),
    tree = new NodeTree(doc);
  try {
    tree.insertText("p", 0, word, {});
    await save(doc);
  } finally {
    tree.dispose();
    doc.destroy();
  }
};
const until = async (check: () => boolean) => {
  const deadline = Date.now() + 12_000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("自动对账超时");
    await new Promise(resolve => setTimeout(resolve, 40));
  }
};
const png = () => {
  const chunk = (type: string, body: Buffer) => {
    const tag = Buffer.from(type),
      size = Buffer.alloc(4),
      checksum = Buffer.alloc(4);
    size.writeUInt32BE(body.length);
    checksum.writeUInt32BE(crc32(Buffer.concat([tag, body])));
    return Buffer.concat([size, tag, body, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(400, 0);
  header.writeUInt32BE(400, 4);
  header[8] = 8;
  header[9] = 6;
  const pixels = Buffer.alloc(400 * 1601);
  for (let row = 0; row < 400; row++) randomBytes(1600).copy(pixels, row * 1601 + 1);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};
async function reopenDesktopProcess(directory: string) {
  const peer = readDesktopPeer(directory)!;
  const db = new Database(join(directory, peer.database));
  initializeDeviceSyncDatabase(db, SQL);
  const engine = new DeviceSyncEngine(
    new DeviceDatabaseStore(
      db,
      (document, settings) => projectDeviceDocument(db, document, settings),
      async () => {
        client.assertActive();
        return () => {};
      }
    )
  );
  const client: DeviceSyncClient = new DeviceSyncClient(peer, {
    engine,
    assets: new DeviceAssetStore(join(directory, "resources")),
    prepare: async () => {},
    assertActive: () => {},
    assetNames: () => [],
    changed: () => {},
    replace: async () => {
      throw new Error("子进程只验证正常补齐");
    },
  });
  try {
    console.log(JSON.stringify({ kind: (await client.synchronize()).kind }));
  } finally {
    client.stop();
    db.close();
  }
}
const childDesktop = (directory: string) =>
  new Promise<any>((resolve, reject) => {
    execFile(
      process.execPath,
      [process.argv[1], "--desktop-reopen", directory],
      { encoding: "utf8", maxBuffer: 128 * 1024 * 1024 },
      (error, stdout, stderr) =>
        error ? reject(new Error(stderr || error.message)) : resolve(JSON.parse(stdout))
    );
  });
async function main() {
  const root = mkdtempSync(join(tmpdir(), "tau-multi-device-"));
  const source = new Database(join(root, "coordinator.db"));
  ensureMainSchema(source);
  initializeDeviceSyncDatabase(source, SQL);
  const contract = await prepareContentContract("tau.editor", {
    type: "paragraph",
    dataVersion: 1,
    kind: "block",
  });
  const identity = { documentId: randomUUID(), baselineId: randomUUID(), epoch: 0 };
  const doc = await createNodeDocument(
    identity,
    {
      title: "",
      bannerBg: "",
      bannerPosition: "center",
      content: [
        {
          type: "paragraph",
          collabId: "p",
          tauContract: contract.id,
          children: [{ text: "共同正文" }],
        },
      ],
    },
    { [contract.id]: contract.contract }
  );
  const initial = await prepareDeviceDocument({
    contentId: 1,
    ...identity,
    state: Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64"),
    paths: {},
    updatedAt: 1000,
  });
  doc.destroy();
  const node = randomUUID(),
    head = randomUUID();
  const state: DeviceState = {
    library: randomUUID(),
    schema: source.prepare("SELECT value FROM schema_meta WHERE key='main_schema_hash'").get()
      .value,
    node,
    authority: node,
    epoch: randomUUID(),
    head,
    ackHead: head,
    ackSeq: 0,
    revision: 0,
    enabled: true,
  };
  source
    .prepare("INSERT INTO library_identity VALUES(1,?,?,NULL,1000)")
    .run(state.library, randomUUID());
  source
    .prepare(
      "INSERT INTO contents(id,create_time,update_time,content,count,ref_count) VALUES(1,1000,1000,?,4,1)"
    )
    .run(initial.projection.contentJson);
  source
    .prepare(
      "INSERT INTO content_documents(content_id,document_id,format_version,contracts,revision) VALUES(1,?,2,?,'initial')"
    )
    .run(identity.documentId, initial.projection.contractsJson);
  source.exec("INSERT INTO cards(id,create_time,update_time,content_id) VALUES(1,1000,1000,1)");
  writeDeviceDocument(source, initial);
  source
    .prepare("INSERT INTO _tau_device_state(id,payload) VALUES(1,?)")
    .run(JSON.stringify(state));
  initializeDeviceSyncDatabase(source, SQL);
  const store = new DeviceDatabaseStore(source, (document, settings) =>
    projectDeviceDocument(source, document, settings)
  );
  const engine = new DeviceSyncEngine(store),
    assets = new DeviceAssetStore(join(root, "coordinator-resources"));
  const serverDirectory = join(root, "server");
  const createServer = () =>
    new DeviceSyncServer(
      serverDirectory,
      engine,
      assets,
      async () => {},
      () => {}
    );
  let server = createServer();
  await server.listen(0);
  const code = async () => {
    const value = parseDevicePairCode((await server.pairingCode()).code);
    return `tau-pair:v1:${Buffer.from(JSON.stringify({ ...value, addresses: ["127.0.0.1"] })).toString("base64url")}`;
  };
  const desktop = async (name: string) => {
    const directory = join(root, name);
    mkdirSync(directory);
    const enrollment = await pairDesktopReplica({
      directory,
      databases: directory,
      node: randomUUID(),
      name,
      code: await code(),
    });
    const peer = enrollment.peer,
      path = join(directory, peer.database);
    const local: any = {
      directory,
      peer,
      path,
      client: undefined,
      prepare: async () => {},
      replacements: 0,
    };
    local.open = () => {
      local.db = new Database(path);
      initializeDeviceSyncDatabase(local.db, SQL);
      local.store = new DeviceDatabaseStore(
        local.db,
        (document, settings) => projectDeviceDocument(local.db, document, settings),
        async () => {
          local.client.assertActive();
          return () => {};
        }
      );
      local.client = new DeviceSyncClient(readDesktopPeer(directory)!, {
        engine: new DeviceSyncEngine(local.store),
        assets: new DeviceAssetStore(join(directory, "resources")),
        prepare: () => local.prepare(),
        assertActive: () => {
          if (!local.db.open) throw new Error("库已关闭");
        },
        assetNames: () =>
          Object.values(deviceDocument(local.db, 1)?.paths ?? {}).map(path =>
            path.split("/").at(-1)!
          ),
        changed: () => {},
        replace: async reply => {
          const base = await local.store.replacementBase(reply.state, reply.sourceSequence ?? 0);
          local.client.stop();
          local.db.close();
          const temporary = `${path}.download`;
          try {
            await prepareReplicaDownload(temporary, base.state, base.sequence, reply);
            installDatabaseDownload(path, temporary, "");
            local.replacements++;
          } finally {
            local.open();
          }
        },
      });
    };
    local.open();
    local.edit = (word: string) =>
      edit(deviceDocument(local.db, 1)!, word, doc => {
        persistDeviceContent(local.db, 1, doc, () => null);
      });
    local.sync = () => local.client.synchronize();
    local.entry = () => deviceDocument(local.db, 1)!;
    return local;
  };
  const desktops: any[] = [],
    phones: any[] = [];
  try {
    desktops.push(await desktop("电脑B"), await desktop("电脑C"));
    for (const name of ["手机P", "手机Q"]) {
      const directory = join(root, name);
      mkdirSync(directory);
      const path = join(directory, "phone.db"),
        pairing = parseDevicePairCode(await code()),
        node = randomUUID();
      const paired = await nativeRequest(path, {
        ...pairing,
        body: { kind: "pair", secret: pairing.secret, node, name },
      });
      const localState = {
        ...paired.reply.state,
        node,
        ackHead: paired.reply.state.head,
        ackSeq: 0,
        enabled: true,
      };
      native(path, "init", localState);
      native(path, "commit", {
        expectedHead: localState.head,
        expectedSequence: 0,
        state: localState,
        snapshot: paired.reply.snapshot,
        documents: await Promise.all(paired.reply.snapshot.documents.map(prepareDeviceDocument)),
      });
      const phone: any = { directory, path, pairing, token: paired.token };
      phone.storage = {
        read: async (snapshot = false) => native(path, "read", { snapshot }),
        loadDocuments: async (ids: number[]) => native(path, "documents", { ids }),
        commit: async (plan: unknown) => {
          native(path, "commit", plan);
        },
      };
      phone.engine = new DeviceSyncEngine(phone.storage);
      phone.entry = () => native(path, "documents", { ids: [1] })[0];
      phone.net = (body: unknown) => nativeRequest(path, { ...pairing, token: paired.token, body });
      phone.edit = (word: string) => {
        const generation = native(path, "generation"),
          original = phone.entry();
        return edit(original, word, async doc => {
          native(path, "save", {
            document: await prepareDeviceDocument({
              ...original,
              state: Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64"),
              updatedAt: Date.now(),
            }),
            expectedState: original.state,
            expectedGeneration: generation,
          });
        });
      };
      phone.sync = async () => {
        const reply = await synchronizeDevice(phone.engine, offer =>
          phone.net({ kind: "sync", offer })
        );
        for (const reference of Object.values(phone.entry().paths) as string[]) {
          const name = reference.split("/").at(-1)!;
          const local = native(directory, "asset-has", { name }).exists;
          const remote = (await phone.net({ kind: "asset-has", name })).exists;
          if (local === remote) continue;
          for (let offset = 0; ; offset += 256 * 1024) {
            const chunk = local
              ? native(directory, "asset-read", { name, offset })
              : await phone.net({ kind: "asset-read", name, offset });
            if (local) await phone.net({ kind: "asset-write", name, offset, ...chunk });
            else native(directory, "asset-write", { name, offset, ...chunk });
            if (offset + 256 * 1024 >= chunk.size) break;
          }
        }
        return reply;
      };
      phones.push(phone);
    }
    assert.equal(server.listPeers().length, 4);
    const all = [...desktops, ...phones];
    const settle = async () => {
      for (let round = 0; round < 2; round++) for (const device of all) await device.sync();
    };
    const same = async () => {
      const canonical = (await store.read(true)).snapshot!.rows;
      for (const device of desktops)
        assert.deepEqual((await device.store.read(true)).snapshot.rows, canonical);
      for (const phone of phones)
        assert.deepEqual(native(phone.path, "read", { snapshot: true }).snapshot.rows, canonical);
    };
    for (let cycle = 0; cycle < 6; cycle++) {
      await edit(deviceDocument(source, 1)!, `[A${cycle}]`, doc => {
        persistDeviceContent(source, 1, doc, () => null);
      });
      for (let i = 0; i < all.length; i++) await all[i].edit(`[${i}-${cycle}]`);
      const results = await Promise.allSettled(all.map(device => device.sync()));
      for (const result of results)
        if (result.status === "rejected")
          assert.match(String(result.reason), /DEVICE_SYNC_(BUSY|RETRY)/);
      await settle();
      await same();
    }
    const b = desktops[0],
      c = desktops[1];
    for (const device of all)
      for (let cycle = 0; cycle < 6; cycle++)
        for (const marker of [`[A${cycle}]`, ...all.map((_, i) => `[${i}-${cycle}]`)])
          assert.equal(body(device.entry()).split(marker).length - 1, 1);

    b.client.stop();
    b.db.close();
    b.open();
    await b.edit("长期离线保留");
    await edit(deviceDocument(source, 1)!, "离线期间电脑修改", doc => {
      persistDeviceContent(source, 1, doc, () => null);
    });
    await c.sync();
    source.exec("DELETE FROM _tau_device_history");
    b.client.stop();
    b.db.close();
    assert.equal((await childDesktop(b.directory)).kind, "snapshot");
    b.open();
    assert.match(body(b.entry()), /长期离线保留/);
    await settle();
    await same();

    await b.edit("重配仍保留");
    const unrelated = new Database(join(b.directory, "unrelated.db"));
    ensureMainSchema(unrelated);
    initializeDeviceSyncDatabase(unrelated, SQL);
    unrelated.close();
    const pairedAgain = await pairDesktopReplica({
      directory: b.directory,
      databases: b.directory,
      node: b.peer.node,
      name: "电脑B",
      existingDatabase: "unrelated.db",
      code: await code(),
    });
    assert.equal(pairedAgain.existing, true);
    assert.equal(pairedAgain.peer.database, b.peer.database);
    b.client.stop();
    b.db.close();
    b.open();
    await settle();
    await same();
    assert.match(body(deviceDocument(source, 1)!), /重配仍保留/);

    const imageContract = await prepareContentContract("tau.editor", {
      type: "image",
      dataVersion: 1,
      kind: "block",
      isVoid: true,
      resources: [{ path: "url", kind: "image" }],
    });
    for (const [i, target] of [b, phones[0]].entries()) {
      const imagePath = join(target.directory, `image-${i}.png`);
      writeFileSync(imagePath, png());
      const reference =
        i === 0
          ? new DeviceAssetStore(join(b.directory, "resources")).import(imagePath)
          : native(target.directory, "asset-import", { path: imagePath });
      const original = target.entry(),
        doc = restoreDeviceDocument(original),
        tree = new NodeTree(doc),
        opaque = `tau-collab-local:${randomUUID()}`;
      await tree.installContracts({ [imageContract.id]: imageContract.contract }, null);
      tree.insertNode(
        {
          type: "image",
          collabId: `image-${i}`,
          tauContract: imageContract.id,
          url: opaque,
          children: [{ text: "" }],
        },
        null,
        tree.spans(null).reduce((n, span) => n + span.length, 0),
        {},
        true
      );
      if (i === 0)
        persistDeviceContent(b.db, 1, doc, key =>
          key === opaque ? reference : original.paths[key]
        );
      else
        native(target.path, "save", {
          document: await prepareDeviceDocument({
            ...original,
            state: Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64"),
            paths: { ...original.paths, [opaque]: reference },
            updatedAt: Date.now(),
          }),
          expectedState: original.state,
          expectedGeneration: native(target.path, "generation"),
        });
      tree.dispose();
      doc.destroy();
      await settle();
      await same();
      const name = reference.split("/").at(-1)!;
      assert.ok(assets.has(name));
      for (const desktop of desktops)
        assert.ok(new DeviceAssetStore(join(desktop.directory, "resources")).has(name));
      for (const phone of phones)
        assert.equal(native(phone.directory, "asset-has", { name }).exists, true);
    }

    const port = b.peer.port;
    await server.close();
    for (const device of all) await device.edit("断网编辑");
    await assert.rejects(() => b.sync(), /OFFLINE/);
    for (const device of all) assert.match(body(device.entry()), /断网编辑/);
    server = createServer();
    await server.listen(port);
    b.client.start();
    await until(() => b.client.status.phase === "synced");
    b.client.stop();
    b.db.close();
    b.open();
    await settle();
    await same();
    await edit(deviceDocument(source, 1)!, "恢复唤醒自动到达", doc => {
      persistDeviceContent(source, 1, doc, () => null);
    });
    b.client.wake();
    await until(() => body(b.entry()).includes("恢复唤醒自动到达"));
    b.client.stop();
    b.db.close();
    b.open();
    await settle();
    await same();

    const canonical = body(deviceDocument(source, 1)!);
    await b.edit("覆盖时丢弃");
    b.db.prepare("UPDATE cards SET tags=? WHERE id=1").run('["覆盖时丢弃"]');
    const oldGeneration = deviceGeneration(b.db),
      oldState = readDeviceSyncState(b.db)!;
    const oldSequence = (await b.store.replacementBase(oldState, 0)).sequence;
    let release!: () => void,
      entered = false;
    b.prepare = () => {
      entered = true;
      return new Promise<void>(resolve => {
        release = resolve;
      });
    };
    const queuedOne = b.sync().then(
      () => "accepted",
      (error: unknown) => String(error)
    );
    await until(() => entered);
    const queuedTwo = b.sync().then(
      () => "accepted",
      (error: unknown) => String(error)
    );
    const downloading = b.client.download();
    b.prepare = async () => {};
    release();
    assert.match(await queuedOne, /REPLACED/);
    assert.match(await queuedTwo, /REPLACED/);
    await downloading;
    assert.equal(body(b.entry()), canonical);
    assert.notEqual(deviceGeneration(b.db), oldGeneration);
    await assert.rejects(
      () =>
        b.store.commit({
          expectedSequence: oldSequence,
          expectedHead: oldState.head,
          expectedGeneration: oldGeneration,
          state: oldState,
        }),
      /DEVICE_SYNC_REPLACED/
    );
    await b.edit("覆盖后仍可编辑");
    await settle();
    await same();
    assert.doesNotMatch(body(deviceDocument(source, 1)!), /覆盖时丢弃/);

    const endpoint = parseDevicePairCode(await code());
    await assert.rejects(
      () => requestDevice({ ...endpoint, addresses: ["8.8.8.8"] }, { kind: "head" }, b.peer.token),
      /ADDRESS/
    );
    await assert.rejects(
      () =>
        requestDevice(
          { ...endpoint, certificate: deviceCertificate(join(root, "wrong-certificate")).cert },
          { kind: "head" },
          b.peer.token
        ),
      /OFFLINE|CERTIFICATE/
    );
    server.revoke(c.peer.node);
    await assert.rejects(() => c.sync(), /UNTRUSTED/);
    await c.edit("撤销后仍可本机编辑");
    console.log(
      JSON.stringify(
        {
          topology: "1台协调电脑+2台连接电脑+2台Rust手机",
          pairedDevices: 4,
          concurrentOfflineRounds: 6,
          allBusinessTablesEqual: true,
          desktopColdRestart: true,
          snapshotCatchupPreservesOfflineBody: true,
          sameLibraryRePairPreservesOfflineBody: true,
          desktopAndPhoneImagesReachedAllDevices: true,
          automaticRetryAndWake: true,
          overwriteDiscardsQueuedSyncAndLocalEdits: true,
          newSessionAfterOverwriteEditable: true,
          privateNetworkOnly: true,
          revocationPreservesLocalEditing: true,
          artifacts: root,
        },
        null,
        2
      )
    );
  } finally {
    for (const desktop of desktops) {
      desktop.client.stop();
      if (desktop.db.open) desktop.db.close();
    }
    await server.close();
    source.close();
  }
}
(process.argv[2] === "--desktop-reopen" ? reopenDesktopProcess(process.argv[3]) : main()).catch(
  error => {
    console.error(error);
    process.exitCode = 1;
  }
);
