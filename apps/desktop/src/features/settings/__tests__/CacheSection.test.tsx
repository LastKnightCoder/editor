import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CacheSection } from "../sections/CacheSection";

const cmd = vi.hoisted(() => ({
  listRemoteVideoCache: vi.fn(),
  deleteRemoteVideoCacheEntry: vi.fn(),
  clearRemoteVideoCache: vi.fn(),
  listOnlineVideoCache: vi.fn(),
  deleteOnlineVideoCache: vi.fn(),
  clearOnlineVideoCache: vi.fn(),
  listRemoteAudioCache: vi.fn(),
  deleteRemoteAudioCacheEntry: vi.fn(),
  clearRemoteAudioCache: vi.fn(),
  listRemoteImageCache: vi.fn(),
  deleteRemoteImageCacheEntry: vi.fn(),
  clearRemoteImageCache: vi.fn(),
}));

vi.mock("@/commands", () => ({ convertFileSrc: async (p: string) => `file://${p}` }));
vi.mock("@/commands/remote-video-cache", () => cmd);
vi.mock("@/commands/online-video-cache", () => cmd);
vi.mock("@/commands/plugin-video", () => ({
  getVideoProviders: () => ({ ready: true, providers: [{ id: "bilibili", name: "Bilibili" }] }),
}));
vi.mock("@/commands/remote-audio-cache", () => cmd);
vi.mock("@/commands/remote-image-cache", () => cmd);

const MB = 1024 * 1024;
const entry = (extra: Record<string, unknown>) => ({
  localPath: "/cache/x",
  createdAt: "",
  lastAccessed: "",
  ...extra,
});

let container: HTMLDivElement;
let root: Root;
const flush = () => act(async () => {});
const render = async () => {
  act(() => root.render(<CacheSection />));
  await flush();
};
const text = () => container.textContent ?? "";
const button = (label: string) =>
  [...container.querySelectorAll("button")].find(b => b.textContent?.includes(label))!;
const radio = (group: string, label: string) =>
  [
    ...container.querySelectorAll<HTMLLabelElement>(
      `[role="radiogroup"][aria-label="${group}"] label`
    ),
  ]
    .find(l => l.textContent?.startsWith(label))!
    .querySelector("input")!;
const checkbox = (label: string) =>
  container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;

beforeEach(() => {
  Object.values(cmd).forEach(fn => fn.mockReset());
  cmd.listRemoteVideoCache.mockResolvedValue([
    entry({ id: "r1", url: "https://a.com/v.mp4", fileName: "v.mp4", fileSize: 2 * MB }),
  ]);
  cmd.listOnlineVideoCache.mockResolvedValue([
    entry({ id: "o1", providerId: "youtube", title: "YT 演讲", fileSize: 3 * MB }),
    entry({ id: "o2", providerId: "bilibili", title: "B站课程", fileSize: 5 * MB }),
  ]);
  cmd.listRemoteAudioCache.mockResolvedValue([
    entry({ id: "a1", url: "https://a.com/p.mp3", fileName: "podcast.mp3", fileSize: MB }),
  ]);
  cmd.listRemoteImageCache.mockResolvedValue([]);
  cmd.deleteOnlineVideoCache.mockResolvedValue(true);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
});

it("默认展示全部来源的视频缓存与总占用，并渲染开关分组", async () => {
  await render();
  expect(text()).toContain("v.mp4");
  expect(text()).toContain("YT 演讲");
  expect(text()).toContain("B站课程");
  expect(text()).toContain("共 3 项");
  expect(text()).toContain("10.0 MB");
  expect(text()).toContain("自动缓存");
  expect(text()).toContain("解析时翻译为中文");
});

it("切换来源与媒体类型筛选列表，图片隐藏来源筛选", async () => {
  await render();
  act(() => radio("来源筛选", "在线视频").click());
  expect(text()).toContain("YT 演讲");
  expect(text()).toContain("Bilibili");
  expect(text()).not.toContain("v.mp4");
  expect(text()).toContain("共 2 项");

  act(() => radio("媒体类型", "音频").click());
  expect(text()).not.toContain("YT 演讲");
  expect(text()).toContain("暂无在线视频音频缓存");
  act(() => radio("来源筛选", "全部").click());
  expect(text()).toContain("podcast.mp3");

  act(() => radio("媒体类型", "图片").click());
  expect(container.querySelector('[aria-label="来源筛选"]')).toBeNull();
  expect(text()).toContain("暂无图片缓存");
});

it("多选后批量删除逐条调用对应删除命令", async () => {
  await render();
  act(() => checkbox("选择「YT 演讲」").click());
  act(() => checkbox("选择「B站课程」").click());
  expect(text()).toContain("已选 2 项");
  await act(async () => button("批量删除").click());
  await flush();
  expect(cmd.deleteOnlineVideoCache).toHaveBeenCalledWith("o1");
  expect(cmd.deleteOnlineVideoCache).toHaveBeenCalledWith("o2");
  expect(cmd.deleteRemoteVideoCacheEntry).not.toHaveBeenCalled();
  expect(text()).not.toContain("已选");
});
