// @vitest-environment node
import { Readable } from "node:stream";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  root: "",
  handlers: new Map<string, (...args: unknown[]) => Promise<unknown>>(),
  fetch: vi.fn(),
}));
vi.mock("electron", () => ({
  ipcMain: {
    handle: (name: string, handler: (...args: unknown[]) => Promise<unknown>) =>
      state.handlers.set(name, handler),
  },
}));
vi.mock("node-fetch", () => ({ default: state.fetch }));
vi.mock("../../utils/PathUtil", () => ({
  default: { getAppDir: () => state.root, getHomeDir: () => state.root },
}));
import cache from "../remote-video-cache";
afterEach(async () => {
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
    send: (_name: string, value: Record<string, unknown>) => packets.push(structuredClone(value)),
  };
  const download = state.handlers.get("remote-video-cache:download-with-progress");
  if (!download) throw new Error("missing download handler");
  const result = (await download(
    { sender },
    { url: "https://raw.example/电影.mp4", fileName: "用户原文件名.mp4" }
  )) as { localPath: string; fileSize: number; requestId: number };
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
