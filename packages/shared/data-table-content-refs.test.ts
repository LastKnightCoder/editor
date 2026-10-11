import { describe, expect, it } from "vitest";
import {
  RICH_TEXT_FIELD_TYPE,
  collectDataTableContentRefs,
  diffContentRefs,
} from "./data-table-content-refs";

const richTextColumn = { id: "rt", title: "富文本", type: RICH_TEXT_FIELD_TYPE };
const textColumn = { id: "text", title: "名称", type: "text" };

describe("collectDataTableContentRefs", () => {
  it("统计 rich-text 单元格 contentId 与行 detailContentId，同一 id 按出现次数累计", () => {
    const refs = collectDataTableContentRefs(
      [richTextColumn, textColumn],
      [
        { id: "r1", rt: [{ contentId: 11 }, { contentId: 11 }], detailContentId: 12 },
        { id: "r2", rt: [{ contentId: 13 }] },
      ]
    );
    expect(Object.fromEntries(refs)).toEqual({ 11: 2, 12: 1, 13: 1 });
  });

  it("非 rich-text 列的 contentId 不计入", () => {
    const refs = collectDataTableContentRefs(
      [textColumn],
      [{ id: "r1", text: [{ contentId: 11 }], detailContentId: 0 }]
    );
    expect(refs.size).toBe(0);
  });

  it("忽略非法值：缺 contentId、非正整数、单元格非数组、行非对象", () => {
    const refs = collectDataTableContentRefs(
      [richTextColumn],
      [
        {
          id: "r1",
          rt: [{ title: "无 id" }, { contentId: 0 }, { contentId: -3 }, { contentId: 1.5 }, null],
        },
        { id: "r2", rt: "不是数组" },
        { id: "r3", rt: [{ contentId: 21 }], detailContentId: "22" },
        null,
      ]
    );
    expect(Object.fromEntries(refs)).toEqual({ 21: 1 });
  });

  it("columns 或 rows 非数组时返回空集合", () => {
    expect(collectDataTableContentRefs(null, []).size).toBe(0);
    expect(collectDataTableContentRefs([richTextColumn], undefined).size).toBe(0);
    expect(collectDataTableContentRefs(undefined, [{ id: "r", detailContentId: 1 }]).size).toBe(0);
  });
});

describe("diffContentRefs", () => {
  it("同一 id 按差值重复出现在 retain/release 中", () => {
    const before = new Map([
      [1, 1],
      [2, 3],
    ]);
    const after = new Map([
      [1, 2],
      [2, 1],
      [3, 1],
    ]);
    expect(diffContentRefs(before, after)).toEqual({
      retain: [1, 3],
      release: [2, 2],
    });
  });

  it("完全一致时无差，空集合安全", () => {
    const same = new Map([[5, 2]]);
    expect(diffContentRefs(same, new Map([[5, 2]]))).toEqual({ retain: [], release: [] });
    expect(diffContentRefs(new Map(), new Map())).toEqual({ retain: [], release: [] });
    expect(diffContentRefs(new Map([[5, 1]]), new Map())).toEqual({ retain: [], release: [5] });
    expect(diffContentRefs(new Map(), new Map([[5, 1]]))).toEqual({ retain: [5], release: [] });
  });
});
