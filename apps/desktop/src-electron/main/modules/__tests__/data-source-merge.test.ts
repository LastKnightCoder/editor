import { describe, expect, it } from "vitest";
import type { ColumnDef, RowData } from "@tau/shared/database-types";
import { requireSourceDef } from "@/features/databases/data-sources";
import { mergeRows, sourceColumns, splitChanges, tagNameMap } from "../data-sources/merge";

const card = requireSourceDef("card");
const article = requireSourceDef("article");

const NOTE: ColumnDef = { id: "note", title: "备注", type: "text" };

/** 关联表：源头只给了「标题、标签」，用户自建一列「备注」 */
function articleTable() {
  const columns = [...sourceColumns(article, ["title", "tags"], [], ["读书", "随笔"]), NOTE];
  const source = [
    { id: 7, contentId: 70, values: { title: "第一篇", tags: ["读书"] } },
    { id: 8, contentId: 80, values: { title: "第二篇", tags: [] } },
  ];
  const stored: RowData[] = [{ id: "article:7", note: "重读" }];
  return { columns, source, stored };
}

const split = (
  def: typeof article,
  columns: ColumnDef[],
  stored: RowData[],
  change: { upsert?: RowData[]; remove?: string[]; inserted?: string[] }
) =>
  splitChanges({
    def,
    columns,
    stored,
    upsert: change.upsert ?? [],
    remove: change.remove ?? [],
    inserted: change.inserted ?? [],
    tagNames: tagNameMap(columns),
  });

describe("关联表的合并与拆分", () => {
  it("读取时源头字段与自建列值按行 id 合在一起，行详情指向源头正文", () => {
    const { columns, source, stored } = articleTable();
    const rows = mergeRows(article, source, stored, columns);
    expect(rows).toEqual([
      {
        id: "article:7",
        note: "重读",
        "src:title": "第一篇",
        "src:tags": ["读书"],
        detailContentId: 70,
      },
      { id: "article:8", "src:title": "第二篇", "src:tags": [], detailContentId: 80 },
    ]);
  });

  it("改可写字段写回源头，自建列值只落表，源头正文不进落库的行", () => {
    const { columns, stored } = articleTable();
    const result = split(article, columns, stored, {
      upsert: [{ id: "article:8", "src:title": "改名", note: "新备注", detailContentId: 80 }],
    });
    expect(result.writes).toEqual([{ entityId: 8, patch: { title: "改名" } }]);
    expect(result.stored).toEqual([
      { id: "article:7", note: "重读" },
      { id: "article:8", note: "新备注" },
    ]);
  });

  it("改只读字段整次拒绝，不写回任何东西", () => {
    const columns = sourceColumns(card, ["title", "words"], [], []);
    expect(() =>
      split(card, columns, [], { upsert: [{ id: "card:1", "src:title": "改开头" }] })
    ).toThrow("只能在卡片里修改");
  });

  it("标签按名称写回：编辑器新建的选项 id 换成选项名", () => {
    const { columns, stored } = articleTable();
    const withNew = columns.map(column =>
      column.id === "src:tags"
        ? {
            ...column,
            config: {
              options: [
                { id: "读书", name: "读书" },
                { id: "opt-x", name: "新标签" },
              ],
            },
          }
        : column
    );
    const result = split(article, withNew, stored, {
      upsert: [{ id: "article:7", "src:tags": ["读书", "opt-x"] }],
    });
    expect(result.writes).toEqual([{ entityId: 7, patch: { tags: ["读书", "新标签"] } }]);
  });

  it("删行删除源头条目，并清掉该行的自建列值", () => {
    const { columns, stored } = articleTable();
    const result = split(article, columns, stored, { remove: ["article:7"] });
    expect(result.removes).toEqual([7]);
    expect(result.stored).toEqual([]);
  });

  it("新建行在源头新建，可写字段与自建列分开带上", () => {
    const { columns, stored } = articleTable();
    const result = split(article, columns, stored, {
      upsert: [{ id: "tmp-1", "src:title": "新文章", note: "草稿" }],
      inserted: ["tmp-1"],
    });
    expect(result.creates).toEqual([
      { rowId: "tmp-1", patch: { title: "新文章" }, own: { note: "草稿" } },
    ]);
  });

  it("撤销删行时重新出现的源头行 id 不新建空白条目", () => {
    const { columns, stored } = articleTable();
    expect(() =>
      split(article, columns, stored, {
        upsert: [{ id: "article:7", "src:title": "第一篇" }],
        inserted: ["article:7"],
      })
    ).toThrow("无法恢复");
  });

  it("不支持新建的源头拒绝新建行", () => {
    const diary = requireSourceDef("diary");
    const columns = sourceColumns(diary, ["day"], [], []);
    expect(() =>
      split(diary, columns, [], { upsert: [{ id: "tmp-1" }], inserted: ["tmp-1"] })
    ).toThrow("不支持在表里新建");
  });

  it("重建源头列时保留用户改过的列名与宽度，丢掉自建主列", () => {
    const stored: ColumnDef[] = [
      { id: "old", title: "名称", type: "text", isPrimary: true },
      { id: "src:title", title: "篇名", type: "text", width: 320 },
      NOTE,
    ];
    const columns = sourceColumns(article, ["title"], stored, []);
    expect(columns.map(column => column.id)).toEqual(["src:title", "note"]);
    expect(columns[0]).toMatchObject({ title: "篇名", width: 320, isPrimary: true });
  });
});
