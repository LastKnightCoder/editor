import { describe, expect, it } from "vitest";
import { collectDataTableContentRefs } from "@tau/shared/data-table-content-refs";
import { desktopFieldModels } from "../desktopFieldModels";
import type { ColumnDef, RowData } from "@tau/database/model";

const modelOf = (type: string) => {
  const model = desktopFieldModels.find(item => item.type === type);
  if (!model) throw new Error("缺少桌面字段 model：" + type);
  return model;
};

/** 对整表按字段 model 的 contentRefs 汇总（多重集合，每次出现计一次） */
function collectByModel(columns: ColumnDef[], rows: RowData[]): Map<number, number> {
  const refs = new Map<number, number>();
  const modelsByColumn = new Map(
    columns.map(column => [
      column.id,
      desktopFieldModels.find(model => model.type === column.type) ?? null,
    ])
  );
  for (const row of rows) {
    for (const column of columns) {
      const model = modelsByColumn.get(column.id);
      if (!model?.contentRefs) continue;
      for (const id of model.contentRefs(row[column.id], column)) {
        refs.set(id, (refs.get(id) ?? 0) + 1);
      }
    }
  }
  return refs;
}

describe("desktopFieldModels", () => {
  it("rich-text 的 contentRefs 汇总与 shared 的 collectDataTableContentRefs 口径一致", () => {
    const columns: ColumnDef[] = [
      { id: "title", title: "标题", type: "text" },
      { id: "docs", title: "文档", type: "rich-text" },
      { id: "shots", title: "截图", type: "image" },
    ];
    const rows: RowData[] = [
      {
        id: "r1",
        title: "第一行",
        docs: [
          { id: "i1", contentId: 101, title: "需求文档", type: "article" },
          { id: "i2", contentId: 101, title: "需求文档（重复引用计两次）", type: "article" },
        ],
      },
      {
        id: "r2",
        title: "第二行",
        docs: [
          { id: "i3", contentId: 202, title: "卡片", type: "card" },
          { id: "i4", contentId: 0, title: "非正整数不计", type: "card" },
          { id: "i5", contentId: -3, title: "负数不计", type: "card" },
          { id: "i6", contentId: 1.5, title: "非整数不计", type: "card" },
        ],
      },
      { id: "r3", title: "第三行", docs: null },
      { id: "r4", title: "第四行", docs: "不是数组" },
    ];

    // 行不带 detailContentId 时 shared 的收集结果全部来自 rich-text 单元格
    const byShared = collectDataTableContentRefs(columns, rows);
    const byModel = collectByModel(columns, rows);
    expect([...byModel.entries()].sort()).toEqual([...byShared.entries()].sort());
    expect(byModel.get(101)).toBe(2);
    expect(byModel.get(202)).toBe(1);
    expect(byModel.has(0)).toBe(false);
    expect(byModel.has(-3)).toBe(false);
    expect(byModel.has(1.5)).toBe(false);
  });

  it("rich-text 的 contentRefs 声明在 model 上，其余桌面字段不声明", () => {
    expect(modelOf("rich-text").contentRefs).toBeTypeOf("function");
    expect(modelOf("image").contentRefs).toBeUndefined();
    expect(modelOf("attachment").contentRefs).toBeUndefined();
  });

  it("rich-text：toText 输出各项标题（「、」连接）", () => {
    const column: ColumnDef = { id: "docs", title: "文档", type: "rich-text" };
    expect(
      modelOf("rich-text").toText(
        [
          { id: "i1", contentId: 1, title: "需求文档", type: "article" },
          { id: "i2", contentId: 2, title: "会议纪要", type: "card" },
        ],
        column
      )
    ).toBe("需求文档、会议纪要");
    expect(modelOf("rich-text").toText([], column)).toBe("");
    expect(modelOf("rich-text").toText(null, column)).toBe("");
  });

  it("image：toText 输出文件名，无 alt 时用路径末段", () => {
    const column: ColumnDef = { id: "shots", title: "截图", type: "image" };
    expect(
      modelOf("image").toText(
        [
          { id: "a", url: "app://uploads/2026%2F10%2Fshot.png", alt: "首页截图" },
          { id: "b", url: "app://uploads/2026/10/raw-name.jpeg" },
        ],
        column
      )
    ).toBe("首页截图、raw-name.jpeg");
    expect(modelOf("image").toText([], column)).toBe("");
  });

  it("attachment：toText 输出文件名，缺失时用路径末段", () => {
    const column: ColumnDef = { id: "files", title: "附件", type: "attachment" };
    expect(
      modelOf("attachment").toText(
        [
          { id: "a", fileName: "规格说明.pdf", filePath: "/data/规格说明.pdf", isLocal: true },
          { id: "b", fileName: "", filePath: "/data/reports/report.docx", isLocal: true },
        ],
        column
      )
    ).toBe("规格说明.pdf、report.docx");
    expect(modelOf("attachment").toText(null, column)).toBe("");
  });
});
