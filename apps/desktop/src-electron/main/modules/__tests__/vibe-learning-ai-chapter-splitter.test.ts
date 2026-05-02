import { beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.fn();

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation((options: unknown) => {
    createMock(options);
    return {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [
              {
                message: {
                  content: `===CHAPTER_START===
TITLE: 第一章
DESCRIPTION: 介绍整体背景
CONTINUATION: false
INCOMPLETE: false
---CONTENT_START---
# 第一章
内容 A
---CONTENT_END---
===CHAPTER_END===`,
                },
              },
            ],
          }),
        },
      },
    };
  }),
}));

import {
  generateSummaryIndex,
  splitMarkdownByAI,
} from "../vibe-learning-ai-chapter-splitter";

describe("vibe-learning-ai-chapter-splitter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generateSummaryIndex 应输出结构化章节索引详情", () => {
    const markdown = generateSummaryIndex("测试资料", [
      {
        index: 0,
        title: "第一章",
        description: "介绍整体背景",
        headingLevel: 1,
        content: "# 第一章\n内容 A",
      },
      {
        index: 1,
        title: "第二章",
        description: "展开核心方法",
        headingLevel: 1,
        content: "# 第二章\n内容 B",
      },
    ]);

    expect(markdown).toContain("## 章节目录");
    expect(markdown).toContain("## 章节索引详情");
    expect(markdown).toContain("### 章节 1");
    expect(markdown).toContain("- 标题：第一章");
    expect(markdown).toContain("- 摘要：介绍整体背景");
    expect(markdown).toContain("- 文件：01-第一章.md");
  });

  it("kimi-for-coding 应注入 KimiCLI User-Agent", async () => {
    await splitMarkdownByAI(
      "# 第一章\n\n内容 A",
      {
        llmApiKey: "test-key",
        llmModel: "kimi-for-coding",
        llmBaseUrl: "https://api.moonshot.cn/v1",
      },
      "测试资料",
    );

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "test-key",
        baseURL: "https://api.moonshot.cn/v1",
        defaultHeaders: {
          "User-Agent": "KimiCLI/1.37.0",
        },
      }),
    );
  });
});
