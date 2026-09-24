import { describe, expect, it, vi } from "vitest";
import { Role } from "@/constants";

vi.mock("@/commands", () => ({
  getHomeDir: vi.fn(async () => "/home/test"),
  readBinaryFile: vi.fn(async () => new Uint8Array([65, 66])),
}));
vi.mock("@/utils", () => ({
  remoteResourceToLocal: vi.fn(async () => "/cached/image.png"),
}));

import { readBinaryFile } from "@/commands";
import { normalizeRequestMessages } from "../chatMessageNormalization";
import { buildCodexInputFromMessageContent } from "../codex/codexInputAdapter";

describe("资源索引移除后的历史附件", () => {
  it("历史 resourceId 不参与读取，图片与 PDF 从消息路径转换", async () => {
    const result = await normalizeRequestMessages([
      {
        role: Role.User,
        content: [
          { type: "image", resourceId: 42, path: "~/image.png", image: "blob:expired" },
          { type: "file", resourceId: 43, file: "~/document.pdf", fileName: "document.pdf" },
        ],
      },
    ]);
    expect(readBinaryFile).toHaveBeenCalledWith("/home/test/image.png");
    expect(readBinaryFile).toHaveBeenCalledWith("/home/test/document.pdf");
    expect(result[0].content).toMatchObject([
      { image: "data:image/png;base64,QUI=" },
      { file: "data:application/pdf;base64,QUI=" },
    ]);
  });

  it("没有资源记录的 data URL 可直接发送", async () => {
    const content = [{ type: "image" as const, image: "data:image/png;base64,QUI=" }];
    const result = await normalizeRequestMessages([{ role: Role.User, content }]);
    expect(result[0].content).toEqual(content);
  });

  it("Codex 同时支持旧消息路径、本地图片和远程路径", async () => {
    expect(
      await buildCodexInputFromMessageContent([
        { type: "image", resourceId: 42, path: "~/image.png", image: "blob:expired" },
        { type: "image", path: "https://example.test/image.png", image: "blob:expired" },
        { type: "image", image: "/local/image.png" },
      ])
    ).toEqual([
      { type: "local_image", path: "/home/test/image.png" },
      { type: "local_image", path: "/cached/image.png" },
      { type: "local_image", path: "/local/image.png" },
    ]);
  });
});
