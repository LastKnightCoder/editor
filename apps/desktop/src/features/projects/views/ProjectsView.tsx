/**
 * 项目页视图 · 学习驾驶舱（方案 C 定稿，mockups/projects/plan-c-cockpit.html）：
 * 首屏「置顶项目」升格 hero 大卡（置顶全部、更新序；无置顶整段不渲染——
 * 2026-09-23 用户校准，由 mockup 的「继续学习·前 2」收敛为纯置顶分组；被升格
 * 项目仍在下方全部网格——hero 是入口的放大不是分流）→「全部项目」紧凑网格 →
 * 底部归档折叠段。
 *
 * 结构与 articles 同构（edge-fade 协议）：工具栏 / 类型 pills 在滚动区外 flex-none
 * 固定，滚动区只装段落（sticky 段头实底 + 底缘渐透）。无页内搜索（D-024 口径：
 * 语义检索走全局 Ctrl+K，空态引导同一入口）、无排序 UI（默认「置顶 → 更新时间」序）。
 * hero 的 Vibe Learning 学习进度因暂无聚合数据源不渲染（mockup 待裁决 ①）。
 */

import { useMemo, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { usePage, usePageStatusBar } from "@/page/PageProvider";
import BatchExportModal from "@/components/BatchExportModal";
import { EProjectType } from "@/types/project";
import { Button, ConfirmDialog, IconButton, Loading, Menu, cn, toast, useEdgeFade } from "@tau/ui";
import { useProjectsSnapshot, useProjectMutations } from "../queries";
import { PROJECT_TYPE_META } from "../projectTypeMeta";
import {
  ProjectHeroCard,
  ProjectMiniCard,
  type ProjectCardHandlers,
} from "../components/ProjectCards";
import { CreateProjectDialog } from "../components/CreateProjectDialog";
import type { ProjectPageItem, ProjectTypeFilter } from "../types";

const TYPE_KEYS = [
  EProjectType.DocumentTree,
  EProjectType.DataTable,
  EProjectType.VibeLearning,
] as const;

export function ProjectsView() {
  const { navigator } = usePage();
  const snapshot = useProjectsSnapshot();
  const { togglePin, setArchived, remove } = useProjectMutations();

  const [typeFilter, setTypeFilter] = useState<ProjectTypeFilter>("");
  const [archivedOpen, setArchivedOpen] = useState(false);

  /* 弹层状态：新建 / 编辑 / 删除确认 / 整体导出（只保留在当前页面） */
  const [createOpen, setCreateOpen] = useState(false);
  const [createType, setCreateType] = useState<EProjectType>(EProjectType.DocumentTree);
  const [editing, setEditing] = useState<ProjectPageItem | null>(null);
  const [deleting, setDeleting] = useState<ProjectPageItem | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [exporting, setExporting] = useState<ProjectPageItem | null>(null);

  /* 滚动容器：callback ref + 边缘渐隐。顶部渐隐关闭（同 articles）——
     滚动区内有 sticky 段头（实底遮挡），渐隐带与实底头互斥，只保留底部渐隐 */
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  useEdgeFade(scrollEl, { top: false });

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

  /* 全局状态栏（仅栈顶显示；node 须 useMemo 稳定化） */
  const statusBarNode = useMemo(
    () => (
      <div className="text-tau-sm text-ink-3 flex min-w-0 flex-1 items-center gap-3.5 tabular-nums">
        <span className="flex-1" />
        <span>
          {activeAll.length} 个项目 · 文档 {activeAll.reduce((sum, p) => sum + p.itemCount, 0)} 个 ·
          已归档 {archivedCount}
        </span>
      </div>
    ),
    [activeAll, archivedCount]
  );
  usePageStatusBar("projects", statusBarNode);

  /* ---------- 卡片操作 ---------- */

  const handlers: ProjectCardHandlers = {
    onOpen: project => navigator.push("project-detail", { id: project.id }),
    onTogglePin: project => void togglePin(project.id, !project.pinned),
    onSetArchived: (project, next) => void setArchived(project.id, next),
    onEdit: project => setEditing(project),
    onExport: project => setExporting(project),
    onDelete: project => setDeleting(project),
  };

  const openCreate = (type: EProjectType) => {
    setCreateType(type);
    setCreateOpen(true);
  };

  if (snapshot.loading) return <Loading />;

  const total = snapshot.projects.length;

  return (
    <div className="@container mx-auto flex h-full max-w-[1720px] flex-col px-[26px]">
      {/* 工具栏（滚动区外固定）：新建（主位默认文档树，箭头位三型菜单）；
          计数不在此重复——pills 与状态栏已承载 */}
      <div className="flex h-[44px] flex-none items-center gap-3.5">
        <h1 className="text-[19px] font-semibold tracking-[-0.01em]">项目</h1>
        <span className="flex-1" />
        <Button
          variant="primary"
          size="sm"
          icon={Plus}
          onClick={() => openCreate(EProjectType.DocumentTree)}
        >
          新建
        </Button>
        <Menu
          align="end"
          trigger={
            <IconButton title="选择类型新建">
              <ChevronDown className="size-[15px]" strokeWidth={1.75} />
            </IconButton>
          }
        >
          {TYPE_KEYS.map(key => {
            const meta = PROJECT_TYPE_META[key];
            return (
              <Menu.Item
                key={key}
                onSelect={() => openCreate(key)}
                icon={<meta.icon className="size-[15px] shrink-0" strokeWidth={1.75} />}
              >
                新建{meta.label}项目
              </Menu.Item>
            );
          })}
        </Menu>
      </div>

      {/* 类型筛选 pills（滚动区外固定） */}
      <TypeFilterBar activeAll={activeAll} value={typeFilter} onChange={setTypeFilter} />

      {/* 滚动区：边缘渐隐（底部）；-mx/px 对称借位（卡片墙同款）——滚动容器
          border-box 外移 18px，hover 大阴影左右两缘都有绘制空间不被裁（内容盒
          宽度与列对齐不变），右侧细滚动条同落进右留白 */}
      <div
        ref={setScrollEl}
        className="edge-fade-scroll -mx-[18px] mt-1 min-h-0 flex-1 overflow-y-auto px-[18px] pb-6"
      >
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
              className="group/head sticky top-0 z-[2] flex w-full items-center gap-2.5 bg-[linear-gradient(180deg,var(--tau-bg-page)_calc(100%_-_13px),transparent)] px-0.5 pb-[13px] pt-0.5 text-left"
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
              <Button
                variant="primary"
                size="sm"
                icon={Plus}
                onClick={() => openCreate(EProjectType.DocumentTree)}
              >
                新建项目
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* 新建 / 编辑弹窗 */}
      <CreateProjectDialog
        open={createOpen || editing !== null}
        project={editing}
        defaultType={createType}
        onClose={() => {
          setCreateOpen(false);
          setEditing(null);
        }}
        onCreated={created => navigator.push("project-detail", { id: created.id })}
      />

      {/* 删除确认（级联事实见主进程 deleteProject：文档树清孤立子项、Vibe 删资源与聊天） */}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={open => {
          if (!open) setDeleting(null);
        }}
        title="删除项目"
        context={deleting?.title || `项目 #${deleting?.id}`}
        description="项目将从列表移除。"
        impact="项目内的子项、关联资源与聊天记录将一并删除，不可恢复。"
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

/* ---------- 类型筛选 pills ---------- */

function TypeFilterBar({
  activeAll,
  value,
  onChange,
}: {
  activeAll: ProjectPageItem[];
  value: ProjectTypeFilter;
  onChange(next: ProjectTypeFilter): void;
}) {
  const pills: { key: ProjectTypeFilter; label: string; count: number; dot?: string }[] = [
    { key: "", label: "全部", count: activeAll.length },
    ...TYPE_KEYS.map(key => ({
      key: key as ProjectTypeFilter,
      label: PROJECT_TYPE_META[key].label,
      count: activeAll.filter(p => p.projectType === key).length,
      dot: PROJECT_TYPE_META[key].dotClass,
    })),
  ];
  return (
    <div className="flex h-[38px] flex-none items-center gap-1.5 pb-1.5">
      {pills.map(pill => {
        const active = value === pill.key;
        return (
          <button
            key={pill.key || "all"}
            type="button"
            onClick={() => onChange(pill.key)}
            className={cn(
              "ease-tau-out shadow-card flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[12px] transition-[background,color] duration-150",
              active
                ? "bg-selected text-accent-text font-medium"
                : "bg-surface text-ink-2 hover:text-ink-1"
            )}
          >
            {pill.dot && <span className={cn("size-[7px] rounded-[3px]", pill.dot)} />}
            {pill.label}
            <span className={cn("text-[10.5px]", active ? "opacity-70" : "text-ink-3")}>
              {pill.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------- 段头（sticky 实底 + 底缘渐透，零横线） ---------- */

function SectionHead({ label, hint }: { label: string; hint: string }) {
  return (
    <header className="sticky top-0 z-[2] flex items-baseline gap-3 bg-[linear-gradient(180deg,var(--tau-bg-page)_calc(100%_-_13px),transparent)] pb-[13px] pl-0.5 pt-0.5">
      <span className="text-[16px] font-semibold tracking-[-0.01em]">{label}</span>
      <span className="text-ink-3 text-[11.5px] tabular-nums">{hint}</span>
    </header>
  );
}
