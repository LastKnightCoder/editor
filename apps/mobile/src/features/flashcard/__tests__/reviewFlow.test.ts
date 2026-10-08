// reviewFlow 判分纯函数单测：对齐桌面 ReviewModal checkAnswer 行为。

import { describe, expect, it } from "vitest";
import { canSubmitAnswer, checkAnswer, extractBlanks } from "../reviewFlow";
import type { Flashcard } from "../types";

function makeCard(partial: Partial<Flashcard>): Flashcard {
  return {
    id: 1,
    deckId: 1,
    type: "single-choice",
    prompt: [],
    detail: [],
    data: {},
    tags: [],
    difficulty: "standard",
    dueTime: 0,
    lastReviewTime: null,
    reviewCount: 0,
    memoryStability: null,
    memoryDifficulty: null,
    status: "new",
    references: [],
    createTime: 0,
    updateTime: 0,
    ...partial,
  };
}

describe("checkAnswer", () => {
  it("单选题：比对正确选项 id", () => {
    const card = makeCard({
      data: {
        options: [
          { id: "a", label: "SYN", isCorrect: false },
          { id: "b", label: "SYN+ACK", isCorrect: true },
        ],
      },
    });
    expect(checkAnswer(card, { singleChoice: "b" })).toBe(true);
    expect(checkAnswer(card, { singleChoice: "a" })).toBe(false);
    expect(checkAnswer(card, {})).toBe(false);
  });

  it("多选题：集合完全一致才判对", () => {
    const card = makeCard({
      type: "multiple-choice",
      data: {
        options: [
          { id: "a", label: "归并", isCorrect: true },
          { id: "b", label: "计数", isCorrect: false },
          { id: "c", label: "快排", isCorrect: true },
        ],
      },
    });
    expect(checkAnswer(card, { multipleChoice: ["a", "c"] })).toBe(true);
    expect(checkAnswer(card, { multipleChoice: ["a"] })).toBe(false);
    expect(checkAnswer(card, { multipleChoice: ["a", "b", "c"] })).toBe(false);
  });

  it("填空题：trim + 大小写不敏感，支持备选答案", () => {
    const card = makeCard({
      type: "cloze",
      prompt: [
        {
          type: "paragraph",
          children: [
            { type: "formatted", text: "复杂度为 " },
            {
              type: "flashcard-blank",
              blankId: "b1",
              answer: "O(n²)",
              placeholder: "",
              alternativeAnswers: ["O(n*n)"],
            },
          ],
        },
      ] as unknown[],
    });
    expect(checkAnswer(card, { cloze: { b1: " o(N²) " } })).toBe(true);
    expect(checkAnswer(card, { cloze: { b1: "O(n*n)" } })).toBe(true);
    expect(checkAnswer(card, { cloze: { b1: "O(n)" } })).toBe(false);
    expect(checkAnswer(card, { cloze: {} })).toBe(false);
  });

  it("填空题：全部空都答对才判对", () => {
    const card = makeCard({
      type: "cloze",
      prompt: [
        {
          type: "paragraph",
          children: [
            { type: "flashcard-blank", blankId: "b1", answer: "A", placeholder: "" },
            { type: "flashcard-blank", blankId: "b2", answer: "B", placeholder: "" },
          ],
        },
      ] as unknown[],
    });
    expect(checkAnswer(card, { cloze: { b1: "A", b2: "B" } })).toBe(true);
    expect(checkAnswer(card, { cloze: { b1: "A", b2: "C" } })).toBe(false);
  });

  it("判断题：与 booleanAnswer 严格比对", () => {
    const card = makeCard({ type: "boolean", data: { booleanAnswer: true } });
    expect(checkAnswer(card, { boolean: true })).toBe(true);
    expect(checkAnswer(card, { boolean: false })).toBe(false);
    expect(checkAnswer(card, {})).toBe(false);
  });

  it("问答题：恒 true（自评）", () => {
    const card = makeCard({ type: "qa", data: { answer: "参考答案" } });
    expect(checkAnswer(card, { qa: "随便写" })).toBe(true);
    expect(checkAnswer(card, {})).toBe(true);
  });
});

describe("canSubmitAnswer", () => {
  it("问答题允许直接翻面自评，填空要求每空非空", () => {
    const qa = makeCard({ type: "qa" });
    expect(canSubmitAnswer(qa, {})).toBe(true);
    const cloze = makeCard({
      type: "cloze",
      prompt: [
        {
          type: "paragraph",
          children: [{ type: "flashcard-blank", blankId: "b1", answer: "A", placeholder: "" }],
        },
      ] as unknown[],
    });
    expect(canSubmitAnswer(cloze, {})).toBe(false);
    expect(canSubmitAnswer(cloze, { cloze: { b1: "A" } })).toBe(true);
  });
});

describe("extractBlanks", () => {
  it("递归提取嵌套的 flashcard-blank 元素", () => {
    const prompt = [
      {
        type: "paragraph",
        children: [
          { type: "formatted", text: "前" },
          {
            type: "flashcard-blank",
            blankId: "b1",
            answer: "一",
            placeholder: "p1",
            alternativeAnswers: ["1"],
          },
          { type: "formatted", text: "后" },
        ],
      },
    ];
    const blanks = extractBlanks(prompt);
    expect(blanks).toHaveLength(1);
    expect(blanks[0]).toMatchObject({
      blankId: "b1",
      answer: "一",
      placeholder: "p1",
      alternativeAnswers: ["1"],
    });
  });
});
