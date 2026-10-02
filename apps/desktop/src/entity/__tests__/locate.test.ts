import { describe, expect, it } from "vitest";
import { parseEntityLocation, serializeEntityLocation } from "../locate";

describe("实体位置参数", () => {
  it("块序号与谱系锚点往返", () => {
    expect(parseEntityLocation(serializeEntityLocation({ block: 0 }))).toEqual({ block: 0 });
    expect(parseEntityLocation(serializeEntityLocation({ quote: 12 }))).toEqual({ quote: 12 });
  });
  it.each([
    undefined,
    "",
    "{",
    "null",
    "[]",
    '{"block":-1}',
    '{"block":1.5}',
    '{"quote":0}',
    '{"quote":"1"}',
  ])("非法地址降级：%s", value => {
    expect(parseEntityLocation(value)).toBeNull();
  });
});
