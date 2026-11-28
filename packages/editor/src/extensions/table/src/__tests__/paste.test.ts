import { createEditor, Element, Node, Transforms, type Descendant, type Editor } from "slate";
import { withReact } from "slate-react";
import { describe, expect, it } from "vitest";

import { withNormalize } from "../../../../core/plugins/withNormalize";
import { parseHtmlTable, parseTsv, withTablePaste } from "../paste";
import { getCellSelection, selectCells, selectRows, withTableCellSelection } from "../selection";
import type { TableElement } from "../types";

const grid = (rows: string[][]) =>
  ({
    type: "table",
    children: rows.map(row => ({
      type: "table-row",
      children: row.map(text => ({ type: "table-cell", children: [{ type: "formatted", text }] })),
    })),
  }) as unknown as Descendant;
const paragraph = (text: string) =>
  ({ type: "paragraph", children: [{ type: "formatted", text }] }) as unknown as Descendant;

function setup(children: Descendant[]) {
  const editor = withTablePaste(withTableCellSelection(withNormalize(withReact(createEditor()))));
  editor.children = children;
  return editor;
}

const clipboard = (data: Record<string, string>) =>
  ({ getData: (type: string) => data[type] ?? "" }) as unknown as DataTransfer;

const texts = (editor: Editor, path = [0]) =>
  (Node.get(editor, path) as TableElement).children.map(row =>
    row.children.map(cell => Node.string(cell))
  );

describe("解析", () => {
  it("TSV 支持引号字段与字段内换行", () => {
    expect(parseTsv('a\t"b ""x""\nc"\r\nd\te\n')).toEqual([
      ["a", 'b "x"\nc'],
      ["d", "e"],
    ]);
  });

  it("HTML 主体是表格时解析（忽略 style、展开 colspan、<br> 成换行）", () => {
    const html =
      '<meta charset="utf-8"><style>td{color:red}</style><table><tr><th>名称</th><th>数量</th></tr>' +
      '<tr><td colspan="2">合并<br>两行</td></tr></table>';
    expect(parseHtmlTable(html)).toEqual([
      ["名称", "数量"],
      ["合并\n两行", ""],
    ]);
  });

  it("HTML 夹带表格外的正文时不认领", () => {
    expect(parseHtmlTable("<p>说明</p><table><tr><td>a</td></tr></table>")).toBeNull();
    expect(parseHtmlTable("<p>没有表格</p>")).toBeNull();
  });
});

