import { describe, expect, it } from "vitest";

import { smartChunk } from "../../utils/smart-chunk";
import { buildChunkLineMap } from "../vibe-learning-chunk-line-map";

describe("vibe-learning-chunk-line-map", () => {
  it("应生成与 smartChunk 一致的 chunk 文本", () => {
    const markdown = [
      "# 第一章",
      "",
      "## Attention 机制",
      "",
      "Attention 通过 Query、Key、Value 计算权重。Attention 会先计算相似度。",
      "",
      "### Query / Key / Value",
      "",
      "Q、K、V 分别来自输入向量的不同投影。",
      "随后通过 softmax(QK^T)V 得到输出。",
      "",
      "### Multi-Head",
      "",
      "多头注意力会把投影拆成多个头并行计算。",
    ].join("\n");

    const chunks = smartChunk(markdown, {
      minLength: 40,
      maxLength: 80,
      overlap: 0,
      splitter: "sentence",
    });
    const mapped = buildChunkLineMap(markdown, {
      minLength: 40,
      maxLength: 80,
      overlap: 0,
      splitter: "sentence",
    });

    expect(mapped.map((item) => item.text)).toEqual(chunks);
  });

  it("应为每个 chunk 返回稳定的原始行号范围", () => {
    const markdown = [
      "# 标题",
      "",
      "第一段第一句。",
      "第一段第二句。",
      "",
      "第二段第一句。",
      "第二段第二句。",
      "",
      "第三段第一句。",
    ].join("\n");

    const mapped = buildChunkLineMap(markdown, {
      minLength: 10,
      maxLength: 30,
      overlap: 0,
      splitter: "sentence",
    });

    expect(mapped.length).toBeGreaterThan(1);
    expect(mapped[0]?.startLine).toBeGreaterThanOrEqual(1);
    expect(mapped[0]?.endLine).toBeGreaterThanOrEqual(mapped[0]!.startLine);
    expect(mapped.at(-1)?.endLine).toBeLessThanOrEqual(
      markdown.split("\n").length,
    );
    expect(
      mapped.some(
        (item) =>
          item.text.includes("第二段第一句") &&
          item.startLine <= 6 &&
          item.endLine >= 6,
      ),
    ).toBe(true);
  });

  it("应为每个 chunk 返回源文本字符范围，且文本来自原文 slice", () => {
    const markdown = [
      "# 标题",
      "",
      "第一段第一句。第一段第二句。",
      "",
      "第二段第一句。第二段第二句。",
      "",
      "第三段第一句。",
    ].join("\n");

    const mapped = buildChunkLineMap(markdown, {
      minLength: 10,
      maxLength: 30,
      overlap: 0,
      splitter: "sentence",
    });

    expect(mapped.length).toBeGreaterThan(1);
    for (const item of mapped) {
      expect(item.startOffset).toBeGreaterThanOrEqual(0);
      expect(item.endOffset).toBeGreaterThan(item.startOffset);
      expect(item.text).toBe(markdown.slice(item.startOffset, item.endOffset));
      expect(item.charCount).toBe(item.endOffset - item.startOffset);
      expect("wordCount" in item).toBe(false);
    }
  });

  it("面对重复文本块时应保持行号映射稳定向前推进", () => {
    const repeated = "重复句子 A。重复句子 B。";
    const markdown = ["# 标题", "", repeated, "", repeated, "", repeated].join(
      "\n",
    );

    const mapped = buildChunkLineMap(markdown, {
      minLength: 8,
      maxLength: 20,
      overlap: 0,
      splitter: "sentence",
    });

    const repeatedChunks = mapped.filter((item) =>
      item.text.includes("重复句子 A"),
    );

    expect(repeatedChunks.length).toBeGreaterThan(1);
    for (let i = 1; i < repeatedChunks.length; i += 1) {
      expect(repeatedChunks[i].startLine).toBeGreaterThanOrEqual(
        repeatedChunks[i - 1].startLine,
      );
    }
  });
});
