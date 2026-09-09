import { describe, expect, it } from "vitest";
import type { InferFields } from "../paramsSchema";
import { boolean, number, object, oneOf, optional, sanitizeParams, string } from "../paramsSchema";

const todoDetailSchema = {
  todoId: number(),
  groupId: optional(number()),
  title: string(""),
  urgent: boolean(false),
  source: optional(oneOf("diary", "preview", "link")),
  ui: optional(
    object({
      scrollTop: number(0),
      panelState: optional(oneOf("normal", "full")),
    })
  ),
} as const;

type TodoDetailParams = InferFields<typeof todoDetailSchema>;

describe("router/core/paramsSchema 类型推导", () => {
  it("应推导出正确的可选/必填结构", () => {
    const params: TodoDetailParams = {
      todoId: 1,
      groupId: undefined,
      title: "x",
      urgent: true,
      source: "diary",
      ui: { scrollTop: 3, panelState: undefined },
    };
    expect(params.todoId).toBe(1);
  });
});

describe("router/core/paramsSchema 运行时净化", () => {
  it("合法输入原样通过", () => {
    const result = sanitizeParams(todoDetailSchema, {
      todoId: 5,
      groupId: 2,
      title: "任务",
      urgent: true,
    });
    expect(result).toEqual({
      todoId: 5,
      groupId: 2,
      title: "任务",
      urgent: true,
    });
  });

  it("必填字段缺失或非法时整体拒绝", () => {
    expect(sanitizeParams(todoDetailSchema, {})).toBeNull();
    expect(sanitizeParams(todoDetailSchema, { todoId: "not-a-number" })).toBeNull();
  });

  it("类型不符回退 default，无 default 的可选字段丢弃", () => {
    const result = sanitizeParams(todoDetailSchema, {
      todoId: 3,
      groupId: "abc",
      title: 42,
      source: "invalid-source",
    });
    expect(result).toEqual({ todoId: 3, title: "", urgent: false });
  });

  it("嵌套对象递归净化且丢弃 schema 外字段", () => {
    const result = sanitizeParams(todoDetailSchema, {
      todoId: 3,
      evilField: "<script>",
      ui: { scrollTop: "bad", panelState: "full", extra: 1 },
    });
    expect(result).toEqual({
      todoId: 3,
      title: "",
      urgent: false,
      ui: { scrollTop: 0, panelState: "full" },
    });
  });

  it("非对象输入直接拒绝", () => {
    expect(sanitizeParams(todoDetailSchema, null)).toBeNull();
    expect(sanitizeParams(todoDetailSchema, "todoId=1")).toBeNull();
  });
});
