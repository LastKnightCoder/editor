// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { QUERY_SOURCES, isQuerySource } from "../catalog";
import { verifyQueryExamples } from "./documentation-helpers";

const markdown = readFileSync(
  new URL("../../../../../apps/website/content/docs/query-database.md", import.meta.url),
  "utf8"
);
describe("查询使用文档契约", () => {
  it("来源与字段参考覆盖实际查询目录，不把显示名称当作字段 key", () => {
    const section = /## 数据来源与字段\n([\s\S]*?)(?=\n## |$)/.exec(markdown)?.[1] ?? "";
    const rows = [...section.matchAll(/^\|[^|\n]+\|\s*`([a-z]+)`\s*\|([^|\n]+)\|\s*$/gm)];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.map(row => row[1]).sort()).toEqual(Object.keys(QUERY_SOURCES).sort());
    for (const row of rows) {
      if (!isQuerySource(row[1])) throw new Error("文档来源名无效");
      const keys = [...row[2].matchAll(/`([^`]+)`/g)].map(match => match[1]);
      expect(new Set(keys), row[1]).toEqual(
        new Set(QUERY_SOURCES[row[1]].fields.map(field => field.key))
      );
    }
  });
  it("完整 DSL 与脚本例子在有数据和空结果时均可执行并符合结果协议", async () => {
    expect(await verifyQueryExamples(markdown)).toEqual([]);
  });
});
