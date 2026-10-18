import { app, BrowserWindow, ipcMain } from "electron";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import AdmZip from "adm-zip";
import { LocalPluginPreferences } from "@tau/plugins/local-state";
import PathUtil from "../../src-electron/main/utils/PathUtil";
import pluginLocal from "../../src-electron/main/modules/plugin-local";
import fetchModule from "../../src-electron/main/modules/fetch";
import { pluginSyncSessions } from "../../src-electron/main/services/plugin-sync";
import { PluginUpdates } from "../../src-electron/main/services/plugin-updates";
import {
  publishSnapshot,
  readSnapshotHead,
  SYNC_MODEL_VERSION,
} from "@tau/db-schema/sync-protocol";
import type { SyncProvider } from "@tau/plugins/sync";
import { verifySignature } from "./verify-signature";
import { verifyOssSignature } from "./verify-oss-signature";

async function main() {
  const [phase, sandbox, archive, previousArchive] = process.argv.slice(2);
  if (!phase || !sandbox || !archive) throw new Error("缺少隔离验收参数");
  const migrating = phase.startsWith("migrate");
  PathUtil.getAppDir = () =>
    path.join(sandbox, phase === "upgrade" ? "upgrade-data" : migrating ? "migrated-data" : "data");
  app.setPath("userData", path.join(sandbox, "profile"));
  const archiveZip = new AdmZip(archive);
  const manifestEntry = archiveZip
    .getEntries()
    .find(entry => entry.entryName.endsWith("/manifest.json"));
  if (!manifestEntry) throw new Error("缺少manifest");
  const id: string = JSON.parse(manifestEntry.getData().toString()).id;
  if (!["tau.sync-s3", "tau.sync-oss"].includes(id)) throw new Error("验收脚本不支持该插件");
  const oss = id === "tau.sync-oss";
  const legacyKey = oss ? "aliOSS" : "s3";
  let bucketVersioning = "";
  let window: BrowserWindow | undefined;
  const objects = new Map<string, Buffer>();
  let loseConditionalResponse = false;
  let blocked!: () => void;
  const blockedRequest = new Promise<void>(resolve => {
    blocked = resolve;
  });
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost"),
      key = url.pathname;
    const fail = (status: number) => {
      res.statusCode = status;
      res.end();
    };
    if (!(oss ? verifyOssSignature(req, "bucket", "test-only") : verifySignature(req, "test-only")))
      return fail(403);
    if (oss && url.searchParams.has("versioning")) {
      res.setHeader("Content-Type", "application/xml");
      return res.end(
        "<VersioningConfiguration><Status>" +
          bucketVersioning +
          "</Status></VersioningConfiguration>"
      );
    }
    if (key.endsWith("/blocked")) {
      blocked();
      return;
    }
    if (req.method === "PUT") {
      const chunks: Buffer[] = [];
      for await (const part of req) chunks.push(Buffer.from(part));
      const conditional = oss
        ? req.headers["x-oss-forbid-overwrite"] === "true"
        : req.headers["if-none-match"] === "*";
      if (conditional && objects.has(key)) return fail(oss ? 409 : 412);
      objects.set(key, Buffer.concat(chunks));
      if (conditional && loseConditionalResponse) {
        loseConditionalResponse = false;
        return fail(400);
      }
      res.setHeader("ETag", '"test"');
      return res.end();
    }
    if (url.searchParams.has("list-type") || (oss && url.searchParams.has("prefix"))) {
      res.setHeader("Content-Type", "application/xml");
      return res.end("<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>");
    }
    const bytes = objects.get(key);
    if (!bytes) return fail(404);
    res.setHeader("Content-Length", bytes.length);
    res.end(req.method === "HEAD" ? undefined : bytes);
  });
  await app.whenReady();
  try {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("测试服务器未启动");
    const endpoint = "http://127.0.0.1:" + address.port;
    const config = oss
      ? {
          bucket: "bucket",
          region: "oss-cn-hangzhou",
          path: "isolated",
          accessKeyId: "test-only",
          accessKeySecret: "test-only",
        }
      : {
          endpoint: "http://127.0.0.1:" + address.port,
          bucket: "bucket",
          region: "test-region",
          pathPrefix: "isolated",
          urlStyle: "path",
          accessKeyId: "test-only",
          secretAccessKey: "test-only",
        };
    if (phase === "migrate") {
      await mkdir(PathUtil.getAppDir(), { recursive: true });
      await writeFile(
        path.join(PathUtil.getAppDir(), "setting.json"),
        JSON.stringify({
          sync: {
            active: legacyKey,
            autoSyncEnabled: true,
            [legacyKey]: oss
              ? { bucket: config.bucket, region: config.region, path: config.path }
              : { bucket: config.bucket, region: config.region, pathPrefix: config.pathPrefix },
          },
          integration: {
            [legacyKey]: oss
              ? { accessKeyId: config.accessKeyId, accessKeySecret: config.accessKeySecret }
              : {
                  endpoint: config.endpoint,
                  accessKeyId: config.accessKeyId,
                  secretAccessKey: config.secretAccessKey,
                  urlStyle: config.urlStyle,
                },
          },
          database: { active: "data.db", databases: [{ name: "data.db", version: 7 }] },
        })
      );
    }
    if (phase === "upgrade") {
      if (!previousArchive) throw new Error("升级验收缺少旧官方包");
      new AdmZip(previousArchive).extractAllTo(path.join(PathUtil.getAppDir(), "plugins"), true);
      const preferences = new LocalPluginPreferences(path.join(PathUtil.getAppDir(), "plugins"));
      await preferences.load();
      await preferences.set(id, true);
      await writeFile(
        path.join(PathUtil.getAppDir(), "setting.json"),
        JSON.stringify({
          sync: {
            active: "plugin",
            autoSyncEnabled: true,
            plugin: { id, configurations: { [id]: config } },
          },
        })
      );
    }
    if (phase === "install") {
      const updates = new PluginUpdates(path.join(PathUtil.getAppDir(), "plugins"), "0.59.0");
      await updates.initialize();
      await updates.stageZip(archive);
    }
    await pluginLocal.init();
    await fetchModule.init();
    ipcMain.handle("module-init:init-module", () => ({ success: true }));
    window = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: path.join(app.getAppPath(), "preload.cjs"),
        contextIsolation: true,
        sandbox: false,
      },
    });
    await window.loadFile(path.join(app.getAppPath(), "index.html"));
    const call = <T = unknown>(channel: string, ...args: unknown[]): Promise<T> =>
      window!.webContents.executeJavaScript(
        "window.electron.invoke(" +
          [channel, ...args].map(value => JSON.stringify(value)).join(",") +
          ")"
      );
    const scan = await call<{ entries: { id: string; enabled: boolean; artifact?: unknown }[] }>(
      "plugin-local:scan",
      {}
    );
    const installed = scan.entries.find(entry => entry.id === id);
    assert.ok(installed?.artifact);
    if (phase === "upgrade")
      assert.equal(
        (installed.artifact as { manifest: { version: string } }).manifest.version,
        "0.2.0"
      );
    await window.webContents.executeJavaScript(
      "syncRendererTest.activate(" +
        JSON.stringify(installed.artifact) +
        "," +
        JSON.stringify(oss ? endpoint : null) +
        ")"
    );
    if (phase === "install") {
      assert.equal(installed.enabled, false);
      await call("plugin-local:set-enabled", id, true);
    } else {
      assert.equal(installed.enabled, true);
      const saved = JSON.parse(
        await readFile(path.join(PathUtil.getAppDir(), "setting.json"), "utf8")
      );
      assert.equal(saved.sync.active, "plugin");
      assert.equal(saved.sync.plugin.id, id);
      assert.equal(saved.sync.plugin.configurations[id].bucket, "bucket");
      assert.equal(Object.hasOwn(saved.sync, legacyKey), false);
      if (phase === "migrate" || phase === "upgrade")
        assert.deepEqual(saved.sync.plugin.configurations[id], config);
      if (migrating) {
        assert.equal(saved.sync.autoSyncEnabled, true);
        assert.equal(saved.database.databases[0].version, 7);
      }
    }
    if (phase !== "migrate") await call("plugin-local:sync-config", id, config);
    await window.webContents.executeJavaScript(
      "syncRendererTest.open(" + JSON.stringify(config) + ")"
    );
    await assert.rejects(call("plugin-local:set-enabled", id, false), /同步任务/);
    await assert.rejects(call("plugin-local:uninstall", id), /同步任务/);
    const bytesCall = async (
      method: "uploadFile" | "createFileIfAbsent",
      name: string,
      data: Uint8Array
    ) =>
      window!.webContents.executeJavaScript(
        "syncRendererTest." +
          (method === "uploadFile" ? "upload" : "create") +
          "(" +
          JSON.stringify(name) +
          "," +
          JSON.stringify([...data]) +
          ")"
      ) as Promise<boolean>;
    const provider: SyncProvider = {
      fileExists: name =>
        window!.webContents.executeJavaScript(
          "syncRendererTest.exists(" + JSON.stringify(name) + ")"
        ),
      downloadFile: async name =>
        new Uint8Array(
          (await window!.webContents.executeJavaScript(
            "syncRendererTest.download(" + JSON.stringify(name) + ")"
          )) as Uint8Array
        ),
      uploadFile: (name, data) => bytesCall("uploadFile", name, data),
      createFileIfAbsent: (name, data) => bytesCall("createFileIfAbsent", name, data),
      listFiles: prefix =>
        window!.webContents.executeJavaScript(
          "syncRendererTest.list(" + JSON.stringify(prefix ?? "") + ")"
        ),
    };
    const payload = new Uint8Array([1, 2, 3]);
    assert.equal(await provider.uploadFile("data.db", payload), true);
    assert.equal(await provider.uploadFile("sessions.zip", payload), true);
    const next = {
      version: 1,
      parentVersion: 0,
      dataModelVersion: SYNC_MODEL_VERSION,
      commitId: "isolated-commit",
      databaseObject: "data.db",
      sessionsObject: "sessions.zip",
    };
    await publishSnapshot(provider, "head.json", { version: 0 }, next);
    assert.equal((await readSnapshotHead(provider, "head.json")).version, 1);
    loseConditionalResponse = true;
    await publishSnapshot(provider, "lost-response.json", { version: 0 }, next);
    assert.equal((await readSnapshotHead(provider, "lost-response.json")).version, 1);
    assert.deepEqual(await provider.downloadFile("data.db"), payload);
    if (oss) {
      for (const status of ["Enabled", "Suspended"]) {
        bucketVersioning = status;
        await assert.rejects(provider.createFileIfAbsent("blocked-version", payload), /版本控制/);
        assert.equal(await provider.uploadFile("ordinary-put", payload), true);
      }
      bucketVersioning = "";
    }
    await window.webContents.executeJavaScript("syncRendererTest.close()");
    const resourceSession = await pluginSyncSessions.begin(window.webContents.id, id, config);
    await pluginSyncSessions.call(window.webContents.id, resourceSession, "uploadFile", [
      "resources/test",
      payload,
    ]);
    assert.deepEqual(
      await pluginSyncSessions.call(window.webContents.id, resourceSession, "downloadFile", [
        "resources/test",
      ]),
      payload
    );
    await pluginSyncSessions.end(window.webContents.id, resourceSession);
    if (phase.endsWith("restart")) {
      await call("plugin-local:set-enabled", id, false);
      await assert.rejects(call("plugin-local:sync-begin", id, config), /未启用/);
      await call("plugin-local:set-enabled", id, true);
    }
    const owner = window.webContents.id;
    const disconnectedSession = await pluginSyncSessions.begin(owner, id, config);
    const interrupted = pluginSyncSessions.call(owner, disconnectedSession, "fileExists", [
      "blocked",
    ]);
    const rejected = assert.rejects(interrupted, /断开|关闭/);
    await blockedRequest;
    window.destroy();
    await rejected;
    assert.equal(pluginSyncSessions.busy, false);
    console.log(
      JSON.stringify({
        phase,
        pluginId: id,
        installed: true,
        enabled: true,
        configPersisted: true,
        uploadDownload: true,
        publishedVersion: 1,
        mutationGuard: true,
        rendererOnly: true,
        disconnectCleanup: true,
      })
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : "验证失败");
    process.exitCode = 1;
  } finally {
    if (window && !window.isDestroyed()) window.destroy();
    server.closeAllConnections();
    server.close();
    app.exit(process.exitCode ?? 0);
  }
}
void main().catch(error => {
  console.error(error instanceof Error ? error.message : "验证失败");
  app.exit(1);
});
