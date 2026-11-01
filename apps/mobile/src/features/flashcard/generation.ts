import type { PluginFlashcardDraft } from "@tau/plugins";
import { assertContentNodes } from "@tau/plugins/content-input";
import type { Descendant } from "slate";
import { genId } from "./cardDraft";

export const FLASHCARD_GENERATION_PROMPT = `你是一位专业的教育内容设计师。根据用户提供的资料生成 3–10 张用于间隔重复学习的闪卡。
每张卡聚焦一个知识点，题目必须独立完整，不使用“根据原文”等指代，答案以资料为依据，不能编造。
尽量混合使用以下题型：
- qa：问答题，data.answer 为非空参考答案。
- boolean：判断题，data.booleanAnswer 为布尔值。
- single-choice：单选题，data.options 至少两个选项且恰好一个正确。
- multiple-choice：多选题，data.options 至少两个选项且至少两个正确。
- cloze：填空题，在 prompt 中用 {{blank:答案}} 标记填空。
选项格式为 {"id":"1","label":"选项内容","isCorrect":true}，同题选项 id 不重复。
只输出 JSON 数组，每项格式如下，不要包含解释或 Markdown 围栏：
{"type":"qa","prompt":"题干文本","detail":"背面补充，可为空","difficulty":"standard","tags":[],"data":{"answer":"参考答案","hint":"提示，可为空","explanation":"解析，可为空"}}
difficulty 只允许 foundation、standard、advanced。prompt 和 detail 使用字符串，tags 为字符串数组。`;

function promptNodes(text: string, cloze = false): Descendant[] {
  return text.split("\n").map(line => {
    const children: Extract<Descendant, { type: "paragraph" }>["children"] = [];
    let offset = 0;
    if (cloze) {
      for (const match of line.matchAll(/\{\{blank:([^}]+)\}\}/g)) {
        children.push({ type: "formatted", text: line.slice(offset, match.index) });
        const answer = match[1].trim();
        children.push({
          type: "flashcard-blank",
          blankId: genId(),
          answer,
          placeholder: "",
          alternativeAnswers: [],
          children: [{ type: "formatted", text: answer }],
        });
        offset = match.index + match[0].length;
      }
    }
    children.push({ type: "formatted", text: line.slice(offset) });
    return { type: "paragraph", children };
  });
}

/** 模型输出先转为宿主节点，调用方再按保存协议校验整批草稿。 */
export function parseMobileFlashcardResponse(text: string): PluginFlashcardDraft[] {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const parsed: unknown = JSON.parse(cleaned);
  if (!Array.isArray(parsed) || !parsed.length) throw new Error("模型未返回有效的闪卡数组");
  return parsed.map((value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("闪卡结果格式无效");
    const card = value as Omit<PluginFlashcardDraft, "prompt" | "detail"> & {
      prompt: unknown;
      detail?: unknown;
    };
    const prompt =
      typeof card.prompt === "string"
        ? promptNodes(card.prompt, card.type === "cloze")
        : card.prompt;
    const detail = typeof card.detail === "string" ? promptNodes(card.detail) : card.detail;
    assertContentNodes(prompt);
    if (detail !== undefined) assertContentNodes(detail);
    return {
      type: card.type,
      prompt,
      detail,
      data: card.data,
      difficulty: card.difficulty ?? "standard",
      tags: card.tags ?? [],
    };
  });
}
