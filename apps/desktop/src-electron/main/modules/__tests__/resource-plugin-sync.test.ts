// @vitest-environment node
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  uploadChunkedFile,
  RESOURCE_OBJECT_PREFIX,
  resourceManifestObject,
} from "@tau/db-schema/sync-protocol";
import { chunkDigest } from "../../services/chunked-sync";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  root: "",
  handlers: new Map<string, (...args: unknown[]) => Promise<unknown>>(),
  begin: vi.fn(),
  call: vi.fn(),
  end: vi.fn(async () => undefined),
}));
vi.mock("electron", () => ({
  ipcMain: {
    handle: (name: string, fn: (...args: unknown[]) => Promise<unknown>) =>
      mock.handlers.set(name, fn),
  },
}));
vi.mock("../../utils/PathUtil", () => ({ default: { getAppDir: () => mock.root } }));
vi.mock("../database", () => ({ default: { getCurrentDatabase: () => null } }));
vi.mock("../../services/plugin-sync", () => ({
  pluginSyncSessions: { begin: mock.begin, call: mock.call, end: mock.end },
}));
const options = {
  provider: "plugin",
  pluginId: "test.sync",
  config: { endpoint: "test", secret: "test-secret" },
};
beforeEach(async () => {
  vi.resetModules();
  mock.handlers.clear();
  mock.begin.mockReset().mockResolvedValue("session");
  mock.call.mockReset();
  mock.end.mockClear();
  mock.root = await mkdtemp(path.join(os.tmpdir(), "tau-resource-plugin-"));
  await mkdir(path.join(mock.root, "resources"));
  const { default: module } = await import("../resource-sync");
  await module.init({ sendNotification: vi.fn() } as never);
});
afterEach(async () => {
  await rm(mock.root, { recursive: true, force: true });
});
const invoke = (name: string, ...args: unknown[]) => {
  const fn = mock.handlers.get(name);
  if (!fn) throw new Error("缺少处理器");
  return fn({ sender: { id: 42 } }, ...args);
};
it("资源计划复用插件的列表/上传/下载，任务结束释放，状态文件不保存配置密钥", async () => {
  await writeFile(path.join(mock.root, "resources/local.png"), new Uint8Array([1]));
  const remote = new Map<string, Uint8Array>();
  const store = {
    uploadFile: async (name: string, bytes: Uint8Array) => {
      remote.set(name, bytes.slice());
      return true;
    },
    downloadFile: async (name: string) => {
      const bytes = remote.get(name);
      if (!bytes) throw new Error("缺少对象");
      return bytes;
    },
  };
  const manifest = await resourceManifestObject("remote.png", chunkDigest);
  await uploadChunkedFile(
    store,
    manifest,
    "remote.png",
    { size: 1, read: async () => new Uint8Array([2]) },
    chunkDigest
  );
  mock.call.mockImplementation(async (_owner, _session, method, args: unknown[]) => {
    if (method === "listFiles")
      return [...remote]
        .filter(([name]) => name.startsWith(RESOURCE_OBJECT_PREFIX))
        .map(([name, bytes]) => ({ name: name.split("/").at(-1), path: name, size: bytes.length }));
    if (method === "downloadFile") return store.downloadFile(args[0] as string);
    if (method === "uploadFile") return store.uploadFile(args[0] as string, args[1] as Uint8Array);
  });
  expect(await invoke("resource-sync:start", options)).toMatchObject({ ok: true });
  expect(await readFile(path.join(mock.root, "resources/remote.png"))).toEqual(Buffer.from([2]));
  expect(remote.has(await resourceManifestObject("local.png", chunkDigest))).toBe(true);
  expect(mock.call).toHaveBeenCalledWith(42, "session", "listFiles", [RESOURCE_OBJECT_PREFIX]);
  expect(mock.end).toHaveBeenCalledWith(42, "session");
  const jsonFiles: string[] = [];
  const walk = async (root: string) => {
    for (const entry of await readdir(root, { withFileTypes: true })) {
      const file = path.join(root, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (entry.name.endsWith(".json")) jsonFiles.push(file);
    }
  };
  await walk(mock.root);
  expect(jsonFiles.length).toBeGreaterThan(0);
  for (const file of jsonFiles) expect(await readFile(file, "utf8")).not.toContain("test-secret");
});
it("刷新期间不允许另一同步覆盖计划，刷新完成释放会话", async () => {
  let finish!: () => void;
  mock.call.mockImplementation(
    async () =>
      new Promise(resolve => {
        finish = () => resolve([]);
      })
  );
  const refreshing = invoke("resource-sync:refresh", options);
  await vi.waitFor(() => expect(mock.call).toHaveBeenCalled());
  expect(await invoke("resource-sync:start", options)).toMatchObject({ ok: false });
  finish();
  await refreshing;
  expect(mock.end).toHaveBeenCalledWith(42, "session");
});

it("渲染进程断开后取消资源任务，不把失效的插件操作反复重试", async () => {
  await writeFile(path.join(mock.root, "resources/local.png"), new Uint8Array([1]));
  mock.call.mockImplementation(async (_owner, _session, method) => {
    if (method === "listFiles") return [];
    throw new DOMException("同步渲染进程已断开", "AbortError");
  });
  await invoke("resource-sync:start", options);
  expect(await invoke("resource-sync:get-progress")).toMatchObject({ status: "cancelled" });
  expect(mock.call.mock.calls.filter(call => call[2] !== "listFiles")).toHaveLength(1);
  expect(mock.call.mock.calls.filter(call => call[2] === "uploadFile")).toHaveLength(0);
  expect(mock.end).toHaveBeenCalledWith(42, "session");
});

it("同时有多个资源时实际在途文件不超过宿主并发预算", async () => {
  for (let index = 0; index < 8; index++)
    await writeFile(path.join(mock.root, `resources/${index}.bin`), new Uint8Array([index]));
  let running = 0,
    peak = 0;
  mock.call.mockImplementation(async (_owner, _session, method, args: unknown[]) => {
    if (method === "listFiles") return [];
    if (method === "fileExists") return false;
    if (method === "uploadFile" && String(args[0]).includes("/chunks/")) {
      running++;
      peak = Math.max(peak, running);
      await new Promise(resolve => setTimeout(resolve, 20));
      running--;
    }
    return true;
  });
  expect(
    await invoke("resource-sync:start", {
      ...options,
      rateLimit: { maxConcurrent: 9, requestsPerSecond: 0 },
    })
  ).toMatchObject({ ok: true });
  expect(peak).toBeGreaterThan(0);
  expect(peak).toBeLessThanOrEqual(3);
  expect(running).toBe(0);
});
