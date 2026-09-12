// 项目列表（v1.1 设计稿）：活跃（置顶优先）/ 已归档两组；
// 项目是容器：文档、PDF、网页、音视频等八种节点（移动端一期文档可编辑，其余只读展示）。

import { useMemo, useState } from "react";
import { VirtualContainerList } from "../../components/VirtualContainerList";
import {
  ArchiveRestore,
  Ellipsis,
  FolderTree,
  GitBranch,
  Plus,
  Sparkles,
  Star,
  Table2,
  Trash2,
} from "lucide-react";
import type { Project, ProjectType } from "../../types";
import { clampText } from "../../utils/richTextText";
import { formatTimeDisplay } from "../../utils/formatTime";
import { PageHeader, PageHeaderButton } from "../../components/PageHeader";
import { toast } from "../../components/toast";
import BottomSheet from "../../components/BottomSheet";
import ActionSheet from "../../components/ActionSheet";
import MobileConfirmDialog from "../../components/MobileConfirmDialog";
import { useProjectCreate, useProjectDelete, useProjectUpdate, useProjectsQuery } from "./queries";

const PROJECT_TYPE_META: Record<string, { label: string; className: string; grad: string }> = {
  "document-tree": {
    label: "文档树",
    className: "bg-lilac-soft text-lilac",
    grad: "linear-gradient(135deg,#e2daf1,#b7a6d8)",
  },
  "data-table": {
    label: "表格",
    className: "bg-sky-soft text-sky",
    grad: "linear-gradient(135deg,#cfdff0,#9db9d8)",
  },
  "vibe-learning": {
    label: "Vibe 学习",
    className: "bg-rose-soft text-rose",
    grad: "linear-gradient(135deg,#f2cfc7,#dfa28f)",
  },
};

export function projectTypeMeta(type: string) {
  return PROJECT_TYPE_META[type] ?? PROJECT_TYPE_META["document-tree"];
}

type ProjectsPageProps = {
  onBack: () => void;
  onOpenProject: (projectId: number) => void;
  onError: (error: unknown, fallback: string) => void;
};

