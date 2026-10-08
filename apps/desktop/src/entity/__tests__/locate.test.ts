import { describe, expect, it } from "vitest";
import { parseEntityLocation, resolveLocationNode, serializeEntityLocation } from "../locate";

describe("实体位置参数", () => {
  it("块序号往返", () => {
    expect(parseEntityLocation(serializeEntityLocation({ block: 0 }))).toEqual({ block: 0 });
    expect(parseEntityLocation(serializeEntityLocation({ block: 7 }))).toEqual({ block: 7 });
  });
  it("勾选项往返", () => {
    expect(parseEntityLocation(serializeEntityLocation({ taskId: "t1" }))).toEqual({
      taskId: "t1",
    });
  });
  it.each([
    undefined,
    "",
    "{",
    "null",
    "[]",
    '{"block":-1}',
    '{"block":1.5}',
    '{"quote":1}',
    '{"taskId":""}',
  ])("非法地址降级：%s", value => {
    expect(parseEntityLocation(value)).toBeNull();
  });
});

describe("resolveLocationNode", () => {
  const nested = { type: "check-list-item", taskId: "deep", children: [] };
  const doc = [
    { type: "paragraph", children: [] },
    {
      type: "check-list",
      children: [
        {
          type: "check-list-item",
          taskId: "top",
          children: [{ type: "check-list", children: [nested] }],
        },
      ],
    },
  ];
  it("按 taskId 找到嵌套勾选项", () => {
    expect(resolveLocationNode(doc, { taskId: "deep" })).toBe(nested);
  });
  it("找不到或越界退到首块", () => {
    expect(resolveLocationNode(doc, { taskId: "none" })).toBe(doc[0]);
    expect(resolveLocationNode(doc, { block: 9 })).toBe(doc[0]);
    expect(resolveLocationNode(doc, { block: 1 })).toBe(doc[1]);
  });
});
