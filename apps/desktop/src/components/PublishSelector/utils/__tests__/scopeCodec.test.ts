import { describe, expect, it } from "vitest";
import { decodeScope, encodeScope } from "../scopeCodec";

describe("发布范围编解码", () => {
  it("空串视为从未设置范围（全量）", () => {
    expect(decodeScope("")).toEqual({ mode: "all" });
  });

  it("合法 partial 结构往返一致", () => {
    const scope = decodeScope('{"mode":"partial","nodes":[3,1]}');
    expect(scope).toEqual({ mode: "partial", nodeIds: new Set([3, 1]) });
    expect(encodeScope(scope)).toBe('{"mode":"partial","nodes":[3,1]}');
  });

  it("非数字节点被过滤，不产生损坏标记", () => {
    expect(decodeScope('{"mode":"partial","nodes":[1,"a",null]}')).toEqual({
      mode: "partial",
      nodeIds: new Set([1]),
    });
  });

  it("损坏 JSON 与非法结构按空范围处理并打损坏标记", () => {
    expect(decodeScope("{broken")).toEqual({
      mode: "partial",
      nodeIds: new Set(),
      corrupted: true,
    });
    expect(decodeScope('{"mode":"all"}')).toEqual({
      mode: "partial",
      nodeIds: new Set(),
      corrupted: true,
    });
    expect(decodeScope('{"mode":"partial","nodes":"3"}')).toEqual({
      mode: "partial",
      nodeIds: new Set(),
      corrupted: true,
    });
  });

  it("全量编码为空串", () => {
    expect(encodeScope({ mode: "all" })).toBe("");
  });
});
