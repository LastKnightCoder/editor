import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  assertIndexCreated,
  parseRipgrepJsonLines,
  readMarkdownLines,
} from "../vibe-learning-resource-read-utils";

describe("vibe-learning-resource-read-utils", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("readMarkdownLines 应返回文件真实总行数，即使请求范围提前结束", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "vl-lines-"));
    const filePath = join(tempDir, "resource.md");
    await writeFile(
      filePath,
      ["第一行", "第二行", "第三行", "第四行"].join("\n"),
    );

    const result = await readMarkdownLines(filePath, {
      startLine: 2,
      endLine: 2,
      maxChars: 1024,
    });

    expect(result.content).toBe("第二行");
    expect(result.startLine).toBe(2);
    expect(result.endLine).toBe(2);
    expect(result.totalLines).toBe(4);
    expect(result.truncated).toBe(false);
  });

  it("parseRipgrepJsonLines 应在达到全局 limit 后停止解析后续结果", async () => {
    const firstLine = JSON.stringify({
      type: "match",
      data: {
        path: { text: "/tmp/a.md" },
        line_number: 1,
        lines: { text: "alpha Query\n" },
        submatches: [{ match: { text: "Query" }, start: 6, end: 11 }],
      },
    });
    const secondLine = JSON.stringify({
      type: "match",
      data: {
        path: { text: "/tmp/b.md" },
        line_number: 1,
        lines: { text: "beta Query\n" },
        submatches: [{ match: { text: "Query" }, start: 5, end: 10 }],
      },
    });
    const onLimitReached = vi.fn();

    const result = await parseRipgrepJsonLines({
      lines: [firstLine, secondLine],
      pathToResource: new Map([
        ["/tmp/a.md", { id: 1, name: "A" }],
        ["/tmp/b.md", { id: 2, name: "B" }],
      ]),
      limit: 1,
      previewRadius: 20,
      getLineStartOffsets: async () => [0],
      onLimitReached,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      resourceId: 1,
      resourceName: "A",
      matchedText: "Query",
    });
    expect(onLimitReached).toHaveBeenCalledTimes(1);
  });

  it("assertIndexCreated 应在索引写入失败时抛错", () => {
    expect(() => assertIndexCreated(false, 42)).toThrow(
      "Failed to create search index for resource 42",
    );
  });
});
