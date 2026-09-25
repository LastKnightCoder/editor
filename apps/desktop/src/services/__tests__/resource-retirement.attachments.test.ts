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
});

describe("退役代理的系统上下文", () => {
  it("只从系统消息移除专属块，保留自定义提示与用户原文", async () => {
    const legacy =
      "自定义规则\n<TAU_CODEX_CONTEXT>旧代理指令\n工具规则</TAU_CODEX_CONTEXT>\n后续规则";
    const input = [
      { role: Role.System, content: legacy },
      { role: Role.System, content: [{ type: "text" as const, text: legacy }] },
      { role: Role.User, content: legacy },
    ];
    const result = await normalizeRequestMessages(input);
    expect(result[0].content).toBe("自定义规则\n后续规则");
    expect(result[1].content).toEqual([{ type: "text", text: "自定义规则\n后续规则" }]);
    expect(result[2].content).toBe(legacy);
    expect(input[0].content).toBe(legacy);
    expect(await normalizeRequestMessages(result)).toEqual(result);
  });
});
