import { describe, expect, it, vi } from "vitest";
import { Role } from "@/constants";

vi.mock("@/commands", () => ({
  getResourceById: vi.fn(),
  getHomeDir: vi.fn(),
  readBinaryFile: vi.fn(),
}));

vi.mock("@/utils", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/utils");
  return {
    ...actual,
    remoteResourceToLocal: vi.fn(),
  };
});

import { normalizeRequestMessages } from "../chatMessageNormalization";

describe("chatMessageNormalization mentions", () => {
  it("应为带 mention 的用户文本注入稳定的引用提示", async () => {
    const messages = await normalizeRequestMessages([
      {
        role: Role.User,
        content: [
          {
            type: "text" as const,
            text: '请结合 :content-link[测试卡片]{refId=42 contentId=301 contentType=card title="测试卡片"} 回答',
            mentions: [
              {
                entityType: "card" as const,
                entityId: 42,
                contentId: 301,
                title: "测试卡片",
                previewText: "这是卡片摘要",
              },
            ],
          },
        ],
      },
    ]);

    const firstMessage = messages[0];
    expect(Array.isArray(firstMessage?.content)).toBe(true);

    const textItem = (firstMessage?.content as Array<{ type: string }>).find(
      (item) => item.type === "text",
    ) as
      | {
          type: "text";
          text: string;
        }
      | undefined;

    expect(textItem?.text).toContain(
      "以下是用户在本条消息中显式提及的内部内容引用",
    );
    expect(textItem?.text).toContain("[Reference 1]");
    expect(textItem?.text).toContain("entityType=card");
    expect(textItem?.text).toContain("entityId=42");
    expect(textItem?.text).toContain("contentId=301");
    expect(textItem?.text).toContain("title=测试卡片");
    expect(textItem?.text).toContain("previewText=这是卡片摘要");
    expect(textItem?.text).toContain("用户原始消息：");
    expect(textItem?.text).toContain(
      '请结合 :content-link[测试卡片]{refId=42 contentId=301 contentType=card title="测试卡片"} 回答',
    );
  });

  it("无 mention 的文本不应被额外包装", async () => {
    const messages = await normalizeRequestMessages([
      {
        role: Role.User,
        content: [
          {
            type: "text" as const,
            text: "你好，直接回答即可",
          },
        ],
      },
    ]);

    const textItem = (
      messages[0]?.content as Array<{
        type: string;
        text?: string;
      }>
    )[0];

    expect(textItem?.text).toBe("你好，直接回答即可");
  });
});
