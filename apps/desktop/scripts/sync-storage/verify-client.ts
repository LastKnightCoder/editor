import { app, BrowserWindow } from "electron";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import PathUtil from "../../src-electron/main/utils/PathUtil";
import pluginLocal from "../../src-electron/main/modules/plugin-local";
import { PluginUpdates } from "../../src-electron/main/services/plugin-updates";
import {
  publishSnapshot,
  readSnapshotHead,
  SYNC_MODEL_VERSION,
} from "@tau/db-schema/sync-protocol";
import type { SyncProvider } from "@tau/plugins/sync";

async function main() {
  const [phase, sandbox, archive] = process.argv.slice(2);
  if (!phase || !sandbox || !archive) throw new Error("缺少隔离验收参数");
  const migrating = phase.startsWith("migrate");
  PathUtil.getAppDir = () => path.join(sandbox, migrating ? "migrated-data" : "data");
  app.setPath("userData", path.join(sandbox, "profile"));
  const id = "tau.sync-s3";
  let window: BrowserWindow | undefined;
  const objects = new Map<string, Buffer>();
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost"),
      key = url.pathname;
    const fail = (status: number) => {
      res.statusCode = status;
      res.end();
    };
    if (!req.headers.authorization) return fail(403);
    if (req.method === "PUT") {
      const chunks: Buffer[] = [];
      for await (const part of req) chunks.push(Buffer.from(part));
      if (req.headers["if-none-match"] === "*" && objects.has(key)) return fail(412);
      objects.set(key, Buffer.concat(chunks));
      res.setHeader("ETag", '"test"');
      return res.end();
    }
    if (url.searchParams.has("list-type")) {
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
    const config = {
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
            active: "s3",
            autoSyncEnabled: true,
            s3: { bucket: config.bucket, region: config.region, pathPrefix: config.pathPrefix },
          },
          integration: {
            s3: {
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
    if (phase === "install") {
      const updates = new PluginUpdates(path.join(PathUtil.getAppDir(), "plugins"), "0.59.0");
      await updates.initialize();
      await updates.stageZip(archive);
    }
    await pluginLocal.init();
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
      assert.equal(Object.hasOwn(saved.sync, "s3"), false);
      if (phase === "migrate") assert.deepEqual(saved.sync.plugin.configurations[id], config);
      if (migrating) {
        assert.equal(saved.sync.autoSyncEnabled, true);
        assert.equal(saved.database.databases[0].version, 7);
      }
    }
    if (phase !== "migrate") await call("plugin-local:sync-config", id, config);
    const session = await call<string>("plugin-local:sync-begin", id, config);
    await assert.rejects(call("plugin-local:set-enabled", id, false), /同步任务/);
    await assert.rejects(call("plugin-local:uninstall", id), /同步任务/);
    const bytesCall = async (
      method: "uploadFile" | "createFileIfAbsent",
      name: string,
      data: Uint8Array
    ) =>
      window!.webContents.executeJavaScript(
        "window.electron.invoke('plugin-local:sync-call'," +
          JSON.stringify(session) +
          "," +
          JSON.stringify(method) +
          ",[" +
          JSON.stringify(name) +
          ",new Uint8Array(" +
          JSON.stringify([...data]) +
          ")])"
      ) as Promise<boolean>;
    const provider: SyncProvider = {
      fileExists: name => call("plugin-local:sync-call", session, "fileExists", [name]),
      downloadFile: async name =>
        new Uint8Array(
          (await call("plugin-local:sync-call", session, "downloadFile", [name])) as Uint8Array
        ),
      uploadFile: (name, data) => bytesCall("uploadFile", name, data),
      createFileIfAbsent: (name, data) => bytesCall("createFileIfAbsent", name, data),
      listFiles: prefix =>
        call("plugin-local:sync-call", session, "listFiles", prefix ? [prefix] : []),
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
    assert.deepEqual(await provider.downloadFile("data.db"), payload);
    await call("plugin-local:sync-end", session);
    if (phase.endsWith("restart")) {
      await call("plugin-local:set-enabled", id, false);
      await assert.rejects(call("plugin-local:sync-begin", id, config), /未启用/);
      await call("plugin-local:set-enabled", id, true);
    }
    console.log(
      JSON.stringify({
        phase,
        installed: true,
        enabled: true,
        configPersisted: true,
        uploadDownload: true,
        publishedVersion: 1,
        mutationGuard: true,
      })
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : "验证失败");
    process.exitCode = 1;
  } finally {
    window?.destroy();
    server.closeAllConnections();
    server.close();
    app.exit(process.exitCode ?? 0);
  }
}
void main().catch(error => {
  console.error(error instanceof Error ? error.message : "验证失败");
  app.exit(1);
});
