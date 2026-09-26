/**
 * 项目页视图 · 学习驾驶舱（方案 C 定稿，mockups/projects/plan-c-cockpit.html）：
 * 首屏「置顶项目」升格 hero 大卡（置顶全部、更新序；无置顶整段不渲染——
 * 2026-09-23 用户校准，由 mockup 的「继续学习·前 2」收敛为纯置顶分组；被升格
 * 项目仍在下方全部网格——hero 是入口的放大不是分流）→「全部项目」紧凑网格 →
 * 底部归档折叠段。
 *
 * 一整张纸（同 Skill 页）：纸顶固定工具栏，纸内 FadeScroll 只装段落
 * （sticky 段头纸色实底 + 底缘渐透）。新建只有一个入口，类型在新建弹窗里选。
 * 类型筛选在侧栏「项目」入口的子项里（ProjectsNav，页面参数 id = 类型值，空 = 全部），页内不放 pills。无页内搜索（D-024 口径：
 * 语义检索走全局 Ctrl+K，空态引导同一入口）、无排序 UI（默认「置顶 → 更新时间」序）。
 * hero 的 Vibe Learning 学习进度因暂无聚合数据源不渲染（mockup 待裁决 ①）。
 */

import { useMemo, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { FadeScroll } from "@/components/FadeScroll";
import { usePage, usePageParams } from "@/page/PageProvider";
import BatchExportModal from "@/components/BatchExportModal";
import { EProjectType } from "@/types/project";
import { Button, ConfirmDialog, Loading, cn, toast } from "@tau/ui";
import { useProjectsSnapshot, useProjectMutations } from "../queries";
import { PROJECT_TYPE_META } from "../projectTypeMeta";
import {
  ProjectHeroCard,
  ProjectMiniCard,
  type ProjectCardHandlers,
} from "../components/ProjectCards";
import { CreateProjectDialog } from "../components/CreateProjectDialog";
import { PROJECT_TYPE_KEYS, type ProjectPageItem, type ProjectTypeFilter } from "../types";

const DELETE_IMPACT: Record<EProjectType, string> = {
  [EProjectType.DocumentTree]:
    "仅属于此项目的子项将一并删除；其他项目共用的子项会保留。删除后不可恢复。",
  [EProjectType.DataTable]:
    "将解除项目与表格的关联，并清理不再被引用的行详情内容。此操作不可恢复。",
  [EProjectType.VibeLearning]: "此学习项目内的资源、笔记、测验和聊天记录将一并删除，不可恢复。",
};

export function ProjectsView() {
  const { navigator } = usePage();
  const snapshot = useProjectsSnapshot();
  const { togglePin, setArchived, remove } = useProjectMutations();

  const params = usePageParams<{ id?: string }>();
  // 类型筛选 = 侧栏子项选中的类型；非法值一律按「全部」
  const typeFilter: ProjectTypeFilter = PROJECT_TYPE_KEYS.find(key => key === params.id) ?? "";
  const [archivedOpen, setArchivedOpen] = useState(false);

  /* 弹层状态：新建 / 编辑 / 删除确认 / 整体导出（只保留在当前页面） */
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectPageItem | null>(null);
  const [deleting, setDeleting] = useState<ProjectPageItem | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [exporting, setExporting] = useState<ProjectPageItem | null>(null);

  /* ---------- 派生：置顶段与全部网格 ---------- */

  const { heroes, rest, archived, activeAll } = useMemo(() => {
    const match = (p: ProjectPageItem) => !typeFilter || p.projectType === typeFilter;
    const active = snapshot.projects.filter(p => !p.archived && match(p));
    const byUpdate = [...active].sort((a, b) => b.updateTime - a.updateTime);
    return {
      /* 置顶段 = 置顶项目升格 hero（全部，更新序）；无置顶整段不渲染，
         最近项目由「全部项目」网格首行承接 */
      heroes: byUpdate.filter(p => p.pinned),
      /* 「升格不分流」：全部网格仍含置顶的 mini 卡（完整索引），按更新序 */
      rest: byUpdate,
      archived: snapshot.projects.filter(p => p.archived && match(p)),
      activeAll: snapshot.projects.filter(p => !p.archived),
    };
  }, [snapshot.projects, typeFilter]);

  const archivedCount = snapshot.projects.length - activeAll.length;

  /* ---------- 卡片操作 ---------- */

  const handlers: ProjectCardHandlers = {
    onOpen: project => navigator.push("project-detail", { id: project.id }),
    onTogglePin: project => void togglePin(project.id, !project.pinned),
    onSetArchived: (project, next) => void setArchived(project.id, next),
    onEdit: project => setEditing(project),
    onExport: project => setExporting(project),
    onDelete: project => setDeleting(project),
  };

  const openCreate = () => setCreateOpen(true);

  if (snapshot.loading) return <Loading />;

  const total = snapshot.projects.length;

  return (
    <div className="@container mx-auto flex h-full min-h-0 w-full max-w-[1720px] flex-col px-4 pb-4 pt-1">
      {/* 一整张纸：工具栏与类型 pills 固定在纸顶，段落在纸内滚动 */}
      <div className="bg-surface shadow-card rounded-tau-lg flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-none flex-col px-8 pt-5">
          {/* 工具栏：标题 + 摘要（原底部状态栏的读数）+ 唯一的「新建」，类型在弹窗里选 */}
          <div className="mb-3 flex h-10 flex-none items-center gap-3.5">
            <h1 className="text-tau-title-lg shrink-0 whitespace-nowrap font-semibold tracking-[-0.01em]">
              {typeFilter ? PROJECT_TYPE_META[typeFilter].label : "项目"}
            </h1>
            <span className="text-tau-meta text-ink-2 w-0 flex-1 truncate whitespace-nowrap tabular-nums">
              <b className="text-ink-1 font-semibold">{activeAll.length}</b> 个项目
              <span className="text-ink-3 mx-1.5">·</span>文档{" "}
              <b className="text-ink-1 font-semibold">
                {activeAll.reduce((sum, p) => sum + p.itemCount, 0)}
              </b>{" "}
              个{archivedCount > 0 && ` · 已归档 ${archivedCount}`}
            </span>
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              className="shrink-0 whitespace-nowrap"
              onClick={openCreate}
            >
              新建项目
            </Button>
          </div>
        </div>

        {/* 滚动区：FadeScroll（右侧 6px 透明边 + pr-[26px] = 左侧 pl-8）；
          pt-1 给首行卡片 hover 的 lift 阴影留出绘制空间，不被滚动区顶边裁掉 */}
        <FadeScroll className="mb-4 min-h-0 flex-1 pb-2 pl-8 pr-[26px] pt-1">
          {/* 置顶项目：升格 hero（无置顶不渲染） */}
          {heroes.length > 0 && (
            <section className="mb-[26px]">
              <SectionHead
                label="置顶项目"
                hint={`${heroes.length} 个 · ${heroes.reduce((sum, p) => sum + p.itemCount, 0)} 个文档`}
              />
              <div className="grid grid-cols-[repeat(auto-fill,minmax(360px,1fr))] gap-3.5">
                {heroes.map(project => (
                  <ProjectHeroCard key={project.id} project={project} handlers={handlers} />
                ))}
              </div>
            </section>
          )}

          {/* 全部项目：紧凑网格 */}
          {rest.length > 0 && (
            <section className="mb-[26px]">
              <SectionHead
                label="全部项目"
                hint={`${activeAll.length} 个 · 文档 ${activeAll.reduce((sum, p) => sum + p.itemCount, 0)} 个`}
              />
              <div className="grid grid-cols-[repeat(auto-fill,minmax(268px,1fr))] gap-2.5">
                {rest.map(project => (
                  <ProjectMiniCard key={project.id} project={project} handlers={handlers} />
                ))}
              </div>
            </section>
          )}

          {/* 归档：折叠段 */}
          {archived.length > 0 && (
            <section>
              <button
                type="button"
                onClick={() => setArchivedOpen(prev => !prev)}
                className="group/head sticky top-0 z-[2] flex w-full items-center gap-2.5 bg-[linear-gradient(180deg,var(--tau-bg-surface)_calc(100%_-_13px),transparent)] px-0.5 pb-[13px] pt-0.5 text-left"
              >
                <ChevronDown
                  className={cn(
                    "text-ink-3 ease-tau-out size-[13px] transition-transform duration-200",
                    archivedOpen ? "rotate-0" : "-rotate-90"
                  )}
                  strokeWidth={1.75}
                />
                <span className="group-hover/head:text-accent-text text-[16px] font-semibold tracking-[-0.01em]">
                  归档项目
                </span>
                <span className="text-ink-3 text-[11.5px] tabular-nums">{archived.length} 个</span>
              </button>
              <div
                className={cn(
                  "ease-tau-out grid grid-rows-[0fr] transition-[grid-template-rows] duration-200",
                  archivedOpen && "grid-rows-[1fr]"
                )}
              >
                <div className="overflow-hidden">
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(268px,1fr))] gap-2.5">
                    {archived.map(project => (
                      <ProjectMiniCard key={project.id} project={project} handlers={handlers} />
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* 空态 */}
          {total === 0 && (
            <div className="flex flex-col items-center gap-2 px-0 py-20 text-center">
              <p className="text-ink-2 text-[15px] font-medium">还没有项目</p>
              <p className="text-ink-3 text-[12.5px]">
                从一个学习项目开始：文档树、数据表格或 Vibe Learning
              </p>
              <div className="mt-3 flex gap-2">
                <Button variant="primary" size="sm" icon={Plus} onClick={openCreate}>
                  新建项目
                </Button>
              </div>
            </div>
          )}
        </FadeScroll>
      </div>

      {/* 新建 / 编辑弹窗 */}
      <CreateProjectDialog
        open={createOpen || editing !== null}
        project={editing}
        defaultType={EProjectType.DocumentTree}
        onClose={() => {
          setCreateOpen(false);
          setEditing(null);
        }}
        onCreated={created => navigator.push("project-detail", { id: created.id })}
      />

      {/* 删除影响按项目类型展示，与主进程的级联删除范围一致。 */}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={open => {
          if (!open) setDeleting(null);
        }}
        title="删除项目"
        context={deleting?.title || `项目 #${deleting?.id}`}
        description="项目将被永久删除。"
        impact={deleting ? DELETE_IMPACT[deleting.projectType] : undefined}
        danger
        confirmText="删除"
        loading={deletingBusy}
        onConfirm={async () => {
          if (!deleting) return;
          setDeletingBusy(true);
          try {
            await remove(deleting.id);
            setDeleting(null);
            toast.success("已删除");
          } catch {
            toast.error("删除失败");
          } finally {
            setDeletingBusy(false);
          }
        }}
      />

      {/* 整体导出（共享层组件，legacy 同款能力） */}
      {exporting && (
        <BatchExportModal
          open
          onClose={() => setExporting(null)}
          scope={{ type: "project", id: exporting.id, title: exporting.title }}
        />
      )}
    </div>
  );
}

/* ---------- 段头（sticky 实底 + 底缘渐透，零横线） ---------- */

function SectionHead({ label, hint }: { label: string; hint: string }) {
  return (
    <header className="sticky top-0 z-[2] flex items-baseline gap-3 bg-[linear-gradient(180deg,var(--tau-bg-surface)_calc(100%_-_13px),transparent)] pb-[13px] pl-0.5 pt-0.5">
      <span className="text-[16px] font-semibold tracking-[-0.01em]">{label}</span>
      <span className="text-ink-3 text-[11.5px] tabular-nums">{hint}</span>
    </header>
  );
}
