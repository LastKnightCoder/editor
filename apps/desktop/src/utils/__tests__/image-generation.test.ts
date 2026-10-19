import { expect, it, vi } from "vitest";
import { createImageFile, resolveImageInputFile } from "../image-generation";

it("将 data URL 解析为原始 MIME 与字节", async () => {
  const file = await resolveImageInputFile("data:image/png;base64,AQID");
  expect(file.type).toBe("image/png");
  expect(await file.arrayBuffer()).toEqual(new Uint8Array([1, 2, 3]).buffer);
  expect(createImageFile(new Uint8Array([1]), "image/webp").name).toMatch(/\.webp$/);
});

it("远程下载接收取消信号，本地读取后拒绝迟到数据", async () => {
  const controller = new AbortController();
  const fetchBinary = vi.fn(async () => ({ data: new Uint8Array([1]), mimeType: "image/jpeg" }));
  await resolveImageInputFile("https://test/image", { fetchBinary }, controller.signal);
  expect(fetchBinary).toHaveBeenCalledWith("https://test/image", controller.signal);
  await expect(
    resolveImageInputFile(
      "/tmp/a.png",
      {
        resolveLocalMediaPath: vi.fn(async () => "/tmp/a.png"),
        getFileExtension: vi.fn(async () => "png"),
        readBinaryFile: vi.fn(async () => {
          controller.abort();
          return new Uint8Array([1]);
        }),
      },
      controller.signal
    )
  ).rejects.toMatchObject({ name: "AbortError" });
});
