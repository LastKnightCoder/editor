import { describe, expect, it, vi } from "vitest";
import type { EpubChapter } from "@/types";
import { processEpubAssets } from "../epub-export/assets";

const buildChapter = (xhtml: string): EpubChapter => ({
  id: "chapter-1",
  title: "章节 1",
  xhtml,
});

describe("epub assets", () => {
  it("支持 http 图片资源", async () => {
    const result = await processEpubAssets(
      {
        chapters: [buildChapter('<p><img src="https://a.com/a.png" /></p>')],
      },
      {
        resolveLocalMediaPath: vi
          .fn()
          .mockImplementation(async (value: string) => value),
        remoteResourceToLocal: vi
          .fn()
          .mockResolvedValue("/tmp/http-image-a.png"),
        readBinaryFile: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4])),
      },
    );

    expect(result.assets).toHaveLength(1);
    expect(result.assets[0].mimeType).toBe("image/png");
    expect(result.chapters[0].xhtml).toContain("../assets/image-1.png");
  });

  it("支持本地路径图片资源", async () => {
    const result = await processEpubAssets(
      {
        chapters: [buildChapter('<p><img src="~/images/a.jpg" /></p>')],
      },
      {
        resolveLocalMediaPath: vi
          .fn()
          .mockResolvedValue("/Users/test/images/a.jpg"),
        remoteResourceToLocal: vi.fn(),
        readBinaryFile: vi.fn().mockResolvedValue(new Uint8Array([7, 8, 9])),
      },
    );

    expect(result.assets).toHaveLength(1);
    expect(result.assets[0].mimeType).toBe("image/jpeg");
    expect(result.chapters[0].xhtml).toContain("../assets/image-1.jpg");
  });

  it("支持 data 图片并将音视频转占位链接", async () => {
    const dataUri =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAoMBgA9n2ioAAAAASUVORK5CYII=";
    const result = await processEpubAssets(
      {
        chapters: [
          buildChapter(
            `<p><img src="${dataUri}" /></p><audio src="https://a.com/audio.mp3"></audio>`,
          ),
        ],
      },
      {
        resolveLocalMediaPath: vi
          .fn()
          .mockImplementation(async (value: string) => value),
        remoteResourceToLocal: vi.fn(),
        readBinaryFile: vi.fn(),
      },
    );

    expect(result.assets).toHaveLength(1);
    expect(result.chapters[0].xhtml).toContain("media-placeholder");
    expect(result.chapters[0].xhtml).toContain("https://a.com/audio.mp3");
  });

  it("单图失败时降级并记录 warning，不阻断导出", async () => {
    const result = await processEpubAssets(
      {
        chapters: [buildChapter('<p><img src="/broken/path.png" /></p>')],
      },
      {
        resolveLocalMediaPath: vi.fn().mockResolvedValue("/broken/path.png"),
        remoteResourceToLocal: vi.fn(),
        readBinaryFile: vi.fn().mockRejectedValue(new Error("read failed")),
      },
    );

    expect(result.assets).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.chapters[0].xhtml).toContain("image-placeholder");
    expect(result.chapters[0].xhtml).toContain("/broken/path.png");
  });
});
