import { createEditor } from "slate";
import { describe, expect, it } from "vitest";
import { splitCells, type TableElement } from "@tau/editor/extensions/table";

import { HtmlSerializerRegistry } from "../htmlSerializerRegistry";
import { blockSerializers } from "../html-serializers/block-serializers";

function setup() {
  const editor = createEditor();
  const table: TableElement = {
    type: "table",
    children: [
      ["a", "", "c"],
      ["d", "e", "f"],
    ].map((row, r) => ({
      type: "table-row",
      children: row.map((text, c) => ({
        type: "table-cell",
        ...(r === 0 && c === 0 ? { colSpan: 2 } : {}),
        children: [{ type: "formatted", text }],
      })),
    })),
  };
  editor.children = [table];
  const registry = new HtmlSerializerRegistry();
  registry.registerMany(blockSerializers);
  const serialize = (value: TableElement) => registry.serializeElementAsync(value, null);
  const split = () => {
    splitCells(editor, [0], { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 1 });
    return editor.children[0] as TableElement;
  };
  return { table, serialize, split };
}

describe("表格 HTML 导出", () => {
  it("拆分后再次导出保留复用的空占位格", async () => {
    const { table, serialize, split } = setup();
    expect((await serialize(table)).match(/<td\b/g)).toHaveLength(5);
    const splitTable = split();
    expect(splitTable.children[0].children[1]).toBe(table.children[0].children[1]);
    const html = await serialize(splitTable);
    expect(html.match(/<td\b/g)).toHaveLength(6);
    expect(html).toContain(
      '<td class="table-cell">a</td><td class="table-cell"></td><td class="table-cell">c</td>'
    );
  });

  it("共享子节点的新旧快照并发导出时覆盖信息彼此隔离", async () => {
    const { table, serialize, split } = setup();
    const splitTable = split();
    const [mergedHtml, splitHtml] = await Promise.all([serialize(table), serialize(splitTable)]);
    expect(mergedHtml.match(/<td\b/g)).toHaveLength(5);
    expect(mergedHtml).toContain('colspan="2"');
    expect(splitHtml.match(/<td\b/g)).toHaveLength(6);
    expect(splitHtml).not.toContain("colspan");
  });
});
