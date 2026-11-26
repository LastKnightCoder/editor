// @vitest-environment node
import { EventEmitter } from "node:events";
import { VideoCacheFailure } from "../../../../shared/video-cache-failure";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { must } from "../../test-support";

const state = vi.hoisted(() => ({
  dir: "",
  call: vi.fn(),
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  listeners: new Set<(event: unknown, data: unknown) => void>(),
  sender: null as unknown,
}));
vi.mock("electron", () => ({
  ipcMain: {
    handle: (name: string, handler: (...args: unknown[]) => unknown) =>
      state.handlers.set(name, handler),
  },
}));
vi.mock("@/commands/module-init", () => ({
  withModule: (_name: string, run: () => unknown) => run(),
}));
vi.mock("@/electron", () => ({
  invoke: async (name: string, ...args: unknown[]) => {
    const handler = state.handlers.get(name);
    if (!handler) throw new Error("missing handler " + name);
    return structuredClone(await handler({ sender: state.sender }, ...args));
  },
  on: (_name: string, listener: (event: unknown, data: unknown) => void) =>
    state.listeners.add(listener),
  off: (_name: string, listener: (event: unknown, data: unknown) => void) =>
    state.listeners.delete(listener),
}));
vi.mock("electron-log", () => ({ default: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("../../utils/PathUtil", () => ({ default: { getAppDir: () => state.dir } }));
vi.mock("../../utils/FfmpegService", () => ({ default: {} }));
vi.mock("../../utils/YtDlpService", () => ({
  default: {},
  createYtDlpDownloadFailure: (message: string) => new Error(message),
}));
vi.mock("../../services/plugin-video", () => ({ pluginVideoRelay: { call: state.call } }));

const cache = await import("../online-video-cache");

const target = { providerId: "test.video", ref: { id: "1" }, title: "视频" };
const bytes = new Uint8Array([1, 2, 3, 4]);

function respond(request: { kind: string }) {
  if (request.kind === "cacheKey") return Promise.resolve("video-1");
  if (request.kind === "playback")
    return Promise.resolve({
      kind: "file",
      stream: { url: "https://cdn.test/a.mp4", headers: { Referer: "https://site.test/" } },
    });
  throw new Error(`unexpected ${request.kind}`);
}

beforeEach(async () => {
  state.dir = await mkdtemp(join(tmpdir(), "tau-online-video-"));
  state.handlers.clear();
  state.listeners.clear();
  state.sender = Object.assign(new EventEmitter(), {
    id: 73,
    isDestroyed: () => false,
    send: (_name: string, value: unknown) => {
      for (const listener of state.listeners) listener({}, structuredClone(value));
    },
  });
  state.call.mockReset();
  state.call.mockImplementation(respond);
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await rm(state.dir, { recursive: true, force: true });
});

it("下载时携带插件给出的请求头，缓存命中后不再向插件取流", async () => {
  const fetcher = vi.fn(async () => new Response(bytes, { headers: { "content-length": "4" } }));
  vi.stubGlobal("fetch", fetcher);
  const progress = vi.fn();
  const first = await cache.ensureOnlineVideo(target, { onProgress: progress });
  expect(first).toMatchObject({ cached: false, fileSize: 4 });
  expect(new Uint8Array(await readFile(first.localPath))).toEqual(bytes);
  expect(fetcher.mock.calls[0]).toMatchObject([
    "https://cdn.test/a.mp4",
    { headers: { Referer: "https://site.test/" } },
  ]);
  expect(progress).toHaveBeenLastCalledWith(
    expect.objectContaining({ stage: "completed", code: "video.ready", message: "视频已就绪" })
  );
  expect(progress.mock.calls[0][0]).toMatchObject({
    code: "video.downloading",
    stage: "downloading",
    downloaded: 4,
    total: 4,
    percent: 100,
  });
  const index = JSON.parse(await readFile(join(state.dir, "online-video-cache.json"), "utf8"));
  expect(JSON.stringify(index)).not.toContain("Referer");

  state.call.mockClear();
  const second = await cache.ensureOnlineVideo(target);
  expect(second).toEqual({ ...first, cached: true });
  expect(state.call.mock.calls.map(([request]) => request.kind)).toEqual(["cacheKey"]);
  expect(await cache.getOnlineVideoCacheStatus(target)).toMatchObject({ cached: true });
});

it("同一视频的并发请求共用一次下载；只有全部调用方取消才中止", async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
    await gate;
    init?.signal?.throwIfAborted();
    return new Response(bytes);
  });
  vi.stubGlobal("fetch", fetcher);
  const left = new AbortController();
  const a = cache.ensureOnlineVideo(target, { signal: left.signal });
  const b = cache.ensureOnlineVideo(target);
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  left.abort();
  await expect(a).rejects.toMatchObject({ name: "AbortError" });
  release();
  await expect(b).resolves.toMatchObject({ cached: false, fileSize: 4 });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("唯一的调用方取消时中止下载，不留下缓存文件与索引", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) =>
          init?.signal?.addEventListener(
            "abort",
            () => reject(must(init.signal, "init.signal").reason),
            {
              once: true,
            }
          )
        )
    )
  );
  const controller = new AbortController();
  const pending = cache.ensureOnlineVideo(target, { signal: controller.signal });
  await vi.waitFor(() => expect(state.call).toHaveBeenCalledTimes(2));
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  await new Promise(resolve => setTimeout(resolve, 10));
  expect(await cache.getOnlineVideoCacheStatus(target)).toBeNull();
  expect(existsSync(join(state.dir, "online-video-cache"))).toBe(true);
});

