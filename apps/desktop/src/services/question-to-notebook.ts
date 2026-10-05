/**
 * 以此立项（Q5）：问题升级为 Notebook 课题，材料作为资源一次性带入（之后不同步），谱系记 upgraded_to。
 *
 * - 卡片 / 文章 / 项目文档 / 答案 → 笔记资源（按正文去重）；
 * - 摘录与 PDF 标注合并成一份「外部材料」资源，剪藏每条一份；
 * - 项目、白板、对话没有对应的资源类型，不带入（确认时告知数量）。
 * 部分资源失败不回滚已建的项目，返回失败数由调用方提示。
 */

import { recordLineage } from "@/commands/lineage";
import { updateQuestionStatus } from "@/commands/question";
import { createVLResource, addVLIndexTask, ensureVLNoteResource } from "@/commands/vibe-learning";
import { createVibeLearningProject } from "@/commands/vibe-learning-project";
import type { MaterialRef } from "@/entity/material";
import { queryClient } from "@/queryClient";
import type { QuestionDetail, QuestionMaterial } from "@/types";
import type { MaterialSourceMeta } from "@/types/vibe-learning";

interface NoteResourcePlan {
  contentId: number;
  title: string;
  noteType: string;
  originalId: number;
}

export interface NotebookPlan {
  notes: NoteResourcePlan[];
  /** 合并成一份资源的摘录与 PDF 标注 */
  excerpts: MaterialRef[];
  /** 各成一份资源的剪藏 */
  clips: Array<{ ref: MaterialRef; title: string }>;
  /** 不能带入的条目数（项目、白板、对话，以及已删除的材料） */
  skipped: number;
}

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

/** 将带入的资源份数（摘录合并为一份） */
export const plannedResourceCount = (plan: NotebookPlan) =>
  plan.notes.length + (plan.excerpts.length ? 1 : 0) + plan.clips.length;

async function addMaterialResource(
  projectId: number,
  mainDbName: string,
  name: string,
  meta: MaterialSourceMeta
) {
  const resource = await createVLResource({
    projectId,
    name: `${name}.md`,
    originalPath: `material://${projectId}/${encodeURIComponent(name)}`,
    resourceType: "md",
    sourceType: "material",
    sourceMetaInfo: JSON.stringify(meta),
  });
  await addVLIndexTask({
    resourceId: resource.id,
    projectId,
    mainDbName,
    originalPath: resource.originalPath,
    resourceName: resource.name,
    type: "full",
  });
}

export async function upgradeQuestionToNotebook(
  detail: QuestionDetail,
  mainDbName: string
): Promise<{ projectId: number; failed: number }> {
  const { question } = detail;
  const title = question.questionContent.trim() || "未命名课题";
  const project = await createVibeLearningProject({
    title,
    ...(question.description?.length ? { desc: question.description } : {}),
  });
  void queryClient.invalidateQueries({ queryKey: ["vibe-learning"] });
  await recordLineage({
    src: { kind: "question", id: question.id },
    dst: { kind: "vl-project", id: project.id },
    relation: "upgraded_to",
  });

  const plan = planNotebookResources(detail);
  const tasks: Array<() => Promise<unknown>> = [
    ...plan.notes.map(
      note => () => ensureVLNoteResource({ projectId: project.id, mainDbName, ...note })
    ),
    ...(plan.excerpts.length
      ? [
          () =>
            addMaterialResource(
              project.id,
              mainDbName,
              `${title} · 摘录（${plan.excerpts.length} 条）`,
              {
                title: `${title} · 摘录`,
                refs: plan.excerpts,
              }
            ),
        ]
      : []),
    ...plan.clips.map(
      clip => () =>
        addMaterialResource(project.id, mainDbName, clip.title, {
          title: clip.title,
          refs: [clip.ref],
        })
    ),
  ];
  let failed = 0;
  for (const task of tasks) {
    try {
      await task();
    } catch (error) {
      failed += 1;
      console.error("[question-to-notebook] 带入资源失败", error);
    }
  }

  if (question.status === "not_started") {
    await updateQuestionStatus(question.id, "in_progress", {
      mutationSource: "question-to-notebook",
    }).catch(() => undefined);
  }
  return { projectId: project.id, failed };
}
