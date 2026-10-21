/**
 * 以此立项（Q5）：问题升级为 Notebook 课题，探究材料作为资料带入（通用逻辑见 notebook-creation）。
 *
 * - 卡片 / 文章 / 项目文档 / 答案 → 笔记资源；摘录与 PDF 标注合并、剪藏各一份；
 * - 项目、白板、对话没有对应的资源类型，不带入（确认时告知数量）。
 */

import { updateQuestionStatus } from "@/commands/question";
import type { QuestionDetail, QuestionMaterial } from "@/types";
import { createNotebookWithResources, type NotebookPlan } from "./notebook-creation";

export { plannedResourceCount, type NotebookPlan } from "./notebook-creation";

const NOTE_TYPE: Partial<Record<QuestionMaterial["targetType"], string>> = {
  card: "card",
  article: "article",
  project_item: "project-item",
  answer: "answer",
};

export function planNotebookResources(detail: Pick<QuestionDetail, "materials" | "chats">) {
  const plan: NotebookPlan = { notes: [], excerpts: [], clips: [], skipped: detail.chats.length };
  for (const material of detail.materials) {
    const noteType = NOTE_TYPE[material.targetType];
    if (material.missing) {
      plan.skipped += 1;
    } else if (noteType && material.contentId != null) {
      plan.notes.push({
        contentId: material.contentId,
        title: material.title,
        noteType,
        originalId: material.targetId,
      });
    } else if (material.targetType === "excerpt" || material.targetType === "pdf-annotation") {
      plan.excerpts.push({ kind: material.targetType, id: material.targetId });
    } else if (material.targetType === "web-clip") {
      plan.clips.push({ ref: { kind: "web-clip", id: material.targetId }, title: material.title });
    } else {
      plan.skipped += 1;
    }
  }
  return plan;
}

export async function upgradeQuestionToNotebook(
  detail: QuestionDetail,
  mainDbName: string
): Promise<{ projectId: number; failed: number }> {
  const { question } = detail;
  const result = await createNotebookWithResources({
    title: question.questionContent,
    ...(question.description?.length ? { desc: question.description } : {}),
    plan: planNotebookResources(detail),
    from: { kind: "question", id: question.id },
    mainDbName,
  });
  if (question.status === "not_started") {
    await updateQuestionStatus(question.id, "in_progress", {
      mutationSource: "question-to-notebook",
    }).catch(() => undefined);
  }
  return result;
}