it("HTTP 失败时报告状态码；初始化清除平台缓存退役前的目录", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("no", { status: 403 }))
  );
  await expect(cache.ensureOnlineVideo(target)).rejects.toThrow("HTTP 403");
  await mkdir(join(state.dir, "bilibili-cache"));
  await writeFile(join(state.dir, "youtube-cache-config.json"), "{}");
  await cache.init();
  await expect(stat(join(state.dir, "bilibili-cache"))).rejects.toThrow();
  await expect(stat(join(state.dir, "youtube-cache-config.json"))).rejects.toThrow();
});

it("已知缓存身份/HTTP失败经真实IPC结构化传输，未知provider仍拒绝且监听清理", async () => {
  await cache.init();
  const commands = await import("@/commands/online-video-cache");
  state.call.mockResolvedValue(null);
  await expect(commands.getOnlineVideoCacheStatus(target)).rejects.toMatchObject({
    code: "identity",
    message: "插件未返回缓存身份",
  });
  state.call.mockImplementation(respond);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 503 }))
  );
  let error: unknown;
  try {
    await commands.ensureOnlineVideo(target);
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(VideoCacheFailure);
  expect(error).toMatchObject({
    code: "http",
    message: "视频下载失败：HTTP 503",
    params: { status: 503 },
  });
  expect((error as Error).cause).toBeUndefined();
  expect(state.listeners.size).toBe(0);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(bytes, { headers: { "content-length": "4" } }))
  );
  const downloaded = await commands.ensureOnlineVideo(target);
  expect(downloaded.fileSize).toBe(4);
  expect(new Uint8Array(await readFile(downloaded.localPath))).toEqual(bytes);
  await expect(commands.getOnlineVideoCacheStatus(target)).resolves.toMatchObject({
    localPath: downloaded.localPath,
    fileSize: 4,
    cached: true,
  });
  const privateCause = new Error("private stderr with request credentials");
  state.call.mockRejectedValueOnce(new VideoCacheFailure("runtime", {}, { cause: privateCause }));
  try {
    await commands.getOnlineVideoCacheStatus(target);
  } catch (caught) {
    error = caught;
  }
  expect(error).toMatchObject({ code: "runtime" });
  expect((error as Error).cause).toBeUndefined();
  expect((error as Error).message).not.toContain(privateCause.message);
  const unknown = new Error("raw provider diagnostic");
  state.call.mockRejectedValue(unknown);
  await expect(commands.ensureOnlineVideo(target)).rejects.toBe(unknown);
  expect(state.listeners.size).toBe(0);
  expect((state.sender as EventEmitter).listenerCount("destroyed")).toBe(0);
});

it("重复请求返回已知失败后仍保留原任务，原owner可以取消且abort不包装", async () => {
  await cache.init();
  let sourceSignal!: AbortSignal;
  const fetcher = vi.fn(
    (_url: string, options: { signal: AbortSignal }) =>
      new Promise<Response>((_resolve, reject) => {
        sourceSignal = options.signal;
        sourceSignal.addEventListener("abort", () => reject(sourceSignal.reason), { once: true });
      })
  );
  vi.stubGlobal("fetch", fetcher);
  const run = state.handlers.get("online-video-cache:ensure");
  const cancel = state.handlers.get("online-video-cache:cancel");
  if (!run || !cancel) throw new Error("missing cache handlers");
  const first = Promise.resolve(run({ sender: state.sender }, "same-request", target));
  const aborted = expect(first).rejects.toHaveProperty("name", "AbortError");
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  const duplicate = structuredClone(await run({ sender: state.sender }, "same-request", target));
  expect(duplicate).toMatchObject({
    ok: false,
    failure: { code: "duplicate", message: "视频缓存请求已存在" },
  });
  expect(sourceSignal.aborted).toBe(false);
  cancel({ sender: state.sender }, "same-request");
  await aborted;
  expect(sourceSignal.aborted).toBe(true);
  expect((state.sender as EventEmitter).listenerCount("destroyed")).toBe(0);
});
