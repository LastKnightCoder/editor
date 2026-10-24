// 项目详情（v1.1 设计稿）：信息卡 + 面包屑逐层下钻（替代桌面常驻侧栏树），
// 完整结构收进树抽屉；文档节点点击进入编辑器（打开即编辑）。
// 每一层是一个页面实例（itemId 为空即根层），返回 / 右滑由路由逐层退回。

import { useMemo, useRef, useState, type CSSProperties } from "react";
import {
  ChevronRight,
  Ellipsis,
  FileText,
  FilePlus2,
  FolderPlus,
  FolderTree,
  ListTree,
  Plus,
  Star,
  Trash2,
  ArchiveRestore,
} from "lucide-react";
import type { ProjectItem } from "../../types";
import { clampText } from "../../utils/richTextText";
import { formatTimeDisplay } from "../../utils/formatTime";
import { toast } from "../../components/toast";
import BottomSheet from "../../components/BottomSheet";
import ActionSheet from "../../components/ActionSheet";
import MobileConfirmDialog from "../../components/MobileConfirmDialog";
import { PageHeader, PageHeaderButton } from "../../components/PageHeader";
import StructureTreeSheet, { type StructureTreeNode } from "../../components/StructureTreeSheet";
import {
  useProjectDelete,
  useProjectItemCreate,
  useProjectItemDelete,
  useProjectItemsQuery,
  useProjectQuery,
  useProjectUpdate,
} from "./queries";
import { ADDABLE_ITEM_TYPES, projectItemTypeMeta } from "./itemTypeMeta";
import { projectVisual } from "./ProjectsPage";
import { useEdgeFade, useEdgeFadeX } from "../../hooks/useScrollState";

// 末尾留白让最后一项越过右下角添加 FAB（54px + 20px 间距）
const FAB_CLEARANCE = "calc(96px + var(--mobile-screen-safe-bottom))";

type PathSegment = { id: number | null; title: string };

/** 从根到 itemId 的节点链（不含根）：沿属于本项目的父节点上溯，节点不存在时为空 */
function resolveItemChain(
  itemMap: ReadonlyMap<number, ProjectItem>,
  projectId: number,
  itemId: number | null
): PathSegment[] {
  const chain: PathSegment[] = [];
  const seen = new Set<number>();
  let cursor = itemId === null ? undefined : itemMap.get(itemId);
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    chain.unshift({ id: cursor.id, title: cursor.title });
    const parentId = cursor.parents.find(
      pid => itemMap.get(pid)?.projects.includes(projectId) ?? false
    );
    cursor = parentId !== undefined ? itemMap.get(parentId) : undefined;
  }
  return chain;
}

type ProjectDetailPageProps = {
  projectId: number;
  /** 当前层级节点；null 为项目根层 */
  itemId: number | null;
  onBack: () => void;
  onBackToList?: () => void;
  /** 进入某一层级（推入新的层级页面；null 为根层） */
  onOpenLevel: (itemId: number | null) => void;
  /** 面包屑跳到祖先层级（栈内有该层则逐层退回，没有则原位替换） */
  onJumpToLevel: (itemId: number | null) => void;
  onOpenDocEditor: (item: ProjectItem, projectTitle: string) => void;
  onOpenCard: (cardId: number) => void;
  onError: (error: unknown, fallback: string) => void;
};

