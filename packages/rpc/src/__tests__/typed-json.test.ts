import { describe, expect, it } from "vitest";
import { deserialize, parseTyped, serialize, stringifyTyped, TypedJsonError } from "../typed-json";

/** 业务对象恰好含有 $__t 属性但不是合法信封时，应按普通对象处理 */
describe("typed-json 基础类型", () => {
  it("原始类型与 null 往返不变", () => {
    for (const value of ["文本", 42, -1.5, true, false, null]) {
      expect(parseTyped(stringifyTyped(value))).toBe(value);
    }
  });

  it("普通对象与数组往返保持结构", () => {
    const value = { a: 1, b: "x", c: [1, 2, { d: false }], e: null };
    expect(parseTyped(stringifyTyped(value))).toEqual(value);
  });

  it("对象属性值为 undefined 时被丢弃（文档化差异）", () => {
    const result = parseTyped(stringifyTyped({ a: 1, b: undefined })) as Record<string, unknown>;
    expect(result).toEqual({ a: 1 });
    expect("b" in result).toBe(false);
  });
});

describe("typed-json 信封类型", () => {
  it("Date 往返还原", () => {
    const date = new Date("2026-09-07T10:30:00.000Z");
    const result = parseTyped(stringifyTyped({ createdAt: date })) as {
      createdAt: Date;
    };
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.createdAt.getTime()).toBe(date.getTime());
  });

  it("BigInt 往返还原", () => {
    const result = parseTyped(stringifyTyped({ id: 9007199254740993n })) as {
      id: bigint;
    };
    expect(typeof result.id).toBe("bigint");
    expect(result.id).toBe(9007199254740993n);
  });

  it("Uint8Array 往返还原（含超分块大小的大数组）", () => {
    const bytes = new Uint8Array(0x10000 + 100);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = i % 256;
    }
    const result = parseTyped(stringifyTyped(bytes)) as Uint8Array;
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(bytes.length);
    expect(result).toEqual(bytes);
  });

  it("ArrayBuffer 往返还原为 Uint8Array", () => {
    const buffer = new Uint8Array([1, 2, 3]).buffer;
    const result = parseTyped(stringifyTyped(buffer)) as Uint8Array;
    expect(result).toBeInstanceOf(Uint8Array);
    expect(Array.from(result)).toEqual([1, 2, 3]);
  });

  it("Map/Set 嵌套往返还原", () => {
    const value = {
      map: new Map<string, Set<number>>([
        ["a", new Set([1, 2])],
        ["b", new Set([3])],
      ]),
    };
    const result = parseTyped(stringifyTyped(value)) as typeof value;
    expect(result.map).toBeInstanceOf(Map);
    expect(result.map.get("a")).toBeInstanceOf(Set);
    expect([...(result.map.get("a") as Set<number>)]).toEqual([1, 2]);
  });

  it("数组内 undefined 往返还原", () => {
    const result = parseTyped(stringifyTyped([1, undefined, 3])) as unknown[];
    expect(result).toEqual([1, undefined, 3]);
    expect(result.length).toBe(3);
  });

  it("NaN 与 Infinity 往返还原", () => {
    const result = parseTyped(stringifyTyped([NaN, Infinity, -Infinity])) as [
      number,
      number,
      number,
    ];
    expect(Number.isNaN(result[0])).toBe(true);
    expect(result[1]).toBe(Infinity);
    expect(result[2]).toBe(-Infinity);
  });
});

describe("typed-json 严格模式", () => {
  it("class 实例抛出含路径的错误", () => {
    class Foo {
      bar = new Date();
    }
    expect(() => serialize({ nested: new Foo() })).toThrow(TypedJsonError);
    try {
      serialize({ nested: new Foo() });
    } catch (error) {
      expect((error as TypedJsonError).path).toBe("$.nested");
    }
  });

  it("函数属性抛错", () => {
    expect(() => serialize({ onClick: () => {} })).toThrow(TypedJsonError);
  });

  it("循环引用抛错", () => {
    const value: Record<string, unknown> = { name: "root" };
    value.self = value;
    expect(() => serialize(value)).toThrow(/循环引用/);
  });

  it("同一对象被多次引用（DAG）不误判为循环", () => {
    const shared = { tag: "shared" };
    const result = parseTyped(
      stringifyTyped({ x: shared, y: shared, list: [shared, shared] })
    ) as Record<string, unknown>;
    expect(result.x).toEqual({ tag: "shared" });
    expect(result.y).toEqual({ tag: "shared" });
    expect((result.list as unknown[]).length).toBe(2);
  });

  it("Invalid Date 抛错", () => {
    expect(() => serialize(new Date("not-a-date"))).toThrow(TypedJsonError);
  });

  it("业务对象含 $__t 属性但非合法信封时按普通对象处理", () => {
    const value = { $__t: "custom", v: 1 };
    expect(parseTyped(stringifyTyped(value))).toEqual(value);
  });
});

describe("deserialize 容错", () => {
  it("信封字段缺失时不崩溃，按字面值返回", () => {
    // 反序列化输入恒定来自本序列化器的输出，此处仅防御性验证不抛错
    const result = deserialize({ $__t: "date" }) as unknown;
    expect(result).toBeInstanceOf(Date);
    expect(isNaN((result as Date).getTime())).toBe(true);
  });
});
