/**
 * 项目页视图：共享驾驶舱（features/shared/cockpit）的项目模块装配。
 *
 * 2026-09-28 拆分后「项目」即文档树，不再有类型筛选与类型三选新建；
 * 数据表格与 Vibe Learning 已各自独立为顶级模块（features/databases、
 * features/vibe-learning），列表形态仍共用同一套驾驶舱组件。
 */

import { useMemo } from "react";
import { FolderTree } from "lucide-react";
import { usePage } from "@/page/PageProvider";
import BatchExportModal from "@/components/BatchExportModal";
import { EntityCockpit } from "@/features/shared/cockpit/EntityCockpit";
import type { CockpitCopy, CockpitItem, CockpitVisual } from "@/features/shared/cockpit/types";
import { useProjectsSnapshot, useProjectMutations } from "../queries";

/* 模块色沿用原 projectTypeMeta 的文档树青蓝（设计定稿的数据色，出处
   mockups/projects/plan-c-cockpit.html，不进主题词表） */
const VISUAL: CockpitVisual = {
  icon: FolderTree,
  softClass: "bg-[rgba(63,133,124,0.13)]",
  textClass: "text-[#3f857c]",
  barClass: "bg-gradient-to-r from-[#3f857c] to-transparent",
};

const COPY: CockpitCopy = {
  title: "项目",
  badgeLabel: "文档树",
  entityUnit: "个项目",
  metricUnit: "个文档",
  createLabel: "新建项目",
  createTitle: "新建项目",
  editTitle: "编辑项目",
  descPlaceholder: "介绍一下这个项目",
  emptyTitle: "还没有项目",
  emptyHint: "从一个文档树开始，把资料组织成可检索的知识结构",
  deleteTitle: "删除项目",
  deleteDescription: "项目将被永久删除。",
  deleteImpact: "仅属于此项目的子项将一并删除；其他项目共用的子项会保留。删除后不可恢复。",
};

export function ProjectsView() {
  const { navigator } = usePage();
  const snapshot = useProjectsSnapshot();
  const mutations = useProjectMutations();

  const items: CockpitItem[] = useMemo(
    () => snapshot.projects.map(project => ({ ...project, metric: project.itemCount })),
    [snapshot.projects]
  );

  return (
    <EntityCockpit
      items={items}
      loading={snapshot.loading}
      visual={VISUAL}
      copy={COPY}
      mutations={mutations}
      onOpen={id => navigator.push("project-detail", { id })}
      onCreated={created => navigator.push("project-detail", { id: created.id })}
      renderExport={(item, close) => (
        <BatchExportModal
          open
          onClose={close}
          scope={{ type: "project", id: item.id, title: item.title }}
        />
      )}
    />
  );
}
