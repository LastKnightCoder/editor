import { describe, expect, it } from "vitest";
import type { AggregateOp } from "@tau/shared/database-types";
import type { Scalar } from "../types";
import { aggregate, aggregatesFor, AGGREGATE_LABELS } from "../aggregate";
import { AggregateRegistry, type DatabaseAggregateDefinition } from "../aggregateRegistry";
import { builtInAggregateDefinitions } from "../aggregate";

const OPS: AggregateOp[] = [
  "sum",
  "avg",
  "median",
  "min",
  "max",
  "countAll",
  "countNonEmpty",
  "countEmpty",
  "unique",
];

const VALUE_SETS: readonly Scalar[][] = [
  [4, 1, 3, 2],
  [10],
  [1, 2],
  [2.5, -1.5],
  [null, ""],
  [],
  ["a", "b", "a"],
  [null, 1, "x", 2],
  [true, false],
];

describe("AggregateRegistry 内置算子对拍", () => {
  it.each(OPS)("内置 %s 经登记表计算与旧 aggregate() 逐值一致", op => {
    const registry = new AggregateRegistry();
    registry.registerAll(builtInAggregateDefinitions);
    const definition = registry.get(op)!;
    expect(definition.label).toBe(AGGREGATE_LABELS[op]);

    for (const values of VALUE_SETS) {
      const legacy = aggregate(op, values);
      const value = definition.compute(values);
      if (!legacy.ok) {
        // 唯一差异：非全数字值时旧实现报错、compute 返回 null（表尾显示同为「—」）
        expect(value).toBeNull();
        continue;
      }
      expect(definition.resultKind, `${op} ${JSON.stringify(values)}`).toBe(legacy.value.kind);
      expect(value, `${op} ${JSON.stringify(values)}`).toBe(legacy.value.value);
    }
  });

  it("listFor 与旧 aggregatesFor 的可用集合一致", () => {
    const registry = new AggregateRegistry();
    registry.registerAll(builtInAggregateDefinitions);
    for (const valueType of ["number", "text", "boolean", "date", null] as const) {
      expect(registry.listFor(valueType).map(definition => definition.op)).toEqual(
        expect.arrayContaining(aggregatesFor(valueType))
      );
      expect(registry.listFor(valueType)).toHaveLength(aggregatesFor(valueType).length);
    }
  });

  it("重复注册抛错", () => {
    const registry = new AggregateRegistry();
    registry.registerAll(builtInAggregateDefinitions);
    expect(() => registry.register(builtInAggregateDefinitions[0])).toThrowError("重复注册");
  });

  it("扩展算子按 valueTypes 过滤，缺省适用所有类型", () => {
    const registry = new AggregateRegistry();
    registry.registerAll(builtInAggregateDefinitions);
    const range: DatabaseAggregateDefinition = {
      op: "acme.range",
      label: "极差",
      valueTypes: ["number"],
      resultKind: "numeric",
      compute: values => {
        const numbers = values.filter(
          (value): value is number => value !== null && value !== "" && typeof value === "number"
        );
        if (!numbers.length) return null;
        return Math.max(...numbers) - Math.min(...numbers);
      },
    };
    registry.register(range);
    expect(registry.listFor("number").map(definition => definition.op)).toContain("acme.range");
    expect(registry.listFor("text").map(definition => definition.op)).not.toContain("acme.range");
    expect(registry.listFor(null).map(definition => definition.op)).not.toContain("acme.range");

    const anyText: DatabaseAggregateDefinition = {
      op: "acme.textCount",
      label: "文本计数",
      resultKind: "count",
      compute: values => values.filter(value => typeof value === "string").length,
    };
    registry.register(anyText);
    expect(registry.listFor("text").map(definition => definition.op)).toContain("acme.textCount");
    expect(registry.listFor(null).map(definition => definition.op)).toContain("acme.textCount");
  });
});
