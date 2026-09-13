import { beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";

// 难以用真实文件构造 encrypted/needsOcr 等失败场景，此处 mock anydoc
// 只验证错误码到中文提示的映射；真实转换见 markitdown-node.test.ts
vi.mock("@firecrawl/anydoc", () => ({
  toMarkdown: vi.fn(),
}));

import { toMarkdown } from "@firecrawl/anydoc";
import { convertDocumentToMarkdown } from "../markitdown-node";

const mockedToMarkdown = vi.mocked(toMarkdown);

let tempDir: string;

beforeEach(async () => {
  vi.clearAllMocks();
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "markitdown-node-errors-"));
});

describe("convertDocumentToMarkdown：anydoc 错误码映射", () => {
  it.each([
    ["encrypted", "文档已加密，无法解析"],
    ["needsOcr", "PDF 为扫描版或纯图片页面，无法提取文本"],
    ["resourceLimit", "文档过大或嵌套超限，转换中止"],
    ["missingPart", "文档缺少必要内容，无法完整转换"],
    ["io", "读取文档失败"],
  ])("%s 映射为中文提示并保留原始细节", async (code, summary) => {
    const filePath = path.join(tempDir, "test.docx");
    await fs.writeFile(filePath, Buffer.from("stub"));
    mockedToMarkdown.mockRejectedValue(
      Object.assign(new Error(`${code} detail: some part`), { code })
    );

    const result = await convertDocumentToMarkdown(filePath);

    expect(result.success).toBe(false);
    expect(result.error).toContain(summary!);
    expect(result.error).toContain("some part");
  });

  it("无错误码的异常透传原始 message", async () => {
    const filePath = path.join(tempDir, "test.docx");
    await fs.writeFile(filePath, Buffer.from("stub"));
    mockedToMarkdown.mockRejectedValue(new Error("unexpected failure"));

    const result = await convertDocumentToMarkdown(filePath);

    expect(result.success).toBe(false);
    expect(result.error).toBe("unexpected failure");
  });
});