describe("粘贴", () => {
  const base = () =>
    setup([
      grid([
        ["h1", "h2"],
        ["a1", "a2"],
      ]),
    ]);

  it("格内粘贴 TSV：从光标格起填充，扩行扩列并选中粘贴区域", () => {
    const editor = base();
    Transforms.select(editor, { path: [0, 1, 1, 0], offset: 0 });
    editor.insertData(clipboard({ "text/plain": "x\ty\nz\tw" }));
    expect(texts(editor)).toEqual([
      ["h1", "h2", ""],
      ["a1", "x", "y"],
      ["", "z", "w"],
    ]);
    expect(getCellSelection(editor)).toMatchObject({
      rowStart: 1,
      rowEnd: 2,
      colStart: 1,
      colEnd: 2,
    });
  });

  it("格内粘贴不含制表符的多行文本：留在本格作软换行", () => {
    const editor = base();
    Transforms.select(editor, { path: [0, 1, 0, 0], offset: 2 });
    editor.insertData(clipboard({ "text/plain": "第一行\r\n第二行" }));
    expect(texts(editor)[1][0]).toBe("a1第一行\n第二行");
    expect(texts(editor)).toHaveLength(2);
  });

  it("正文粘贴 HTML 表格生成新表", () => {
    const editor = setup([paragraph("")]);
    Transforms.select(editor, { path: [0, 0], offset: 0 });
    editor.insertData(
      clipboard({ "text/html": "<table><tr><td>a</td><td>b</td></tr><tr><td>c</td></tr></table>" })
    );
    expect((editor.children[0] as Element).type).toBe("table");
    expect(texts(editor)).toEqual([
      ["a", "b"],
      ["c", ""],
    ]);
  });

  it("正文粘贴纯 TSV 不认领（交给默认链）", () => {
    const editor = setup([paragraph("")]);
    Transforms.select(editor, { path: [0, 0], offset: 0 });
    editor.insertData(clipboard({ "text/plain": "a\tb" }));
    expect((editor.children[0] as Element).type).toBe("paragraph");
  });

  // 整行颜色曾只进入复制片段，粘贴时被按格填充逻辑丢弃。
  it("整行片段经剪贴板序列化后粘贴保留颜色和无色状态", () => {
    const source = grid([
      ["a", "b"],
      ["c", "d"],
    ]) as TableElement;
    source.children[0].color = "blue";
    const destination = grid([
      ["h1", "h2"],
      ["x1", "x2"],
      ["y1", "y2"],
    ]) as TableElement;
    destination.children[0].color = "green";
    destination.children[1].color = "red";
    destination.children[2].color = "purple";
    const editor = setup([source, destination]);
    selectRows(editor, [0], 0, 1);
    const fragment = JSON.parse(JSON.stringify(editor.getFragment())) as Descendant[];
    Transforms.select(editor, { path: [1, 1, 0, 0], offset: 0 });
    editor.insertFragment(fragment);

    const pasted = editor.children[1] as TableElement;
    expect(texts(editor, [1]).slice(1)).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
    expect(pasted.children.map(row => row.color)).toEqual(["green", "blue", undefined]);
    expect((editor.children[0] as TableElement).children[0].color).toBe("blue");
  });

  it.each([
    { sourceColumns: 3, from: 1, to: 1, targetColumns: 1, targetColumn: 0 },
    { sourceColumns: 2, from: 0, to: 1, targetColumns: 3, targetColumn: 0 },
    { sourceColumns: 2, from: 0, to: 1, targetColumns: 3, targetColumn: 1 },
  ])("部分列复制或粘贴不改变目标整行颜色：%j", scenario => {
    const source = grid([Array(scenario.sourceColumns).fill("source")]) as TableElement;
    source.children[0].color = "blue";
    const destination = grid([Array(scenario.targetColumns).fill("target")]) as TableElement;
    destination.children[0].color = "red";
    const editor = setup([source, destination]);
    selectCells(editor, [0], {
      rowStart: 0,
      rowEnd: 0,
      colStart: scenario.from,
      colEnd: scenario.to,
    });
    const fragment = JSON.parse(JSON.stringify(editor.getFragment())) as Descendant[];
    Transforms.select(editor, { path: [1, 0, scenario.targetColumn, 0], offset: 0 });
    editor.insertFragment(fragment);

    expect(texts(editor, [1])[0][scenario.targetColumn]).toBe("source");
    expect((editor.children[1] as TableElement).children[0].color).toBe("red");
  });

  it("粘贴为新表格时只写入正文属性", () => {
    const source = grid([["a", "b"]]) as TableElement;
    source.children[0].color = "blue";
    const editor = setup([source, paragraph("")]);
    selectRows(editor, [0], 0);
    const fragment = JSON.parse(JSON.stringify(editor.getFragment())) as Descendant[];
    Transforms.select(editor, { path: [1, 0], offset: 0 });
    editor.insertFragment(fragment);

    const pasted = editor.children[1] as TableElement;
    expect(pasted.type).toBe("table");
    expect(Object.keys(pasted).sort()).toEqual(Object.keys(source).sort());
    expect(pasted.children[0].color).toBe("blue");
  });

  it("编辑器内复制的子表片段按格填充；普通块片段摊平为行内", () => {
    const editor = base();
    Transforms.select(editor, { path: [0, 0, 1, 0], offset: 0 });
    editor.insertFragment([grid([["p", "q"]])]);
    expect(texts(editor)[0]).toEqual(["h1", "p", "q"]);

    Transforms.select(editor, { path: [0, 1, 0, 0], offset: 2 });
    editor.insertFragment([paragraph("一"), paragraph("二")]);
    expect(texts(editor)[1][0]).toBe("a1一\n二");
    expect(texts(editor)).toHaveLength(2);
  });
});
