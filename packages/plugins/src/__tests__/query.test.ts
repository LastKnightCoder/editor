import { describe, expect, it } from "vitest";
import { assertIndexedValues, readIndexes, readOrderBy, readWhere } from "../query";

const indexes = { status: "string", rank: "number", done: "boolean" } as const;

describe("插件数据查询", () => {
  it("索引声明限制字段名、类型与数量", () => {
    expect(readIndexes({ status: "string" })).toEqual({ status: "string" });
    expect(() => readIndexes({ "a.b": "string" })).toThrow("字段名无效");
    expect(() => readIndexes({ status: "date" })).toThrow("类型无效");
    expect(() =>
      readIndexes(Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`f${i}`, "number"])))
    ).toThrow("最多 16");
  });

  it("条件：直接给值为等于，null 为没有值；区间只用于字符串与数字", () => {
    expect(readWhere({ status: null, rank: { gt: 1, lte: 3 } }, indexes)).toEqual([
      { field: "status", type: "string", op: "eq", value: null },
      { field: "rank", type: "number", op: "gt", value: 1 },
      { field: "rank", type: "number", op: "lte", value: 3 },
    ]);
    expect(() => readWhere({ rank: { gt: null } }, indexes)).toThrow("number");
    expect(() => readWhere({ status: ["a"] }, indexes)).toThrow("in");
    expect(() => readWhere({ status: { in: [] } }, indexes)).toThrow("in 需要");
    expect(() => readWhere({ status: { like: "a" } }, indexes)).toThrow("未知的运算符");
    expect(() => readWhere({ rank: Number.NaN }, indexes)).toThrow("number");
  });

  it("排序可用宿主自带列与索引字段，最多两项", () => {
    expect(readOrderBy({ field: "rank", direction: "desc" }, indexes, ["createdAt"])).toEqual([
      { field: "rank", type: "number", direction: "desc" },
    ]);
    expect(() =>
      readOrderBy([{ field: "rank" }, { field: "status" }, { field: "createdAt" }], indexes, [
        "createdAt",
      ])
    ).toThrow("1–2");
  });

  it("写入时索引字段必须是声明的类型或 null，其余字段不管", () => {
    expect(() =>
      assertIndexedValues({ status: "open", rank: null, extra: [1] }, indexes)
    ).not.toThrow();
    expect(() => assertIndexedValues({ done: "yes" }, indexes)).toThrow("boolean");
  });
});
