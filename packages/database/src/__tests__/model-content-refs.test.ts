import { describe, expect, it } from "vitest";
import {
  builtInFieldModels,
  collectContentRefs,
  defineFieldModel,
  diffContentRefs,
} from "../model";
import type { ColumnDef, RowData } from "../types";

const richTextFieldModel = defineFieldModel({
  type: "rich-text",
  toText: () => "",
  contentRefs: value =>
    (Array.isArray(value) ? value : [])
      .map(item =>
        typeof item?.contentId === "number" &&
        Number.isInteger(item.contentId) &&
        item.contentId > 0
          ? item.contentId
          : null
      )
      .filter((id): id is number => id !== null),
});

const richTextColumn: ColumnDef = { id: "rt", title: "富文本", type: "rich-text" };
const textColumn: ColumnDef = { id: "text", title: "名称", type: "text" };

describe("collectContentRefs", () => {
  it("按字段 model 的 contentRefs 收集单元格引用，同一 id 按出现次数累计（多重集合）", () => {
    const refs = collectContentRefs(
      [richTextColumn, textColumn],
      [
        { id: "r1", rt: [{ contentId: 11 }, { contentId: 11 }] },
        { id: "r2", rt: [{ contentId: 13 }] },
      ],
      [richTextFieldModel, ...builtInFieldModels]
    );
    expect(Object.fromEntries(refs)).toEqual({ 11: 2, 13: 1 });
  });

  it("未声明 contentRefs 的列类型（未知列类型）不计入", () => {
    const refs = collectContentRefs(
      [textColumn],
      [{ id: "r1", text: [{ contentId: 11 }] }],
      [richTextFieldModel, ...builtInFieldModels]
    );
    expect(refs.size).toBe(0);
  });

  it("model 返回的非法值（非正整数）被忽略", () => {
    const lenientModel = defineFieldModel({
      type: "lenient",
      toText: () => "",
      contentRefs: value => (Array.isArray(value) ? (value as number[]) : []),
    });
    const refs = collectContentRefs(
      [{ id: "l", title: "宽松", type: "lenient" }],
      [{ id: "r1", l: [0, -3, 1.5, 21, "22"] }],
      [lenientModel]
    );
    expect(Object.fromEntries(refs)).toEqual({ 21: 1 });
  });

  it("忽略非法输入：单元格非数组（model 自行忽略）、行非对象", () => {
    const refs = collectContentRefs(
      [richTextColumn],
      [
        {
          id: "r1",
          rt: [{ title: "无 id" }, { contentId: 0 }, { contentId: -3 }, { contentId: 1.5 }, null],
        },
        { id: "r2", rt: "不是数组" },
        { id: "r3", rt: [{ contentId: 21 }] },
        null,
      ] as unknown as RowData[],
      [richTextFieldModel]
    );
    expect(Object.fromEntries(refs)).toEqual({ 21: 1 });
  });

  it("columns 或 rows 非数组时返回空集合；models 支持传 Map 形态", () => {
    const models = new Map([[richTextColumn.type, richTextFieldModel]]);
    expect(collectContentRefs(null, [], models).size).toBe(0);
    expect(collectContentRefs([richTextColumn], undefined, models).size).toBe(0);
    expect(collectContentRefs(undefined, [{ id: "r", rt: [] }] as RowData[], models)).toEqual(
      new Map()
    );
  });

  it("同一列 id 重复出现只计一次（列 id 唯一是常态，重复时与旧口径一致）", () => {
    const refs = collectContentRefs(
      [richTextColumn, { ...richTextColumn, title: "重复列" }],
      [{ id: "r1", rt: [{ contentId: 11 }] }],
      [richTextFieldModel]
    );
    expect(Object.fromEntries(refs)).toEqual({ 11: 1 });
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
