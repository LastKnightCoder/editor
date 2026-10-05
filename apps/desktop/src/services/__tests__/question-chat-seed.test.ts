import { describe, expect, it, vi } from "vitest";

vi.mock("@/commands/question", () => ({ getQuestionDetail: vi.fn(), linkQuestionChat: vi.fn() }));
vi.mock("@/commands/lineage", () => ({ recordLineage: vi.fn() }));

import type { QuestionDetail } from "@/types";
import { applyQuestionSeed, questionSeedText } from "../question-chat-seed";

const detail = {
  question: {
    questionContent: "为什么地方财政依赖土地",
    description: [
      { type: "paragraph", children: [{ type: "formatted", text: "读《置身事内》时" }] },
    ],
  },
  materials: [
    { targetType: "card", title: "分税制", meta: "", missing: false },
    { targetType: "excerpt", title: "土地财政", meta: "微信读书 · 《置身事内》", missing: false },
    { targetType: "article", title: "已删", meta: "", missing: true },
  ],
} as unknown as QuestionDetail;

describe("围绕问题发起对话", () => {
  it("上下文：问题、背景、材料清单（跳过已删除）", () => {
    expect(questionSeedText(detail)).toBe(
      [
        "> 围绕问题：为什么地方财政依赖土地",
        "> 背景：读《置身事内》时",
        "> 已有材料：",
        "> - 卡片 · 分税制",
        "> - 划线 · 土地财政（微信读书 · 《置身事内》）",
      ].join("\n")
    );
  });

  it("前置到第一段文字；没有文字时单独成段", () => {
    expect(applyQuestionSeed([{ type: "text", text: "先说结论" }], "> 上下文")).toEqual([
      { type: "text", text: "> 上下文\n\n先说结论" },
    ]);
    expect(applyQuestionSeed([], "> 上下文")).toEqual([{ type: "text", text: "> 上下文" }]);
  });
});
