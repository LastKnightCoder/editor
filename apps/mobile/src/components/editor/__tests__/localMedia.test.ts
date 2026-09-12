import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockConvertFileSrc, mockAppDataDir, mockRemoteResourceToLocal, mockReadResourceBytes } =
  vi.hoisted(() => ({
    mockConvertFileSrc: vi.fn(async (path: string) => `asset://${path}`),
    mockAppDataDir: vi.fn(async () => "/app/data/"),
    mockRemoteResourceToLocal: vi.fn(
      async (url: string) => `/app/data/.editor/remote-resources/${encodeURIComponent(url)}`
    ),
    // 默认失败：走 asset protocol 回退（与旧行为一致）；blob 通道用例单独覆盖
    mockReadResourceBytes: vi.fn(async (_path: string): Promise<string> => {
      throw new Error("MOCK_UNAVAILABLE");
    }),
  }));

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: mockConvertFileSrc,
}));

vi.mock("@tauri-apps/api/path", () => ({
  appDataDir: mockAppDataDir,
}));

vi.mock("../../../services/tauri", () => ({
  remoteResourceToLocal: mockRemoteResourceToLocal,
  readResourceBytes: mockReadResourceBytes,
}));

import { isDirectMediaSource, resolveLocalMediaSource } from "../localMedia";

describe("localMedia", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("http(s) 资源应下载到本地后转换为 asset URL", async () => {
    await expect(resolveLocalMediaSource("https://example.com/a.png")).resolves.toBe(
      "asset:///app/data/.editor/remote-resources/https%3A%2F%2Fexample.com%2Fa.png"
    );
    await expect(resolveLocalMediaSource("http://example.com/a.mp3")).resolves.toBe(
      "asset:///app/data/.editor/remote-resources/http%3A%2F%2Fexample.com%2Fa.mp3"
    );
    expect(mockRemoteResourceToLocal).toHaveBeenNthCalledWith(1, "https://example.com/a.png");
    expect(mockRemoteResourceToLocal).toHaveBeenNthCalledWith(2, "http://example.com/a.mp3");
    expect(mockConvertFileSrc).toHaveBeenNthCalledWith(
      1,
      "/app/data/.editor/remote-resources/https%3A%2F%2Fexample.com%2Fa.png"
    );
    expect(mockConvertFileSrc).toHaveBeenNthCalledWith(
      2,
      "/app/data/.editor/remote-resources/http%3A%2F%2Fexample.com%2Fa.mp3"
    );
  });

  it("http(s) 下载失败时应回退原 URL", async () => {
    mockRemoteResourceToLocal.mockRejectedValueOnce(
      new Error("REMOTE_RESOURCE_DOWNLOAD_FAILED:timeout")
    );
    await expect(resolveLocalMediaSource("https://example.com/fail.png")).resolves.toBe(
      "https://example.com/fail.png"
    );
    expect(mockConvertFileSrc).not.toHaveBeenCalled();
  });

  it("协议相对 URL 应直接返回，不走 convertFileSrc", async () => {
    await expect(resolveLocalMediaSource("//cdn.example.com/a.mp4")).resolves.toBe(
      "//cdn.example.com/a.mp4"
    );
    expect(mockConvertFileSrc).not.toHaveBeenCalled();
    expect(mockRemoteResourceToLocal).not.toHaveBeenCalled();
  });

  it("已知直链协议应直接返回", async () => {
    const sources = [
      "file:///tmp/a.png",
      "tauri://localhost/resource",
      "asset://localhost/resource",
      "data:image/png;base64,abc",
      "blob:https://example.com/abc",
      "http://asset.localhost/resource",
    ];

    for (const source of sources) {
      await expect(resolveLocalMediaSource(source)).resolves.toBe(source);
    }

    expect(mockConvertFileSrc).not.toHaveBeenCalled();
    expect(mockRemoteResourceToLocal).not.toHaveBeenCalled();
  });

  it("其他自定义 scheme 应直接返回", async () => {
    await expect(resolveLocalMediaSource("content://media/external/video/1")).resolves.toBe(
      "content://media/external/video/1"
    );
    expect(mockConvertFileSrc).not.toHaveBeenCalled();
    expect(mockRemoteResourceToLocal).not.toHaveBeenCalled();
  });

  it("~ 路径应展开 appDataDir 后再转换", async () => {
    await expect(resolveLocalMediaSource("~/.editor/resources/a.png")).resolves.toBe(
      "asset:///app/data/.editor/resources/a.png"
    );
    expect(mockConvertFileSrc).toHaveBeenCalledWith("/app/data/.editor/resources/a.png");
  });

  it("读文件命令可用时应返回 blob URL（Android 主通道）", async () => {
    const mockCreateObjectUrl = vi.fn((_blob: Blob) => "blob:mock-object-url");
    Object.defineProperty(URL, "createObjectURL", {
      value: mockCreateObjectUrl,
      configurable: true,
    });
    // 命令返回 base64 字符串（"tauri" → dGF1cmk=）
    mockReadResourceBytes.mockResolvedValueOnce(btoa("tauri"));
    try {
      await expect(resolveLocalMediaSource("~/.editor/resources/blob-case.webp")).resolves.toBe(
        "blob:mock-object-url"
      );
      expect(mockReadResourceBytes).toHaveBeenCalledWith(
        "/app/data/.editor/resources/blob-case.webp"
      );
      // base64 解码后的字节以正确的 MIME 构造 Blob
      const blob = mockCreateObjectUrl.mock.calls[0][0] as Blob;
      expect(blob.type).toBe("image/webp");
      expect(blob.size).toBe(5);
    } finally {
      delete (URL as { createObjectURL?: unknown }).createObjectURL;
    }
  });

  it("绝对路径与裸相对路径应走 convertFileSrc", async () => {
    await expect(resolveLocalMediaSource("/storage/emulated/0/a.jpg")).resolves.toBe(
      "asset:///storage/emulated/0/a.jpg"
    );
    await expect(resolveLocalMediaSource("image/a.png")).resolves.toBe("asset://image/a.png");
    expect(mockConvertFileSrc).toHaveBeenNthCalledWith(1, "/storage/emulated/0/a.jpg");
    expect(mockConvertFileSrc).toHaveBeenNthCalledWith(2, "image/a.png");
  });

  it("Windows 绝对路径不应误判为自定义 scheme", async () => {
    await expect(resolveLocalMediaSource("C:\\Users\\demo\\a.png")).resolves.toBe(
      "asset://C:\\Users\\demo\\a.png"
    );
    expect(mockConvertFileSrc).toHaveBeenCalledWith("C:\\Users\\demo\\a.png");
  });

  it("isDirectMediaSource 应识别直链协议、协议相对 URL 和自定义 scheme", () => {
    expect(isDirectMediaSource("https://example.com/a.png")).toBe(true);
    expect(isDirectMediaSource("//cdn.example.com/a.png")).toBe(true);
    expect(isDirectMediaSource("content://media/1")).toBe(true);
    expect(isDirectMediaSource("/storage/emulated/0/a.jpg")).toBe(false);
    expect(isDirectMediaSource("image/a.png")).toBe(false);
    expect(isDirectMediaSource("C:\\Users\\demo\\a.png")).toBe(false);
  });
});
