/**
 * 项目页视图：共享驾驶舱（features/shared/cockpit）的项目模块装配。
 *
 * 项目即文档树。在驾驶舱纸面上扩展排序与网格 / 列表两种排布：网格顶部「最近打开」续读行，
 * 全部区按排序展示（置顶始终在前）；列表由「上次打开」列承担最近打开。
 * 打开项目时，有上次停留的文档就直接定位过去。
 */

import { useMemo } from "react";
import { usePage } from "@/page/PageProvider";
import BatchExportModal from "@/components/BatchExportModal";
import { CockpitSectionHead, EntityCockpit } from "@/features/shared/cockpit/EntityCockpit";
import type { CockpitCardHandlers, CockpitCopy } from "@/features/shared/cockpit/types";
import { useProjectsSnapshot, useProjectMutations } from "../queries";
import { useProjectPrefs } from "../prefs";
import {
  PROJECT_SORTS,
  recentProjects,
  sortProjects,
  type ProjectLayout,
  type ProjectListItem,
  type ProjectSort,
} from "../model";
import { ProjectGridCard, ProjectListRows, ProjectRecentCard } from "../components/ProjectItems";
import { ProjectToolbar } from "../components/ProjectToolbar";
import { PROJECT_VISUAL } from "../visual";

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
  const { layout, sort, setLayout, setSort } = useProjectPrefs();

  const items: ProjectListItem[] = useMemo(
    () => snapshot.projects.map(project => ({ ...project, metric: project.itemCount })),
    [snapshot.projects]
  );
  const lastItemIds = useMemo(
    () => new Map(items.map(item => [item.id, item.lastItemId])),
    [items]
  );

  const open = (id: number) => {
    const itemId = lastItemIds.get(id);
    navigator.push("project-detail", itemId ? { id, itemId } : { id });
  };

  return (
    <EntityCockpit
      items={items}
      loading={snapshot.loading}
      visual={PROJECT_VISUAL}
      copy={COPY}
      mutations={mutations}
      onOpen={open}
      onCreated={created => navigator.push("project-detail", { id: created.id })}
      toolbar={
        <ProjectToolbar
          layout={layout}
          sort={sort}
          onLayoutChange={setLayout}
          onSortChange={setSort}
        />
      }
      renderActive={(active, handlers) => (
        <ActiveSections
          items={active}
          layout={layout}
          sort={sort}
          onSort={setSort}
          handlers={handlers}
        />
      )}
      renderArchived={(archived, handlers) => (
        <ProjectCollection
          items={sortProjects(archived, sort)}
          layout={layout}
          sort={sort}
          handlers={handlers}
          showHead={false}
        />
      )}
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

interface SectionProps {
  items: ProjectListItem[];
  layout: ProjectLayout;
  sort: ProjectSort;
  onSort?(sort: ProjectSort): void;
  handlers: CockpitCardHandlers;
}

function ActiveSections({ items, layout, sort, onSort, handlers }: SectionProps) {
  const sorted = useMemo(() => sortProjects(items, sort), [items, sort]);
  const recent = useMemo(() => (layout === "grid" ? recentProjects(items) : []), [items, layout]);
  const sortLabel = PROJECT_SORTS.find(s => s.value === sort)?.label ?? "";

  return (
    <>
      {recent.length > 0 && (
        <section className="mb-[26px]">
          <CockpitSectionHead label="最近打开" hint="从上次看到的文档继续" />
          <div className="grid grid-cols-3 gap-3">
            {recent.map(item => (
              <ProjectRecentCard key={item.id} item={item} onOpen={handlers.onOpen} />
            ))}
          </div>
        </section>
      )}
      <section className="mb-[26px]">
        <CockpitSectionHead
          label="全部"
          hint={`${sorted.length} ${COPY.entityUnit} · 按${sortLabel}`}
        />
        <ProjectCollection
          items={sorted}
          layout={layout}
          sort={sort}
          onSort={onSort}
          handlers={handlers}
        />
      </section>
    </>
  );
}

function ProjectCollection({
  items,
  layout,
  sort,
  onSort,
  handlers,
  showHead,
}: SectionProps & { showHead?: boolean }) {
  if (layout === "list") {
    return (
      <ProjectListRows
        items={items}
        sort={sort}
        onSort={onSort}
        handlers={handlers}
        showHead={showHead}
      />
    );
  }
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
      {items.map(item => (
        <ProjectGridCard key={item.id} item={item} sort={sort} handlers={handlers} />
      ))}
    </div>
  );
}
