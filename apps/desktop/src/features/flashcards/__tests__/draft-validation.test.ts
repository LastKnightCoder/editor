import { describe, expect, it } from "vitest";
import type { PluginFlashcardDraft } from "@tau/plugins";
import type { Flashcard } from "@/types";
import { assertFlashcardDraft } from "../validateDraft";
import { emptyForm, validate } from "../editorModel";
import { parseFlashcardResponse } from "../generation/parse";
import { judgeAnswer } from "../model";

const blank = {
  type: "flashcard-blank",
  blankId: "capital",
  answer: "Paris",
  children: [{ text: "Paris" }],
};
const draftWith = (nodes: object[]): PluginFlashcardDraft => ({
  type: "cloze",
  prompt: [{ type: "paragraph", children: nodes }] as PluginFlashcardDraft["prompt"],
  data: {},
});

describe("填空草稿与表单校验", () => {
  it.each([
    ["缺少标识", { ...blank, blankId: undefined }],
    ["空标识", { ...blank, blankId: " " }],
    ["缺少答案", { ...blank, answer: undefined }],
    ["空答案", { ...blank, answer: " " }],
    ["非文本答案", { ...blank, answer: 123 }],
    ["错误备选答案容器", { ...blank, alternativeAnswers: "巴黎" }],
    ["非文本备选答案", { ...blank, alternativeAnswers: [null] }],
    ["空备选答案", { ...blank, alternativeAnswers: [" "] }],
  ])("%s 在插件、模型和编辑保存入口均被拒绝", (_name, node) => {
    const draft = draftWith([node]);
    expect(() => assertFlashcardDraft(draft)).toThrow("填空");
    expect(() => parseFlashcardResponse(JSON.stringify([draft]))).toThrow("填空");
    expect(validate({ ...emptyForm(1, "cloze"), prompt: draft.prompt })).toMatch(/填空/);
  });

  it("拒绝嵌套在不同段落中的重复填空标识", () => {
    const draft = draftWith([blank]);
    draft.prompt.push({
      type: "blockquote",
      children: draftWith([{ ...blank }]).prompt,
    } as PluginFlashcardDraft["prompt"][number]);
    expect(() => assertFlashcardDraft(draft)).toThrow("标识不能重复");
    expect(() => parseFlashcardResponse(JSON.stringify([draft]))).toThrow("标识不能重复");
  });

  it("有效富文本与模型文本填空保留正常判分和备选答案", () => {
    const rich = draftWith([{ ...blank, alternativeAnswers: ["巴黎"] }]);
    expect(() => assertFlashcardDraft(rich)).not.toThrow();
    expect(judgeAnswer(rich as Flashcard, { cloze: { capital: " PARIS " } })).toBe(true);
    expect(judgeAnswer(rich as Flashcard, { cloze: { capital: "巴黎" } })).toBe(true);
    expect(judgeAnswer(rich as Flashcard, { cloze: { capital: "伦敦" } })).toBe(false);
    expect(
      parseFlashcardResponse(
        JSON.stringify([{ type: "cloze", prompt: "法国首都是{{blank:巴黎}}", data: {} }])
      )
    ).toHaveLength(1);
  });
});
