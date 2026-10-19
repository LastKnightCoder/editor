import { readFileSync } from "node:fs";
import path from "node:path";
import type { Descendant } from "slate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { desktopContentPlugins } from "../../../shared/content-plugins";
import { htmlDefinition } from "../../test-fixtures/plugin-packages";

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
// jsdom 环境下 import.meta.url 不是 file: 协议，用 __dirname 定位夹具；
// 统一 LF：core.autocrlf=true 的检出会把夹具变成 CRLF，\r 会进文本节点、污染位置映射快照
const fixture = readFileSync(
  path.join(__dirname, "__fixtures__/markdown-roundtrip.md"),
  "utf8"
).replace(/\r\n/g, "\n");

// 图片等元素导入时生成随机 uuid，快照前抹平
const stable = (value: unknown) =>
  JSON.parse(JSON.stringify(value), (key, v) => (key === "uuid" && v !== "u-1" ? "<uuid>" : v));

describe("Markdown 往返基准", () => {
  beforeEach(() => desktopContentPlugins.install([htmlDefinition]));
  afterEach(() => desktopContentPlugins.install([]));
  it("表格内未知文本字段的竖线不增加列，正文与元数据均保真", () => {
    const leaf = { type: "formatted", text: "a|b", vendor: { label: "x|y", literal: "&#124;" } };
    const value = [
      {
        type: "table",
        children: [
          {
            type: "table-row",
            children: [
              { type: "table-cell", children: [leaf] },
              { type: "table-cell", children: [{ type: "formatted", text: "第二格" }] },
            ],
          },
        ],
      },
    ] as Descendant[];
    const source = getMarkdown(value);
    const exported = getMarkdownWithPositions(value);
    const imported = importFromMarkdownWithPositions(source);
    expect(exported.markdown).toBe(source);
    expect(importFromMarkdown(source)).toEqual(value);
    expect(imported.content).toEqual(value);
    for (let offset = 0; offset <= leaf.text.length; offset++) {
      const point = { path: [0, 0, 0, 0], offset };
      const location = exported.positionMap.slateToMarkdown(point);
      expect(location).not.toBeNull();
      if (!location) throw new Error("表格文本缺少映射");
      expect(imported.positionMap.slateToMarkdown(point)).toEqual(location);
      expect(imported.positionMap.markdownToSlate(location)).toEqual(point);
    }
  });

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
