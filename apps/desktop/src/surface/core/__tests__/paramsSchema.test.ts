import { describe, expect, it } from "vitest";
import {
  createSurfaceSchema,
  paramNumber,
  paramOptional,
  paramString,
  sanitizeParams,
} from "../paramsSchema";

const schema = createSurfaceSchema({
  cardId: paramNumber(),
  keyword: paramOptional(paramString()),
  page: paramOptional(paramNumber(), 1),
});

describe("paramsSchema 运行时净化", () => {
  it("必填缺失整体拒绝", () => {
    expect(sanitizeParams(schema.schema, {})).toBeNull();
    expect(sanitizeParams(schema.schema, undefined)).toBeNull();
  });

  it("未知键被丢弃，不透传到栈与持久化", () => {
    const clean = sanitizeParams(schema.schema, { cardId: 7, evil: "<script>" })!;
    expect(clean).toEqual({ cardId: 7, page: 1 });
  });

  it("可选键缺省省略；带默认值则回填", () => {
    const clean = sanitizeParams(schema.schema, { cardId: 7 })!;
    expect(clean).toEqual({ cardId: 7, page: 1 });
  });

  it("number 接受数字与纯数字字符串，拒绝 NaN/垃圾串", () => {
    expect(sanitizeParams(schema.schema, { cardId: "42" })!.cardId).toBe(42);
    expect(sanitizeParams(schema.schema, { cardId: "abc" })).toBeNull();
    expect(sanitizeParams(schema.schema, { cardId: Number.NaN })).toBeNull();
  });

  it("类型不符直接拒绝（不做静默转换）", () => {
    expect(sanitizeParams(schema.schema, { cardId: true })).toBeNull();
    expect(sanitizeParams(schema.schema, { cardId: 1, keyword: 123 })).toBeNull();
  });
});