export function ProjectDetailPage(props: ProjectDetailPageProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEdgeFade(scrollRef, { bottom: false });
  const pathRef = useRef<HTMLDivElement>(null);
  useEdgeFadeX(pathRef);
  const [treeOpen, setTreeOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  // 「添加子文档」的目标节点：null = 添加到当前层级
  const [addChildTarget, setAddChildTarget] = useState<ProjectItem | null>(null);
  const [menuProjectOpen, setMenuProjectOpen] = useState(false);
  const [menuItem, setMenuItem] = useState<ProjectItem | null>(null);
  const [deleteItemTarget, setDeleteItemTarget] = useState<ProjectItem | null>(null);
  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false);

  const { data: project } = useProjectQuery(props.projectId);
  const { data: items, isLoading } = useProjectItemsQuery();
  const updateProject = useProjectUpdate();
  const deleteProject = useProjectDelete();
  const createItem = useProjectItemCreate();
  const deleteItem = useProjectItemDelete();

  const projectItems = useMemo(
    () => (items ?? []).filter(item => item.projects.includes(props.projectId)),
    [items, props.projectId]
  );
  const itemMap = useMemo(() => {
    const map = new Map<number, ProjectItem>();
    for (const item of projectItems) {
      map.set(item.id, item);
    }
    return map;
  }, [projectItems]);

  // 子树统计（节点数 / 字数）
  const stats = useMemo(() => {
    let nodeCount = 0;
    let words = 0;
    const stack = [...(project?.children ?? [])];
    const seen = new Set<number>();
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      const item = itemMap.get(id);
      if (!item) {
        continue;
      }
      nodeCount += 1;
      words += item.count;
      stack.push(...item.children);
    }
    return { nodeCount, words };
  }, [project, itemMap]);

  const currentId = props.itemId;
  const path = useMemo<PathSegment[]>(
    () => [{ id: null, title: "" }, ...resolveItemChain(itemMap, props.projectId, currentId)],
    [itemMap, props.projectId, currentId]
  );
  const currentChildrenIds = useMemo(() => {
    if (currentId === null) {
      return project?.children ?? [];
    }
    return itemMap.get(currentId)?.children ?? [];
  }, [currentId, project, itemMap]);

  const treeNodes = useMemo(() => {
    const map = new Map<number, StructureTreeNode>();
    for (const item of projectItems) {
      const meta = projectItemTypeMeta(item);
      const Icon = meta.icon;
      map.set(item.id, {
        id: item.id,
        title: item.title,
        childrenIds: item.children.filter(id => itemMap.has(id)),
        icon: (
          <span
            className={`grid h-[26px] w-[26px] place-items-center rounded-[9px] ${meta.className}`}
          >
            <Icon size={14} strokeWidth={2} />
          </span>
        ),
        badge:
          item.children.length > 0 ? (
            <span className="text-ink-3 shrink-0 font-mono text-[10.5px]">
              {item.children.length}
            </span>
          ) : undefined,
      });
    }
    return map;
  }, [projectItems, itemMap]);

  const handleCreateDocument = () => {
    const title = addTitle.trim();
    if (!title) {
      toast({ type: "warning", text: "给文档起个名字" });
      return;
    }
    createItem.mutate(
      {
        projectId: props.projectId,
        parentId: addChildTarget?.id ?? currentId ?? undefined,
        title,
        itemType: "document",
      },
      {
        onSuccess: () => {
          setAddOpen(false);
          setAddChildTarget(null);
          setAddTitle("");
          toast({ type: "success", text: addChildTarget ? "已添加子文档" : "已添加文档" });
        },
        onError: error => props.onError(error, "添加文档失败"),
      }
    );
  };

  const openItem = (item: ProjectItem) => {
    if (item.children.length > 0) {
      props.onOpenLevel(item.id);
      return;
    }
    if (item.refType === "card" && item.refId > 0) {
      props.onOpenCard(item.refId);
      return;
    }
    if (item.projectItemType === "document" && item.contentId && item.contentId > 0) {
      props.onOpenDocEditor(item, project?.title ?? "");
      return;
    }
    const meta = projectItemTypeMeta(item);
    toast({ type: "info", text: `${meta.label}节点的查看与编辑将在二期提供` });
  };

  if (!project) {
    return (
      <div className="mobile-kb-screen bg-page fixed inset-0 z-50 grid place-items-center">
        <div className="card w-48 space-y-3 p-5">
          <div className="bg-page h-4 w-2/5 animate-pulse rounded" />
          <div className="bg-page h-4 w-4/5 animate-pulse rounded" />
        </div>
      </div>
    );
  }

  const meta = projectVisual();

  return (
    <div className="mobile-kb-screen bg-page fixed inset-0 z-50 flex flex-col">
      {/* 标题在内容区页头，顶栏不再重复项目名 */}
      <PageHeader
        center={<span aria-hidden="true" />}
        onBack={props.onBack}
        actions={
          <PageHeaderButton
            icon={<Ellipsis size={17} />}
            aria-label="项目操作"
            onClick={() => setMenuProjectOpen(true)}
          />
        }
      />

      <div
        ref={scrollRef}
        className="edge-fade-scroll mobile-page-scroll scrollbar-hide flex-1 overflow-y-auto overscroll-contain px-5 pt-1"
        style={{ "--page-bottom-inset": FAB_CLEARANCE } as CSSProperties}
      >
        {/* 项目页头：仅根层显示，直接落在纸面上（不再包卡片） */}
        {path.length === 1 ? (
          <div className="pt-3" style={{ animation: "pop-in .5s var(--ease-bounce) backwards" }}>
            <div className="flex items-center gap-2.5">
              <span
                className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[13px]"
                style={{ background: meta.grad }}
              >
                <FolderTree size={18} strokeWidth={1.9} className="text-white/90" />
              </span>
              <span
                className={`rounded-full px-2.5 py-1 text-[11.5px] font-bold ${meta.className}`}
              >
                {meta.label}项目
              </span>
              {project.pinned ? (
                <Star size={14} fill="currentColor" className="text-accent-text ml-auto shrink-0" />
              ) : null}
            </div>
            <h1 className="text-ink-1 mt-3 text-[24px] font-extrabold leading-tight tracking-[-0.02em]">
              {project.title}
            </h1>
            {project.descText ? (
              <p className="text-ink-2 mt-2 text-[13.5px] leading-[1.7]">
                {clampText(project.descText, 80)}
              </p>
            ) : null}
            <div className="text-ink-2 mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-medium tabular-nums">
              <span>{stats.nodeCount} 个节点</span>
              <span className="opacity-55">·</span>
              <span>{stats.words.toLocaleString()} 字</span>
              <span className="opacity-55">·</span>
              <span>{formatTimeDisplay(project.updateTime)}更新</span>
            </div>
          </div>
        ) : null}

        {/* 路径栏：面包屑 + 完整结构入口合而为一 */}
        <div className="card mb-2.5 mt-4 flex items-center gap-2 px-4 py-[9px]">
          <div
            ref={pathRef}
            className="edge-fade-x-scroll scrollbar-hide text-ink-2 flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto whitespace-nowrap text-[13px]"
          >
            {path.map((segment, index) => (
              <span key={segment.id ?? "root"} className="flex shrink-0 items-center gap-1.5">
                {index > 0 ? <ChevronRight size={13} className="shrink-0 opacity-50" /> : null}
                <span
                  className={`active:opacity-60 ${index === path.length - 1 ? "text-ink-1 font-bold" : ""}`}
                  onClick={() => {
                    if (index < path.length - 1) props.onJumpToLevel(segment.id);
                  }}
                >
                  {segment.id === null ? project.title : segment.title}
                </span>
              </span>
            ))}
          </div>
          <button
            type="button"
            aria-label="查看完整结构"
            onClick={() => setTreeOpen(true)}
            className="bg-page text-ink-2 grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[11px] transition-transform active:scale-90"
          >
            <ListTree size={16} strokeWidth={2} />
          </button>
        </div>

        {/* 当前层节点列表 */}
        <div className="card overflow-hidden">
          {isLoading ? (
            <div className="space-y-3 p-4">
              <div className="bg-page h-4 w-2/5 animate-pulse rounded" />
              <div className="bg-page h-4 w-4/5 animate-pulse rounded" />
            </div>
          ) : currentChildrenIds.length === 0 ? (
            <div className="py-10 text-center">
              <FilePlus2 size={28} strokeWidth={1.5} className="text-ink-3 mx-auto" />
              <p className="text-ink-2 mt-2.5 text-[13px]">这里还没有节点</p>
              <p className="text-ink-3 mt-1 text-[11.5px]">点右下角 + 添加文档</p>
            </div>
          ) : (
            currentChildrenIds.map(itemId => {
              const item = itemMap.get(itemId);
              if (!item) {
                return null;
              }
              const itemMeta = projectItemTypeMeta(item);
              const Icon = itemMeta.icon;
              const isCardRef = item.refType === "card";
              return (
                <div
                  key={item.id}
                  className="border-line-1 active:bg-hover flex cursor-pointer items-center gap-3 border-b px-4 py-3 last:border-b-0"
                  onClick={() => openItem(item)}
                >
                  <span
                    className={`grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[11px] ${itemMeta.className}`}
                  >
                    <Icon size={16} strokeWidth={1.9} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-ink-1 flex items-center gap-1.5 truncate text-[15px] font-bold">
                      {item.title}
                      {isCardRef ? (
                        <span className="bg-accent-soft text-accent-text rounded-full px-1.5 py-px text-[10px] font-bold">
                          卡片
                        </span>
                      ) : null}
                    </p>
                    <div className="text-ink-2 mt-0.5 flex items-center gap-1.5 text-[12px] tabular-nums">
                      {item.children.length > 0 ? (
                        <>
                          <span>{item.children.length} 个子节点</span>
                          <span className="opacity-55">·</span>
                        </>
                      ) : item.count > 0 ? (
                        <>
                          <span>{item.count.toLocaleString()} 字</span>
                          <span className="opacity-55">·</span>
                        </>
                      ) : null}
                      <span>{formatTimeDisplay(item.updateTime)}</span>
                    </div>
                  </div>
                  {item.children.length > 0 ? (
                    <ChevronRight size={14} strokeWidth={2.2} className="text-ink-3 shrink-0" />
                  ) : (
                    <button
                      type="button"
                      aria-label="节点操作"
                      className="text-ink-3 active:bg-hover -mr-1.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg"
                      onClick={event => {
                        event.stopPropagation();
                        setMenuItem(item);
                      }}
                    >
                      <Ellipsis size={15} />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 添加节点 FAB */}
      <button
        type="button"
        aria-label="添加节点"
        onClick={() => setAddOpen(true)}
        className="shadow-lift text-ink-inverse absolute bottom-[calc(20px+var(--mobile-screen-safe-bottom))] right-[18px] grid h-[54px] w-[54px] place-items-center rounded-[19px] transition-transform active:rotate-90 active:scale-90"
        style={{ background: "var(--tau-accent)" }}
      >
        <Plus size={23} strokeWidth={2.6} />
      </button>

      <StructureTreeSheet
        open={treeOpen}
        title="项目结构"
        hint={`${project.title} · ${stats.nodeCount} 个节点 · 点击行跳转`}
        nodes={treeNodes}
        rootIds={project.children}
        currentId={currentId}
        onClose={() => setTreeOpen(false)}
        onSelect={id => {
          const item = itemMap.get(id);
          if (!item) {
            return;
          }
          setTreeOpen(false);
          if (
            item.children.length > 0 ||
            (item.projectItemType !== "document" && !item.contentId)
          ) {
            if (item.id !== currentId) props.onOpenLevel(item.id);
            return;
          }
          openItem(item);
        }}
      />

      <BottomSheet
        open={addOpen}
        title={`添加到「${addChildTarget ? clampText(addChildTarget.title, 12) : path.length > 1 ? path[path.length - 1].title : project.title}」`}
        onClose={() => {
          setAddOpen(false);
          setAddChildTarget(null);
        }}
      >
        <input
          value={addTitle}
          onChange={event => setAddTitle(event.target.value)}
          placeholder="文档标题…"
          className="input-base mb-3.5 w-full px-4 py-3"
        />
        <button
          type="button"
          disabled={createItem.isPending}
          onClick={handleCreateDocument}
          className="bg-tag-1-soft text-tag-1 mb-4 flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-[14.5px] font-bold transition-transform active:scale-[0.97] disabled:opacity-60"
        >
          <FilePlus2 size={17} strokeWidth={2.2} />
          新建文档
          {!addChildTarget && path.length > 1 ? `（加入当前层级）` : ""}
        </button>
        <div className="grid grid-cols-4 gap-2.5">
          {ADDABLE_ITEM_TYPES.filter(entry => entry.type !== "document").map(entry => {
            const Icon = entry.meta.icon;
            return (
              <button
                key={entry.type}
                type="button"
                className="relative flex flex-col items-center gap-1.5 py-2 transition-transform active:scale-90"
                onClick={() => toast({ type: "info", text: `${entry.meta.label}节点将在二期提供` })}
              >
                {entry.soon ? (
                  <span className="bg-tag-4-soft text-tag-4 absolute right-1 top-0 rounded-full px-1.5 py-px text-[8.5px] font-bold tracking-wider">
                    二期
                  </span>
                ) : null}
                <span
                  className={`grid h-[46px] w-[46px] place-items-center rounded-2xl ${entry.meta.className}`}
                >
                  <Icon size={20} strokeWidth={1.9} />
                </span>
                <span className="text-ink-2 text-[11px] font-semibold">{entry.meta.label}</span>
              </button>
            );
          })}
        </div>
      </BottomSheet>

      <ActionSheet
        open={menuProjectOpen}
        title={project.title}
        kind="项目"
        onClose={() => setMenuProjectOpen(false)}
        items={[
          {
            label: project.pinned ? "取消置顶" : "置顶",
            icon: <Star size={18} />,
            tone: "butter",
            onClick: () => {
              updateProject.mutate({ id: project.id, pinned: !project.pinned });
              setMenuProjectOpen(false);
            },
          },
          {
            label: project.archived ? "恢复为活跃" : "归档项目",
            icon: <ArchiveRestore size={18} />,
            tone: "sky",
            onClick: () => {
              updateProject.mutate({ id: project.id, archived: !project.archived });
              setMenuProjectOpen(false);
            },
          },
          {
            label: "删除项目",
            danger: true,
            icon: <Trash2 size={18} />,
            onClick: () => {
              setMenuProjectOpen(false);
              setDeleteProjectOpen(true);
            },
          },
        ]}
      />

      <ActionSheet
        open={menuItem !== null}
        title={menuItem?.title}
        kind="项目节点"
        onClose={() => setMenuItem(null)}
        items={[
          ...(menuItem &&
          menuItem.children.length === 0 &&
          menuItem.projectItemType === "document" &&
          menuItem.contentId
            ? [
                {
                  label: "打开编辑",
                  icon: <FileText size={18} />,
                  tone: "lilac" as const,
                  onClick: () => {
                    if (menuItem) {
                      props.onOpenDocEditor(menuItem, project.title);
                    }
                    setMenuItem(null);
                  },
                },
              ]
            : []),
          {
            label: "添加子文档",
            icon: <FolderPlus size={18} />,
            tone: "sky" as const,
            onClick: () => {
              setAddChildTarget(menuItem);
              setMenuItem(null);
              setAddOpen(true);
            },
          },
          {
            label: "删除节点",
            danger: true,
            icon: <Trash2 size={18} />,
            onClick: () => {
              setDeleteItemTarget(menuItem);
              setMenuItem(null);
            },
          },
        ]}
      />

      <MobileConfirmDialog
        open={deleteItemTarget !== null}
        title="删除节点"
        description={`「${clampText(deleteItemTarget?.title ?? "", 16)}」及其子节点将被删除，被其他位置引用的节点会自动脱离。`}
        danger
        loading={deleteItem.isPending}
        onCancel={() => setDeleteItemTarget(null)}
        onConfirm={() => {
          if (deleteItemTarget) {
            deleteItem.mutate(deleteItemTarget.id);
          }
          setDeleteItemTarget(null);
        }}
      />

      <MobileConfirmDialog
        open={deleteProjectOpen}
        title="删除项目"
        description={`「${clampText(project.title, 18)}」及其全部节点将被删除。`}
        danger
        loading={deleteProject.isPending}
        onCancel={() => setDeleteProjectOpen(false)}
        onConfirm={() => {
          setDeleteProjectOpen(false);
          deleteProject.mutate(project.id);
          props.onBackToList?.();
        }}
      />
    </div>
  );
}

export default ProjectDetailPage;
