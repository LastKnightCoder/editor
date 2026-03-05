import { describe, expect, it } from "vitest";
import { getToolCallRenderer, unregisterToolCallRenderer } from "@tau/shared";
import { initToolCallRenderers } from "../builtin";
import { ASK_QUESTION_TOOL_NAME } from "@/tools/askQuestionTypes";

describe("tool-call renderer registry", () => {
  it("初始化后注册 ask-question 渲染器", () => {
    unregisterToolCallRenderer(ASK_QUESTION_TOOL_NAME);
    initToolCallRenderers();
    const renderer = getToolCallRenderer(ASK_QUESTION_TOOL_NAME);
    expect(renderer).toBeTypeOf("function");
  });
});
