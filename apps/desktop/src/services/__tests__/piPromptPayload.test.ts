import { describe, expect, it, vi } from "vitest";
import { buildPiPromptPayload, normalizePiSystemPrompt } from "../piPromptPayload";

describe("pi 消息准备", () => {
  it("历史 resourceId 不参与读取，过期图片 URL 优先使用消息路径", async () => {
    const resolveRemoteFile = vi.fn();
    const result = await buildPiPromptPayload(
      [
        { type: "image", resourceId: 42, path: "~/image.png", image: "blob:expired" },
        { type: "file", resourceId: 43, file: "~/document.pdf", fileName: "document.pdf" },
      ],
      { resolveRemoteFile }
    );
    expect(result.images).toEqual([{ path: "~/image.png" }]);
    expect(result.promptText).toContain("路径：~/document.pdf");
    expect(result.promptText).toContain("请使用 pi 的 read 工具读取该文件。");
    expect(resolveRemoteFile).not.toHaveBeenCalled();
  });

  it("远程文件完成本地化后才进入模型提示", async () => {
    const resolveRemoteFile = vi.fn(async () => "/cached/document.pdf");
    const result = await buildPiPromptPayload(
      [{ type: "file", file: "https://example.test/a.pdf", fileName: "a.pdf" }],
      { resolveRemoteFile }
    );
    expect(resolveRemoteFile).toHaveBeenCalledWith("https://example.test/a.pdf", "a.pdf");
    expect(result.promptText).toContain("路径：/cached/document.pdf");
    expect(result.promptText).not.toContain("https://example.test");
  });

  it("图片 data URL 保持原样，不支持图片的模型不传图片", async () => {
    const content = [{ type: "image" as const, image: "data:image/png;base64,QUI=" }];
    const resolveRemoteFile = vi.fn();
    expect((await buildPiPromptPayload(content, { resolveRemoteFile })).images).toEqual([
      { dataUrl: "data:image/png;base64,QUI=" },
    ]);
    expect(
      (await buildPiPromptPayload(content, { resolveRemoteFile, includeImages: false })).images
    ).toEqual([]);
  });

  it("引用指令携带身份和摘要，用户原文不被旧协议重新包装", async () => {
    const text =
      '请结合 :content-link[测试卡片]{refId=42 contentId=301 contentType=card title="测试卡片" previewText="这是卡片摘要"} 回答';
    const result = await buildPiPromptPayload(
      [
        {
          type: "text",
          text,
          mentions: [
            {
              entityType: "card",
              entityId: 42,
              contentId: 301,
              title: "测试卡片",
              previewText: "这是卡片摘要",
            },
          ],
        },
      ],
      { resolveRemoteFile: vi.fn() }
    );
    expect(result.promptText).toBe(text);
  });

  it("退役代理的系统片段幂等移除，保留自定义规则", () => {
    const text = "自定义规则\n<TAU_CODEX_CONTEXT>旧代理指令</TAU_CODEX_CONTEXT>\n后续规则";
    const normalized = normalizePiSystemPrompt(text);
    expect(normalized).toBe("自定义规则\n后续规则");
    expect(normalizePiSystemPrompt(normalized)).toBe(normalized);
  });
});
