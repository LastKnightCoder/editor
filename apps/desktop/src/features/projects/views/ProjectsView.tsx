/**
 * 项目页视图：共享驾驶舱（features/shared/cockpit）的项目模块装配。
 *
 * 项目即文档树。打开项目时，有上次停留的文档就直接定位过去（续读）。
 */

import { useProjectsI18n } from "../i18n";
import { useMemo } from "react";
import { FolderTree } from "lucide-react";
import { usePage } from "@/page/PageProvider";
import BatchExportModal from "@/components/BatchExportModal";
import { EntityCockpit } from "@/features/shared/cockpit/EntityCockpit";
import type { CockpitCopy, CockpitItem, CockpitVisual } from "@/features/shared/cockpit/types";
import { useProjectsSnapshot, useProjectMutations } from "../queries";
import { useImportDrop } from "@/features/transfer/useImportDrop";

/* 模块色沿用原 projectTypeMeta 的文档树青蓝（数据色，不进主题词表） */
const VISUAL: CockpitVisual = {
  icon: FolderTree,
  softClass: "bg-[rgba(63,133,124,0.13)]",
  textClass: "text-[#3f857c]",
  barClass: "bg-gradient-to-r from-[#3f857c] to-transparent",
};

export function ProjectsView() {
  const { t } = useProjectsI18n();
  const copy: CockpitCopy = {
    title: t("title"),
    itemTitle: id => t("item.fallback", { id }),
    entityCount: (count, amount) => t("entity.count", { count, amount }),
    metricCount: (count, amount) => t("metric.count", { count, amount }),
    metricLabel: t("metric.label"),
    recentHint: t("recent.hint"),
    createLabel: t("create"),
    createTitle: t("create"),
    editTitle: t("edit"),
    descPlaceholder: t("desc.placeholder"),
    emptyTitle: t("empty.title"),
    emptyHint: t("empty.hint"),
    deleteTitle: t("delete.title"),
    deleteDescription: t("delete.description"),
    deleteImpact: t("delete.impact"),
  };
  const { navigator } = usePage();
  const snapshot = useProjectsSnapshot();
  const mutations = useProjectMutations();
  const paperDrop = useImportDrop("project");

  const items: CockpitItem[] = useMemo(
    () => snapshot.projects.map(project => ({ ...project, metric: project.itemCount })),
    [snapshot.projects]
  );
  const lastItemIds = useMemo(
    () => new Map(snapshot.projects.map(project => [project.id, project.lastItemId])),
    [snapshot.projects]
  );

  const open = (id: number) => {
    const itemId = lastItemIds.get(id);
    navigator.push("project-detail", itemId ? { id, itemId } : { id });
  };

  return (
    <EntityCockpit
      prefsKey="projects"
      items={items}
      loading={snapshot.loading}
      visual={VISUAL}
      copy={copy}
      mutations={mutations}
      onOpen={open}
      onCreated={created => navigator.push("project-detail", { id: created.id })}
      paperDrop={paperDrop}
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
