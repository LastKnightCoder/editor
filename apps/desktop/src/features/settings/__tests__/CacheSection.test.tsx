import { desktopLocaleSource } from "@/app/i18n/runtime";
import { cacheTranslator } from "../cache/i18n";
import useSettingStore from "@/stores/useSettingStore";
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

it("默认展示全部来源的视频缓存，并渲染开关分组", async () => {
  await render();
  expect(text()).toContain("v.mp4");
  expect(text()).toContain("YT 演讲");
  expect(text()).toContain("B站课程");
  expect(container.querySelectorAll('input[aria-label^="选择「"]')).toHaveLength(3);
  expect(text()).toContain("自动缓存");
  expect(text()).toContain("解析时翻译为中文");
});

it("切换来源与媒体类型筛选列表，图片隐藏来源筛选", async () => {
  await render();
  act(() => radio("来源筛选", "在线视频").click());
  expect(text()).toContain("YT 演讲");
  expect(text()).toContain("Bilibili");
  expect(text()).not.toContain("v.mp4");
  expect(container.querySelectorAll('input[aria-label^="选择「"]')).toHaveLength(2);

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
  expect(checkbox("选择「YT 演讲」").checked).toBe(true);
  expect(checkbox("选择「B站课程」").checked).toBe(true);
  await act(async () => button("批量删除").click());
  await flush();
  expect(cmd.deleteOnlineVideoCache).toHaveBeenCalledWith("o1");
  expect(cmd.deleteOnlineVideoCache).toHaveBeenCalledWith("o2");
  expect(cmd.deleteRemoteVideoCacheEntry).not.toHaveBeenCalled();
  expect(text()).not.toContain("已选");
});

it("切换语言保留来源筛选、勾选与播放器位置，不重新读取、删除或提交设置", async () => {
  const original = desktopLocaleSource.getSnapshot();
  const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  const load = vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  try {
    await act(async () => desktopLocaleSource.setLocale("zh-CN"));
    await render();
    act(() =>
      radio(cacheTranslator.t("filter.source"), cacheTranslator.t("source.online")).click()
    );
    const selected = checkbox(cacheTranslator.t("row.select", { name: "YT 演讲" }));
    act(() => selected.click());
    const source = container.querySelector<HTMLInputElement>('input[value="online"]');
    const preview = [...container.querySelectorAll("button")].find(
      node =>
        node.getAttribute("aria-label") === cacheTranslator.t("row.preview", { name: "YT 演讲" })
    );
    if (!preview || !source) throw new Error("缓存交互未挂载");
    await act(async () => preview.click());
    const video = document.querySelector("video");
    if (!video) throw new Error("缓存播放器未挂载");
    video.currentTime = 17;
    video.volume = 0.37;
    video.playbackRate = 1.5;
    const src = video.getAttribute("src"),
      setting = useSettingStore.getState().setting;
    const calls = () =>
      Object.fromEntries(Object.entries(cmd).map(([key, fn]) => [key, fn.mock.calls.length]));
    const before = calls(),
      playback = {
        pause: pause.mock.calls.length,
        load: load.mock.calls.length,
        play: play.mock.calls.length,
      };
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect(checkbox(cacheTranslator.t("row.select", { name: "YT 演讲" }))).toBe(selected);
      expect(selected.checked).toBe(true);
      expect(container.querySelector('input[value="online"]')).toBe(source);
      expect(source.checked).toBe(true);
      expect(document.querySelector("video")).toBe(video);
      expect(video.getAttribute("src")).toBe(src);
      expect(video.currentTime).toBe(17);
      expect(video.volume).toBe(0.37);
      expect(video.playbackRate).toBe(1.5);
      expect(calls()).toEqual(before);
      expect({
        pause: pause.mock.calls.length,
        load: load.mock.calls.length,
        play: play.mock.calls.length,
      }).toEqual(playback);
      expect(useSettingStore.getState().setting).toBe(setting);
    }
  } finally {
    await act(async () => desktopLocaleSource.setLocale(original));
    pause.mockRestore();
    load.mockRestore();
    play.mockRestore();
  }
});
