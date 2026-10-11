import { describe, expect, it } from "vitest";
import { collectContentRefs } from "@tau/database/model";
import { desktopFieldModels } from "../desktopFieldModels";
import type { ColumnDef, RowData } from "@tau/database/model";

const modelOf = (type: string) => {
  const model = desktopFieldModels.find(item => item.type === type);
  if (!model) throw new Error("缺少桌面字段 model：" + type);
  return model;
};

describe("desktopFieldModels", () => {
  it("rich-text 的 contentRefs 经 model 子入口的 collectContentRefs 按多重集合汇总", () => {
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

    // 行不带 detailContentId 时收集结果全部来自 rich-text 单元格
    const refs = collectContentRefs(columns, rows, desktopFieldModels);
    expect(Object.fromEntries(refs)).toEqual({ 101: 2, 202: 1 });
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
