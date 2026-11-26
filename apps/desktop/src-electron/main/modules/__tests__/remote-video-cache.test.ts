import { RemoteVideoFailure } from "../../../../shared/remote-video-failure";
// @vitest-environment node
import { Readable } from "node:stream";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  root: "",
  handlers: new Map<string, (...args: unknown[]) => Promise<unknown>>(),
  fetch: vi.fn(),
  sender: null as unknown,
  listeners: new Set<(event: unknown, data: unknown) => void>(),
}));
vi.mock("electron", () => ({
  ipcMain: {
    handle: (name: string, handler: (...args: unknown[]) => Promise<unknown>) =>
      state.handlers.set(name, handler),
  },
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
vi.mock("node-fetch", () => ({ default: state.fetch }));
vi.mock("../../utils/PathUtil", () => ({
  default: { getAppDir: () => state.root, getHomeDir: () => state.root },
}));
import cache from "../remote-video-cache";
beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }));
afterEach(async () => {
  await vi.advanceTimersByTimeAsync(100);
  vi.useRealTimers();
  state.listeners.clear();
  vi.clearAllMocks();
  if (state.root) await rm(state.root, { recursive: true, force: true });
  state.handlers.clear();
});
it("实际下载时点携带语义和原message，缓存与用户文件名不受显示协议影响", async () => {
  state.root = await mkdtemp(path.join(os.tmpdir(), "tau-remote-progress-"));
  state.fetch.mockResolvedValue({
    ok: true,
    headers: { get: () => "4" },
    body: Readable.from([Buffer.from([1, 2, 3, 4])]),
  });
  await cache.init();
  const packets: Array<Record<string, unknown>> = [];
  const sender = {
    isDestroyed: () => false,
    send: (_name: string, value: Record<string, unknown>) => {
      packets.push(structuredClone(value));
      for (const listener of state.listeners) listener({}, structuredClone(value));
    },
  };
  state.sender = sender;
  const { downloadRemoteVideoWithProgress } = await import("@/commands/remote-video-cache");
  const received = vi.fn();
  const result = await downloadRemoteVideoWithProgress(
    { url: "https://raw.example/电影.mp4", fileName: "用户原文件名.mp4" },
    received
  );
  expect(received).toHaveBeenCalledTimes(packets.length);
  expect(packets.map(packet => packet.stage)).toEqual(["downloading", "downloading", "completed"]);
  expect(packets[0]).toMatchObject({
    requestId: result.requestId,
    message: "Starting video download...",
    code: "video.remote.start",
    downloaded: 0,
    total: 0,
  });
  expect(packets[1]).toMatchObject({
    requestId: result.requestId,
    message: "Downloading video... 100.0%",
    code: "video.remote.downloading",
    params: { percent: 100 },
    progress: 100,
    downloaded: 4,
    total: 4,
  });
  expect(packets[2]).toMatchObject({
    requestId: result.requestId,
    code: "video.remote.completed",
    params: { fileSize: 4 },
    downloaded: 4,
    total: 4,
  });
  expect([...(await readFile(result.localPath))]).toEqual([1, 2, 3, 4]);
  const index = JSON.parse(
    await readFile(path.join(state.root, "remote-video-cache.json"), "utf8")
  );
  expect(Object.values(index.entries)).toEqual([
    expect.objectContaining({ fileName: "用户原文件名.mp4", url: "https://raw.example/电影.mp4" }),
  ]);
});

it("已知HTTP与缺参失败经真实IPC保留code和原message，progress有独立HTTP事实", async () => {
  state.root = await mkdtemp(path.join(os.tmpdir(), "tau-remote-failure-"));
  state.fetch.mockResolvedValue({ ok: false, status: 503 });
  const packets: Array<Record<string, unknown>> = [];
  state.sender = {
    isDestroyed: () => false,
    send: (_name: string, value: Record<string, unknown>) => {
      packets.push(structuredClone(value));
      for (const listener of state.listeners) listener({}, structuredClone(value));
    },
  };
  await cache.init();
  const commands = await import("@/commands/remote-video-cache");
  await expect(
    commands.downloadRemoteVideoWithProgress({ url: "https://raw.example/error.mp4" }, vi.fn())
  ).rejects.toMatchObject({
    code: "http",
    message: "Download failed: HTTP 503",
    params: { status: 503 },
  });
  expect(packets.at(-1)).toMatchObject({
    stage: "error",
    code: "video.remote.error.http",
    params: { status: 503 },
    message: "Download failed: Download failed: HTTP 503",
  });
  await expect(
    commands.addRemoteVideoCacheEntry({ url: "", localPath: "" })
  ).rejects.toBeInstanceOf(RemoteVideoFailure);
  await expect(
    commands.addRemoteVideoCacheEntry({ url: "", localPath: "" })
  ).rejects.toHaveProperty("message", "url and localPath are required");
  await vi.advanceTimersByTimeAsync(100);
  expect(state.listeners.size).toBe(0);
});
it("未知网络失败和Abort仍走原拒绝，不创建已知DTO或重试", async () => {
  state.root = await mkdtemp(path.join(os.tmpdir(), "tau-remote-unknown-"));
  state.sender = { isDestroyed: () => false, send: () => undefined };
  await cache.init();
  const commands = await import("@/commands/remote-video-cache");
  for (const error of [
    new Error("raw provider diagnostic"),
    new DOMException("cancelled", "AbortError"),
  ]) {
    state.fetch.mockRejectedValueOnce(error);
    await expect(
      commands.downloadRemoteVideoWithProgress({ url: "https://raw.example/unknown.mp4" })
    ).rejects.toBe(error);
  }
  expect(state.fetch).toHaveBeenCalledTimes(2);
});
