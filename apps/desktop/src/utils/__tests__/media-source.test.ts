import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  remoteResourceToLocal: vi.fn(),
  getCachedRemoteResource: vi.fn(),
  addRemoteImageCacheEntry: vi.fn(),
  addRemoteVideoCacheEntry: vi.fn(),
  addRemoteAudioCacheEntry: vi.fn(),
  resolveLocalMediaPath: vi.fn(async (value: string) => value),
  toLocalMediaPreviewUrl: vi.fn(async (path: string) => ({
    url: `preview:${path}`,
    method: "app-protocol" as const,
  })),
}));

vi.mock("@/commands", () => ({ getHomeDir: async () => "/home/me" }));
vi.mock("@/utils", () => ({ remoteResourceToLocal: mocks.remoteResourceToLocal }));
vi.mock("@/utils/resouce", () => ({ getCachedRemoteResource: mocks.getCachedRemoteResource }));
vi.mock("@/commands/remote-image-cache", () => ({
  addRemoteImageCacheEntry: mocks.addRemoteImageCacheEntry,
}));
vi.mock("@/commands/remote-video-cache", () => ({
  addRemoteVideoCacheEntry: mocks.addRemoteVideoCacheEntry,
}));
vi.mock("@/commands/remote-audio-cache", () => ({
  addRemoteAudioCacheEntry: mocks.addRemoteAudioCacheEntry,
}));
vi.mock("@/utils/localMediaPath", () => ({
  isDirectMediaUrl: (value: string) => value.startsWith("data:"),
  resolveLocalMediaPath: mocks.resolveLocalMediaPath,
  toLocalMediaPreviewUrl: mocks.toLocalMediaPreviewUrl,
}));

const { resolveMediaSource } = await import("../mediaSource");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.remoteResourceToLocal.mockImplementation(async (url: string) => `/cache/${url.slice(-5)}`);
  mocks.getCachedRemoteResource.mockResolvedValue(null);
});

it("空地址不解析，直接地址原样返回", async () => {
  expect(await resolveMediaSource("", { kind: "image", autoCacheRemote: true })).toBeUndefined();
  expect(
    await resolveMediaSource("data:image/png;base64,AA", { kind: "image", autoCacheRemote: true })
  ).toEqual({ url: "data:image/png;base64,AA", method: "direct" });
});

it("本地路径展开 ~ 后转预览地址", async () => {
  expect(await resolveMediaSource("~/a.png", { kind: "image", autoCacheRemote: false })).toEqual({
    url: "preview:/home/me/a.png",
    method: "app-protocol",
    localPath: "/home/me/a.png",
  });
});

it("协作资源只经作用域解析，失败时抛出", async () => {
  const resolve = vi.fn(async () => "/shared/a.png");
  const resource = "tau-collab-asset:abc";
  const source = await resolveMediaSource(resource, {
    kind: "video",
    autoCacheRemote: true,
    resolveCollaborationResource: resolve,
  });
  expect(resolve).toHaveBeenCalledWith(resource);
  expect(source?.url).toBe("preview:/shared/a.png");
  expect(mocks.resolveLocalMediaPath).not.toHaveBeenCalled();
  await expect(
    resolveMediaSource(resource, {
      kind: "image",
      autoCacheRemote: true,
      resolveCollaborationResource: async () => {
        throw new Error("未共享");
      },
    })
  ).rejects.toThrow("未共享");
});

it("远程图片遵守缓存设置，下载失败回退原地址并标记", async () => {
  const url = "https://example.com/a.png";
  expect(await resolveMediaSource(url, { kind: "image", autoCacheRemote: false })).toEqual({
    url,
    method: "remote",
  });
  expect(mocks.remoteResourceToLocal).not.toHaveBeenCalled();

  const cached = await resolveMediaSource(url, {
    kind: "image",
    autoCacheRemote: true,
    title: "封面",
  });
  expect(cached?.url).toBe("preview:/cache/a.png");
  expect(mocks.addRemoteImageCacheEntry).toHaveBeenCalledWith({
    url,
    localPath: "/cache/a.png",
    title: "封面",
  });

  mocks.remoteResourceToLocal.mockRejectedValueOnce(new Error("离线"));
  expect(await resolveMediaSource(url, { kind: "image", autoCacheRemote: true })).toEqual({
    url,
    method: "remote",
    failed: true,
  });
});

it("远程视频始终缓存，只登记像视频的地址", async () => {
  await resolveMediaSource("https://example.com/v.mp4", { kind: "video", autoCacheRemote: true });
  expect(mocks.addRemoteVideoCacheEntry).toHaveBeenCalledWith(
    expect.objectContaining({ url: "https://example.com/v.mp4", localPath: "/cache/v.mp4" })
  );
  mocks.addRemoteVideoCacheEntry.mockClear();
  const page = await resolveMediaSource("https://example.com/watch", {
    kind: "video",
    autoCacheRemote: true,
  });
  expect(page?.url).toBe("preview:/cache/watch");
  expect(mocks.addRemoteVideoCacheEntry).not.toHaveBeenCalled();
});

it("远程音频命中缓存走本地，未命中先播远程、后台缓存", async () => {
  const url = "https://example.com/a.mp3";
  mocks.getCachedRemoteResource.mockResolvedValueOnce("/cache/hit.mp3");
  expect(await resolveMediaSource(url, { kind: "audio", autoCacheRemote: true })).toMatchObject({
    url: "preview:/cache/hit.mp3",
    localPath: "/cache/hit.mp3",
  });

  const streaming = await resolveMediaSource(url, { kind: "audio", autoCacheRemote: true });
  expect(streaming).toMatchObject({ url, method: "remote" });
  expect(await streaming?.pendingLocalPath).toBe("/cache/a.mp3");
  expect(mocks.addRemoteAudioCacheEntry).toHaveBeenCalledWith({ url, localPath: "/cache/a.mp3" });

  mocks.remoteResourceToLocal.mockRejectedValueOnce(new Error("离线"));
  const failed = await resolveMediaSource(url, { kind: "audio", autoCacheRemote: true });
  expect(await failed?.pendingLocalPath).toBeUndefined();
});
