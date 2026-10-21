/**
 * 带资料新建 Notebook：资料一次性带入（之后不同步），来源记谱系 upgraded_to。
 *
 * - 卡片 / 文章 / 项目文档 / 插件内容等有正文的内容 → 笔记资源（按正文去重）；
 * - 摘录与 PDF 标注合并成一份「外部材料」资源，剪藏每条一份。
 * 部分资源失败不回滚已建的 Notebook，返回失败数由调用方提示。
 */

import { recordLineage } from "@/commands/lineage";
import { createVLResource, addVLIndexTask, ensureVLNoteResource } from "@/commands/vibe-learning";
import { createVibeLearningProject } from "@/commands/vibe-learning-project";
import type { LineageNode } from "@/entity/lineage";
import { queryClient } from "@/queryClient";
import type { Descendant } from "slate";
import type { MaterialSourceMeta, NotebookPlan } from "@/types/vibe-learning";

export type { NotebookNotePlan, NotebookPlan } from "@/types/vibe-learning";

/** 将带入的资源份数（摘录合并为一份） */
export const plannedResourceCount = (plan: NotebookPlan) =>
  plan.notes.length + (plan.excerpts.length ? 1 : 0) + plan.clips.length;

/** 确认框的影响行：带入几份、几项带不进去 */
export const notebookPlanImpact = (plan: NotebookPlan) => {
  const count = plannedResourceCount(plan);
  return [
    count ? `带入 ${count} 份资料` : "没有可带入的资料",
    plan.skipped ? `${plan.skipped} 项（项目、白板、对话或已删除的内容）不会带入` : "",
  ]
    .filter(Boolean)
    .join("；");
};

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

export async function createNotebookWithResources(options: {
  title: string;
  desc?: Descendant[];
  plan: NotebookPlan;
  /** 由什么立项：记谱系 upgraded_to，Notebook 页顶部显示 */
  from?: LineageNode;
  mainDbName: string;
}): Promise<{ projectId: number; failed: number }> {
  const { plan, mainDbName } = options;
  const title = options.title.trim() || "未命名课题";
  const project = await createVibeLearningProject({
    title,
    ...(options.desc?.length ? { desc: options.desc } : {}),
  });
  void queryClient.invalidateQueries({ queryKey: ["vibe-learning"] });
  if (options.from)
    await recordLineage({
      src: options.from,
      dst: { kind: "vl-project", id: project.id },
      relation: "upgraded_to",
    });

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
              { title: `${title} · 摘录`, refs: plan.excerpts }
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
      console.error("[notebook-creation] 带入资源失败", error);
    }
  }
  return { projectId: project.id, failed };
}
