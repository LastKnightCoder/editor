import type { PluginFlashcardDraft } from "@tau/plugins";
import type { Descendant } from "slate";
import { emptyForm, validate } from "./editorModel";

function validNodes(nodes: unknown): nodes is Descendant[] {
  return (
    Array.isArray(nodes) &&
    nodes.every(
      node =>
        node &&
        typeof node === "object" &&
        (typeof node.text === "string" ||
          (typeof node.type === "string" && validNodes(node.children)))
    )
  );
}

export function assertFlashcardDraft(draft: PluginFlashcardDraft) {
  if (!["qa", "boolean", "cloze", "single-choice", "multiple-choice"].includes(draft.type))
    throw new Error("闪卡题型无效");
  if (!validNodes(draft.prompt) || (draft.detail !== undefined && !validNodes(draft.detail)))
    throw new Error("闪卡富文本格式无效");
  if (
    draft.difficulty !== undefined &&
    !["foundation", "standard", "advanced"].includes(draft.difficulty)
  )
    throw new Error("闪卡难度无效");
  if (
    draft.tags !== undefined &&
    (!Array.isArray(draft.tags) || draft.tags.some(tag => typeof tag !== "string"))
  )
    throw new Error("闪卡标签无效");
  if (!draft.data || typeof draft.data !== "object" || Array.isArray(draft.data))
    throw new Error("闪卡答案格式无效");
  for (const key of ["answer", "explanation", "hint", "referenceNotes"] as const) {
    if (draft.data[key] !== undefined && typeof draft.data[key] !== "string")
      throw new Error("闪卡答案格式无效");
  }
  if (draft.data.booleanAnswer !== undefined && typeof draft.data.booleanAnswer !== "boolean")
    throw new Error("判断题答案无效");
  if (
    draft.data.options !== undefined &&
    (!Array.isArray(draft.data.options) ||
      draft.data.options.some(
        option =>
          !option ||
          typeof option.id !== "string" ||
          typeof option.label !== "string" ||
          typeof option.isCorrect !== "boolean"
      ))
  )
    throw new Error("闪卡选项无效");
  if (
    draft.data.blanks !== undefined &&
    (!Array.isArray(draft.data.blanks) ||
      draft.data.blanks.some(
        blank =>
          !blank ||
          typeof blank.id !== "string" ||
          typeof blank.answer !== "string" ||
          typeof blank.placeholder !== "string" ||
          (blank.alternativeAnswers !== undefined &&
            (!Array.isArray(blank.alternativeAnswers) ||
              blank.alternativeAnswers.some(
                answer => typeof answer !== "string" || !answer.trim()
              )))
      ))
  )
    throw new Error("闪卡填空无效");
  if (
    draft.references !== undefined &&
    (!Array.isArray(draft.references) ||
      draft.references.some(
        reference =>
          !reference ||
          typeof reference.title !== "string" ||
          !reference.title.trim() ||
          (reference.refType === "content"
            ? typeof reference.contentId !== "number" ||
              !Number.isSafeInteger(reference.contentId) ||
              reference.contentId <= 0
            : reference.refType !== "custom" || !validNodes(reference.customContent))
      ))
  )
    throw new Error("闪卡参考资料无效");
  const error = validate({ ...emptyForm(1, draft.type), ...draft, references: [] });
  if (error) throw new Error(error);
}
