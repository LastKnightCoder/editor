// @vitest-environment node
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ dir: "", call: vi.fn() }));
vi.mock("electron", () => ({ ipcMain: { handle: vi.fn() } }));
vi.mock("electron-log", () => ({ default: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("../../utils/PathUtil", () => ({ default: { getAppDir: () => state.dir } }));
vi.mock("../../utils/FfmpegService", () => ({ default: {} }));
vi.mock("../../utils/YtDlpService", () => ({
  default: {},
  normalizeDownloadErrorMessage: (message: string) => message,
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
  expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({ stage: "completed" }));
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
          init?.signal?.addEventListener("abort", () => reject(init.signal!.reason), {
            once: true,
          })
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
