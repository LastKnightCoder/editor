import { mkdtemp, cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createServer } from "node:http";
import { expect, it, vi } from "vitest";
import { LocalPluginPreferences } from "@tau/plugins/local-state";
import { withPluginSyncMutation, hasPluginSyncLeases } from "@tau/plugins/sync-leases";
import {
  publishSnapshot,
  readSnapshotHead,
  SYNC_MODEL_VERSION,
} from "@tau/db-schema/sync-protocol";
const state = vi.hoisted(() => ({ root: "" }));
vi.mock("../path.js", () => ({ getAppDir: () => state.root }));
import { createSyncProvider } from "./factory.js";

it("CLI独立加载固定S3产物，签名读写私有桶、发布快照并尊重启用与跨进程占用", async () => {
  state.root = await mkdtemp(path.join(os.tmpdir(), "tau-cli-s3-"));
  const plugins = path.join(state.root, "plugins"),
    id = "tau.sync-s3";
  const objects = new Map<string, Buffer>();
  const server = createServer(async (req, res) => {
    if (!req.headers.authorization) {
      res.writeHead(403).end();
      return;
    }
    const key = req.url?.split("?")[0] ?? "";
    if (req.method === "PUT") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      if (req.headers["if-none-match"] === "*" && objects.has(key)) {
        res.writeHead(412).end();
        return;
      }
      objects.set(key, Buffer.concat(chunks));
      res.setHeader("ETag", '"test"');
      res.end();
      return;
    }
    const value = objects.get(key);
    if (!value) {
      res.writeHead(404).end();
      return;
    }
    res.setHeader("Content-Length", value.length);
    res.end(req.method === "HEAD" ? undefined : value);
  });
  try {
    await mkdir(plugins);
    await cp(
      new URL("../../../../../plugins/releases/tau.sync-s3/0.1.2", import.meta.url),
      path.join(plugins, id),
      { recursive: true }
    );
    const prefs = new LocalPluginPreferences(plugins);
    await prefs.load();
    await prefs.set(id, true);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("测试服务器未启动");
    await writeFile(
      path.join(state.root, "setting.json"),
      JSON.stringify({
        sync: {
          active: "plugin",
          plugin: {
            id,
            configurations: {
              [id]: {
                endpoint: `http://127.0.0.1:${address.port}`,
                bucket: "bucket",
                region: "test",
                accessKeyId: "test-only",
                secretAccessKey: "test-only",
                urlStyle: "path",
                pathPrefix: "note",
              },
            },
          },
        },
        integration: {},
      })
    );
    const provider = createSyncProvider();
    if (!provider) throw new Error("插件未配置");
    try {
      expect(await provider.uploadFile("snapshot.db", new Uint8Array([1, 2, 3]))).toBe(true);
      expect(await provider.downloadFile("snapshot.db")).toEqual(new Uint8Array([1, 2, 3]));
      await expect(
        withPluginSyncMutation(plugins, id, async () => prefs.set(id, false))
      ).rejects.toThrow("同步任务");
      const metadata = {
        version: 1,
        parentVersion: 0,
        commitId: "cli-test",
        dataModelVersion: SYNC_MODEL_VERSION,
        databaseObject: "snapshot.db",
      };
      await publishSnapshot(provider, "head.json", { version: 0 }, metadata);
      expect(await readSnapshotHead(provider, "head.json")).toMatchObject(metadata);
    } finally {
      await provider.dispose?.();
    }
    expect(await hasPluginSyncLeases(plugins)).toBe(false);
    await withPluginSyncMutation(plugins, id, () => prefs.set(id, false));
    const disabled = createSyncProvider();
    try {
      await expect(disabled?.fileExists("snapshot.db")).rejects.toThrow("未启用");
    } finally {
      await disabled?.dispose?.();
    }
    expect(await hasPluginSyncLeases(plugins)).toBe(false);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(state.root, { recursive: true, force: true });
  }
});
