import { describe, expect, it } from "vitest";
import { parseQuery } from "../query-parser";

describe("search-core/query-parser", () => {
  it("应清理空白并提取 token", () => {
    const parsed = parseQuery("  React   性能 优化  ");
    expect(parsed.isEmpty).toBe(false);
    expect(parsed.normalized).toBe("React 性能 优化");
    expect(parsed.tokens).toContain("react");
    expect(parsed.tokens).toContain("性能");
    expect(parsed.tokens).toContain("优化");
  });

  it("空查询应返回 isEmpty", () => {
    const parsed = parseQuery("   ");
    expect(parsed.isEmpty).toBe(true);
    expect(parsed.tokens).toEqual([]);
  });
});
