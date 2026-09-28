import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  getMarkdown,
  getMarkdownWithPositions,
  importFromMarkdown,
  importFromMarkdownWithPositions,
} from "../markdown";

/**
 * 往返基准（docs/editor-refactor 02 P5）：夹具覆盖内置元素与 desktop 业务元素，
 * 快照在 @tau/markdown 拆出业务类型之前生成；之后 desktop 的输出（含两种位置映射）必须与之一致。
 */
// jsdom 环境下 import.meta.url 不是 file: 协议，用 __dirname 定位夹具
const fixture = readFileSync(path.join(__dirname, "__fixtures__/markdown-roundtrip.md"), "utf8");

// 图片等元素导入时生成随机 uuid，快照前抹平
const stable = (value: unknown) =>
  JSON.parse(JSON.stringify(value), (key, v) => (key === "uuid" && v !== "u-1" ? "<uuid>" : v));

describe("Markdown 往返基准", () => {
  it("导入 → 导出", () => {
    const value = importFromMarkdown(fixture);
    expect(stable(value)).toMatchSnapshot("value");
    expect(getMarkdown(value)).toMatchSnapshot("markdown");
  });

  it("带位置导入 / 导出的映射", () => {
    const imported = importFromMarkdownWithPositions(fixture);
    expect(stable(imported.content)).toMatchSnapshot("positioned value");
    expect(imported.positionMap.getMappings()).toMatchSnapshot("import mappings");
    const exported = getMarkdownWithPositions(imported.content);
    expect(exported.markdown).toMatchSnapshot("positioned markdown");
    expect(exported.positionMap.getMappings()).toMatchSnapshot("export mappings");
  });
});
