import { describe, expect, it } from "vitest";
import { importFromMarkdown } from "@/utils/markdown";
import { createContentSnapshot } from "../snapshot";
import { findContentRanges } from "../matcher";

describe("content-editing/matcher", () => {
  it("exact + occurrence 应返回指定出现位置", () => {
    const content = importFromMarkdown("alpha beta alpha beta");
    const snapshot = createContentSnapshot(content, "database");

    const results = findContentRanges(snapshot, {
      queryText: "alpha",
      matchMode: "exact",
      occurrence: 2,
    });

    expect(results).toHaveLength(1);
    expect(results[0].start).toBeGreaterThan(0);
  });

  it("normalized 模式应忽略多空格差异", () => {
    const content = importFromMarkdown("hello    world");
    const snapshot = createContentSnapshot(content, "database");

    const results = findContentRanges(snapshot, {
      queryText: "hello world",
      matchMode: "normalized",
    });

    expect(results.length).toBeGreaterThan(0);
  });

  it("fuzzy 模式应给出候选片段", () => {
    const content = importFromMarkdown(
      "机器学习是人工智能的重要分支。\n\n大模型在写作辅助场景中非常常见。",
    );
    const snapshot = createContentSnapshot(content, "database");

    const results = findContentRanges(snapshot, {
      queryText: "大语言模型写作辅助",
      matchMode: "fuzzy",
      maxCandidates: 3,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].confidence).toBeGreaterThan(0);
  });
});