export function ProjectsPage(props: ProjectsPageProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createType, setCreateType] = useState<ProjectType | string>("document-tree");
  const [menuProject, setMenuProject] = useState<Project | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);

  const projectsQuery = useProjectsQuery();
  const projects = projectsQuery.data?.pages.flatMap(page => page.items) ?? [];
  const { isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } = projectsQuery;
  const createProject = useProjectCreate();
  const updateProject = useProjectUpdate();
  const deleteProject = useProjectDelete();

  const itemCountMap = useMemo(
    () => new Map(projects.map(project => [project.id, project.itemCount] as const)),
    [projects]
  );

  const active = (projects ?? []).filter(p => !p.archived);
  const archived = (projects ?? []).filter(p => p.archived);
  const visibleProjects = [...active, ...archived];

  const handleCreate = () => {
    const title = createTitle.trim();
    if (!title) {
      toast({ type: "warning", text: "给项目起个名字" });
      return;
    }
    createProject.mutate(
      { title, desc: createDesc.trim() || undefined, projectType: createType },
      {
        onSuccess: project => {
          setCreateOpen(false);
          setCreateTitle("");
          setCreateDesc("");
          setCreateType("document-tree");
          props.onOpenProject(project.id);
        },
        onError: error => props.onError(error, "新建项目失败"),
      }
    );
  };

  const renderProjectCard = (project: Project, index = 0) => {
    const meta = projectTypeMeta(project.projectType);
    const count = itemCountMap.get(project.id) ?? 0;
    return (
      <article
        key={project.id}
        className="card p-4 transition-transform active:scale-[0.98]"
        style={{
          animation: "pop-in .5s var(--ease-bounce) backwards",
          animationDelay: `${Math.min(index, 8) * 0.05}s`,
        }}
        onClick={() => props.onOpenProject(project.id)}
      >
        <div className="flex items-center gap-3">
          <span
            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl"
            style={{ background: meta.grad }}
          >
            <FolderTree size={20} strokeWidth={1.9} className="text-[#5b4a7e]" />
          </span>
          <p className="text-ink min-w-0 flex-1 truncate text-base font-bold">{project.title}</p>
          {project.pinned ? (
            <Star size={14} fill="currentColor" className="text-apricot shrink-0" />
          ) : null}
          <button
            type="button"
            aria-label="项目操作"
            className="text-ink-3 active:bg-press -mr-1.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg"
            onClick={event => {
              event.stopPropagation();
              setMenuProject(project);
            }}
          >
            <Ellipsis size={16} />
          </button>
        </div>
        {project.descText ? (
          <p className="text-ink-2 mt-2.5 line-clamp-2 text-[12.5px] leading-relaxed">
            {clampText(project.descText, 56)}
          </p>
        ) : null}
        <div className="text-ink-3 mt-2.5 flex items-center gap-2 text-[11px] tabular-nums">
          <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${meta.className}`}>
            {meta.label}
          </span>
          <span>{count} 节点</span>
          <span>·</span>
          <span>{formatTimeDisplay(project.updateTime)}</span>
        </div>
      </article>
    );
  };

  const renderArchivedCard = (project: Project) => {
    const meta = projectTypeMeta(project.projectType);
    return (
      <div
        key={project.id}
        className="border-line active:bg-press flex items-center gap-3 rounded-2xl border-[1.5px] border-dashed p-3"
        onClick={() => {
          updateProject.mutate(
            { id: project.id, archived: false },
            { onSuccess: () => toast({ type: "success", text: "已恢复到活跃项目" }) }
          );
        }}
      >
        <span
          className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-xl opacity-75"
          style={{ background: meta.grad }}
        >
          <FolderTree size={16} strokeWidth={2} className="text-[#5b4a7e]" />
        </span>
        <span className="text-ink-2 min-w-0 flex-1 truncate text-[13.5px] font-semibold">
          {project.title}
        </span>
        <span className="text-ink-3 shrink-0 text-[11px]">点击恢复</span>
      </div>
    );
  };

  return (
    <div className="mobile-kb-screen bg-page fixed inset-0 z-50 flex flex-col">
      <PageHeader
        title="项目"
        onBack={props.onBack}
        actions={
          <PageHeaderButton
            icon={<Plus size={18} strokeWidth={2.6} />}
            variant="brand"
            aria-label="新建项目"
            onClick={() => setCreateOpen(true)}
          />
        }
      />

      {/* 二级页无吸底 Dock，底部只留常规呼吸空间（dock-pad 是给 Dock 页面的 110px 留白） */}
      <div
        className="flex min-h-0 flex-1 flex-col overscroll-contain px-4 pt-1"
        style={{ paddingBottom: "calc(32px + var(--mobile-safe-bottom))" }}
      >
        {isLoading ? (
          <div className="card space-y-3 p-4">
            <div className="bg-input h-4 w-2/5 animate-pulse rounded" />
            <div className="bg-input h-4 w-4/5 animate-pulse rounded" />
          </div>
        ) : active.length === 0 && archived.length === 0 ? (
          <div className="py-16 text-center">
            <FolderTree size={36} strokeWidth={1.4} className="text-ink-3 mx-auto" />
            <p className="text-ink-2 mt-3 text-sm">还没有项目</p>
            <p className="text-ink-3 mt-1 text-xs">项目是一个容器，什么都能装</p>
          </div>
        ) : (
          <>
            <div className="text-ink-3 mb-3.5 mt-1 px-0.5 text-xs">
              <b className="text-ink-2 font-bold">{active.length}</b> 个活跃项目
            </div>
            <VirtualContainerList
              items={visibleProjects}
              hasNextPage={hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              fetchNextPage={fetchNextPage}
              edgeFade
              className="edge-fade-scroll relative flex-1 overflow-y-auto"
              renderItem={(project, index) =>
                project.archived ? renderArchivedCard(project) : renderProjectCard(project, index)
              }
            />
          </>
        )}
      </div>

      <BottomSheet open={createOpen} title="新建项目" onClose={() => setCreateOpen(false)}>
        <div className="grid grid-cols-3 gap-2">
          {(["document-tree", "data-table", "vibe-learning"] as const).map(type => {
            const meta = PROJECT_TYPE_META[type];
            const selected = createType === type;
            const icons = {
              "document-tree": <GitBranch size={19} strokeWidth={1.9} className="text-[#5b4a7e]" />,
              "data-table": <Table2 size={19} strokeWidth={1.9} className="text-[#3f648a]" />,
              "vibe-learning": <Sparkles size={19} strokeWidth={1.9} className="text-[#a3543f]" />,
            };
            return (
              <button
                key={type}
                type="button"
                onClick={() => {
                  if (type !== "document-tree") {
                    toast({ type: "info", text: `${meta.label}项目即将上线，先用文档树` });
                    return;
                  }
                  setCreateType(type);
                }}
                className={`flex flex-col items-center gap-2 rounded-2xl border-[1.5px] p-3 transition-all active:scale-95 ${
                  selected ? "border-accent" : "border-line"
                }`}
              >
                <span
                  className="grid h-[42px] w-[42px] place-items-center rounded-[15px]"
                  style={{ background: meta.grad }}
                >
                  {icons[type]}
                </span>
                <span className="text-ink text-xs font-bold">{meta.label}</span>
              </button>
            );
          })}
        </div>
        <input
          value={createTitle}
          onChange={event => setCreateTitle(event.target.value)}
          placeholder="项目名称，如：十月城市漫步计划"
          className="input-base mt-3.5 w-full px-4 py-3 text-[14.5px]"
        />
        <input
          value={createDesc}
          onChange={event => setCreateDesc(event.target.value)}
          placeholder="一句话描述（可选）"
          className="input-base mt-2.5 w-full px-4 py-3 text-[14.5px]"
        />
        <button
          type="button"
          disabled={createProject.isPending}
          onClick={handleCreate}
          className="shadow-accent mt-4 w-full rounded-full py-3.5 text-[15px] font-bold text-white transition-transform active:scale-[0.97] disabled:opacity-60"
          style={{ background: "var(--brand-grad)" }}
        >
          创建项目
        </button>
      </BottomSheet>

      <ActionSheet
        open={menuProject !== null}
        title={menuProject?.title}
        kind="项目"
        onClose={() => setMenuProject(null)}
        items={[
          {
            label: menuProject?.pinned ? "取消置顶" : "置顶",
            icon: <Star size={18} />,
            tone: "butter",
            onClick: () => {
              if (menuProject) {
                updateProject.mutate({ id: menuProject.id, pinned: !menuProject.pinned });
              }
              setMenuProject(null);
            },
          },
          {
            label: menuProject?.archived ? "恢复为活跃" : "归档项目",
            icon: <ArchiveRestore size={18} />,
            tone: "sky",
            onClick: () => {
              if (menuProject) {
                updateProject.mutate(
                  { id: menuProject.id, archived: !menuProject.archived },
                  {
                    onSuccess: () =>
                      toast({
                        type: "success",
                        text: menuProject.archived ? "已恢复到活跃项目" : "已归档",
                      }),
                  }
                );
              }
              setMenuProject(null);
            },
          },
          {
            label: "删除项目",
            danger: true,
            icon: <Trash2 size={18} />,
            onClick: () => {
              setDeleteTarget(menuProject);
              setMenuProject(null);
            },
          },
        ]}
      />

      <MobileConfirmDialog
        open={deleteTarget !== null}
        title="删除项目"
        description={`「${clampText(deleteTarget?.title ?? "", 18)}」及其全部节点将被删除，被其他项目引用的节点会自动脱离。`}
        danger
        loading={deleteProject.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            deleteProject.mutate(deleteTarget.id);
          }
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}

export default ProjectsPage;
