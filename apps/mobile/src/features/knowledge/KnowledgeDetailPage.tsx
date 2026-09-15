// 知识库详情（v1.1 设计稿）：面包屑逐层下钻；
// 节点带跨内容关联徽标（🔗卡片 / 🔗文章），新建文档 + 关联已有卡片 / 文章。

import { useMemo, useRef, useState } from "react";
import {
  BookMarked,
  BookOpen,
  ChevronRight,
  Ellipsis,
  FileText,
  FilePlus2,
  FolderPlus,
  Layers,
  Link2,
  ListTree,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import type { DocumentItem } from "../../types";
import { clampText } from "../../utils/richTextText";
import { formatTimeDisplay } from "../../utils/formatTime";
import { useBackHandler } from "../../router";
import { toast } from "../../components/toast";
import BottomSheet from "../../components/BottomSheet";
import ActionSheet from "../../components/ActionSheet";
import MobileConfirmDialog from "../../components/MobileConfirmDialog";
import { PageHeader } from "../../components/PageHeader";
import StructureTreeSheet, { type StructureTreeNode } from "../../components/StructureTreeSheet";
import LinkPickerSheet from "./LinkPickerSheet";
import { libGradient } from "./KnowledgePage";
import { useEdgeFade, useEdgeFadeX } from "../../hooks/useScrollState";
import {
  useDocumentItemCreate,
  useDocumentItemDelete,
  useDocumentItemsQuery,
  useDocumentLibraryQuery,
} from "./queries";

type PathSegment = { id: number | null; title: string };

type KnowledgeDetailPageProps = {
  libraryId: number;
  onBack: () => void;
  onOpenNodeEditor: (item: DocumentItem, libraryTitle: string) => void;
  onOpenCard: (cardId: number) => void;
  onOpenArticle: (articleId: number) => void;
  onError: (error: unknown, fallback: string) => void;
};

export function KnowledgeDetailPage(props: KnowledgeDetailPageProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEdgeFade(scrollRef, { bottom: false });
  const pathRef = useRef<HTMLDivElement>(null);
  useEdgeFadeX(pathRef);
  const [path, setPath] = useState<PathSegment[]>([{ id: null, title: "" }]);
  const [treeOpen, setTreeOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  // 「添加子文档」的目标节点：null = 添加到当前层级
  const [addChildTarget, setAddChildTarget] = useState<DocumentItem | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [menuItem, setMenuItem] = useState<DocumentItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentItem | null>(null);

  // 下钻层级是页内 state，router 只认路由栈：不注册消费器的话，物理返回/侧滑
  // 会直接弹掉整个详情页（表现为跳回库/列表，中间层级全丢）。返回上一级即消费。
  const goUpOneLevel = () => {
    if (path.length <= 1) {
      return false;
    }
    setPath(prev => prev.slice(0, -1));
    return true;
  };
  useBackHandler(goUpOneLevel);

  const { data: library } = useDocumentLibraryQuery(props.libraryId);
  const { data: items, isLoading } = useDocumentItemsQuery();
  const createItem = useDocumentItemCreate();
  const deleteItem = useDocumentItemDelete();

  const libraryItems = useMemo(
    () => (items ?? []).filter(item => item.documents.includes(props.libraryId)),
    [items, props.libraryId]
  );
  const itemMap = useMemo(() => {
    const map = new Map<number, DocumentItem>();
    for (const item of libraryItems) {
      map.set(item.id, item);
    }
    return map;
  }, [libraryItems]);

  const stats = useMemo(() => {
    let nodes = 0;
    let links = 0;
    let words = 0;
    const stack = [...(library?.children ?? [])];
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
      nodes += 1;
      words += item.count;
      if (item.refType === "card" || item.refType === "article") {
        links += 1;
      }
      stack.push(...item.children);
    }
    return { nodes, links, words };
  }, [library, itemMap]);

  const currentId = path[path.length - 1].id;
  const currentChildrenIds = useMemo(() => {
    if (currentId === null) {
      return library?.children ?? [];
    }
    return itemMap.get(currentId)?.children ?? [];
  }, [currentId, library, itemMap]);

  const treeNodes = useMemo(() => {
    const map = new Map<number, StructureTreeNode>();
    for (const item of libraryItems) {
      const isLink = item.refType === "card" || item.refType === "article";
      map.set(item.id, {
        id: item.id,
        title: item.title,
        childrenIds: item.children.filter(id => itemMap.has(id)),
        icon: isLink ? (
          <span
            className={`grid h-[26px] w-[26px] place-items-center rounded-[9px] ${item.refType === "card" ? "bg-apricot-soft text-apricot" : "bg-rose-soft text-rose"}`}
          >
            {item.refType === "card" ? (
              <Layers size={14} strokeWidth={2} />
            ) : (
              <FileText size={14} strokeWidth={2} />
            )}
          </span>
        ) : (
          <span className="bg-sky-soft text-sky grid h-[26px] w-[26px] place-items-center rounded-[9px]">
            <BookOpen size={14} strokeWidth={2} />
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
  }, [libraryItems, itemMap]);

  const handleCreateDocument = () => {
    const title = addTitle.trim();
    if (!title) {
      toast({ type: "warning", text: "给文档起个名字" });
      return;
    }
    createItem.mutate(
      {
        documentId: props.libraryId,
        parentId: addChildTarget?.id ?? currentId ?? undefined,
        title,
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

  const openItem = (item: DocumentItem) => {
    if (item.children.length > 0) {
      setPath(prev => [...prev, { id: item.id, title: item.title }]);
      return;
    }
    if (item.refType === "card" && item.refId > 0) {
      props.onOpenCard(item.refId);
      return;
    }
    if (item.refType === "article" && item.refId > 0) {
      props.onOpenArticle(item.refId);
      return;
    }
    if (item.contentId && item.contentId > 0) {
      props.onOpenNodeEditor(item, library?.title ?? "");
      return;
    }
  };

  if (!library) {
    return (
      <div className="mobile-kb-screen bg-page fixed inset-0 z-50 grid place-items-center">
        <div className="card w-48 space-y-3 p-5">
          <div className="bg-input h-4 w-2/5 animate-pulse rounded" />
          <div className="bg-input h-4 w-4/5 animate-pulse rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="mobile-kb-screen bg-page fixed inset-0 z-50 flex flex-col">
      {/* 标题在内容区页头，顶栏不再重复库名 */}
      <PageHeader
        center={<span aria-hidden="true" />}
        onBack={() => {
          if (!goUpOneLevel()) {
            props.onBack();
          }
        }}
        actions={
          library.isTop ? (
            <span className="bg-surface shadow-card grid h-10 w-10 shrink-0 place-items-center rounded-[13px]">
              <Star size={15} fill="currentColor" className="text-apricot" />
            </span>
          ) : null
        }
      />

      <div
        ref={scrollRef}
        className="edge-fade-scroll scrollbar-hide dock-pad flex-1 overflow-y-auto overscroll-contain px-5 pt-1"
      >
        {/* 知识库页头：仅根层显示，直接落在纸面上（不再包卡片） */}
        {path.length === 1 ? (
          <div className="pt-3" style={{ animation: "pop-in .5s var(--ease-bounce) backwards" }}>
            <div className="flex items-center gap-2.5">
              <span
                className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[13px]"
                style={{ background: libGradient(library.id) }}
              >
                <BookMarked size={18} strokeWidth={1.9} className="text-white/90" />
              </span>
              {stats.links > 0 ? (
                <span className="bg-lilac-soft text-lilac inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold">
                  <Link2 size={11} strokeWidth={2.4} />
                  {stats.links} 个跨内容关联
                </span>
              ) : null}
              {library.isTop ? (
                <Star size={14} fill="currentColor" className="text-apricot ml-auto shrink-0" />
              ) : null}
            </div>
            <h1 className="text-ink mt-3 text-[24px] font-extrabold leading-tight tracking-[-0.02em]">
              {library.title}
            </h1>
            {library.descText ? (
              <p className="text-meta-ink mt-2 text-[13.5px] leading-[1.7]">
                {clampText(library.descText, 80)}
              </p>
            ) : null}
            <div className="text-meta-ink mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-medium tabular-nums">
              <span>{stats.nodes} 个节点</span>
              <span className="opacity-55">·</span>
              <span>{stats.words.toLocaleString()} 字</span>
              <span className="opacity-55">·</span>
              <span>{formatTimeDisplay(library.updateTime)}更新</span>
            </div>
          </div>
        ) : null}

        {/* 路径栏：面包屑 + 完整结构入口合而为一 */}
        <div className="card mb-2.5 mt-4 flex items-center gap-2 px-4 py-[9px]">
          <div
            ref={pathRef}
            className="edge-fade-x-scroll scrollbar-hide text-meta-ink flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto whitespace-nowrap text-[13px]"
          >
            {path.map((segment, index) => (
              <span key={segment.id ?? "root"} className="flex shrink-0 items-center gap-1.5">
                {index > 0 ? <ChevronRight size={13} className="shrink-0 opacity-50" /> : null}
                <span
                  className={`active:opacity-60 ${index === path.length - 1 ? "text-ink font-bold" : ""}`}
                  onClick={() => setPath(prev => prev.slice(0, index + 1))}
                >
                  {segment.id === null ? library.title : segment.title}
                </span>
              </span>
            ))}
          </div>
          <button
            type="button"
            aria-label="查看完整结构"
            onClick={() => setTreeOpen(true)}
            className="bg-input text-ink-2 grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[11px] transition-transform active:scale-90"
          >
            <ListTree size={16} strokeWidth={2} />
          </button>
        </div>

        <div className="card overflow-hidden">
          {isLoading ? (
            <div className="space-y-3 p-4">
              <div className="bg-input h-4 w-2/5 animate-pulse rounded" />
              <div className="bg-input h-4 w-4/5 animate-pulse rounded" />
            </div>
          ) : currentChildrenIds.length === 0 ? (
            <div className="py-10 text-center">
              <FilePlus2 size={28} strokeWidth={1.5} className="text-ink-3 mx-auto" />
              <p className="text-ink-2 mt-2.5 text-[13px]">这里还没有节点</p>
              <p className="text-ink-3 mt-1 text-[11.5px]">点右下角 + 新建文档或添加关联</p>
            </div>
          ) : (
            currentChildrenIds.map(itemId => {
              const item = itemMap.get(itemId);
              if (!item) {
                return null;
              }
              const isCardLink = item.refType === "card";
              const isArticleLink = item.refType === "article";
              const isLink = isCardLink || isArticleLink;
              return (
                <div
                  key={item.id}
                  className="border-line active:bg-press flex cursor-pointer items-center gap-3 border-b px-4 py-3 last:border-b-0"
                  onClick={() => openItem(item)}
                >
                  <span
                    className={`grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[11px] ${
                      isCardLink
                        ? "bg-apricot-soft text-apricot"
                        : isArticleLink
                          ? "bg-rose-soft text-rose"
                          : "bg-sky-soft text-sky"
                    }`}
                  >
                    {isCardLink ? (
                      <Layers size={16} strokeWidth={1.9} />
                    ) : isArticleLink ? (
                      <FileText size={16} strokeWidth={1.9} />
                    ) : (
                      <BookOpen size={16} strokeWidth={1.9} />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-ink flex items-center gap-1.5 truncate text-[15px] font-bold">
                      <span className="truncate">{item.title}</span>
                      {isLink ? (
                        <span
                          className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-bold ${
                            isCardLink ? "bg-apricot-soft text-apricot" : "bg-rose-soft text-rose"
                          }`}
                        >
                          {isCardLink ? "卡片" : "文章"}
                        </span>
                      ) : null}
                    </p>
                    <div className="text-meta-ink mt-0.5 flex items-center gap-1.5 text-[12px] tabular-nums">
                      {item.children.length > 0 ? (
                        <>
                          <span>{item.children.length} 个子节点</span>
                          <span className="opacity-55">·</span>
                        </>
                      ) : item.count > 0 && !isLink ? (
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
                      className="text-ink-3 active:bg-press -mr-1.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg"
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

      <button
        type="button"
        aria-label="添加节点"
        onClick={() => setAddOpen(true)}
        className="shadow-accent absolute bottom-[calc(20px+env(safe-area-inset-bottom,0px))] right-[18px] grid h-[54px] w-[54px] place-items-center rounded-[19px] text-white transition-transform active:rotate-90 active:scale-90"
        style={{ background: "var(--brand-grad)" }}
      >
        <Plus size={23} strokeWidth={2.6} />
      </button>

      <StructureTreeSheet
        open={treeOpen}
        title="知识库结构"
        hint={`${library.title} · ${stats.nodes} 个节点 · 🔗 表示跨内容关联`}
        nodes={treeNodes}
        rootIds={library.children}
        currentId={currentId}
        onClose={() => setTreeOpen(false)}
        onSelect={id => {
          const item = itemMap.get(id);
          if (!item) {
            return;
          }
          setTreeOpen(false);
          if (item.children.length > 0) {
            const chain: PathSegment[] = [];
            let cursor: DocumentItem | undefined = item;
            while (cursor) {
              chain.unshift({ id: cursor.id, title: cursor.title });
              const parentId: number | undefined = cursor.parents.find(
                (pid: number) =>
                  itemMap.has(pid) && itemMap.get(pid)!.documents.includes(props.libraryId)
              );
              cursor = parentId !== undefined ? itemMap.get(parentId) : undefined;
            }
            setPath([{ id: null, title: "" }, ...chain]);
            return;
          }
          openItem(item);
        }}
      />

      <BottomSheet
        open={addOpen}
        title={`添加到「${addChildTarget ? clampText(addChildTarget.title, 12) : path.length > 1 ? path[path.length - 1].title : library.title}」`}
        onClose={() => {
          setAddOpen(false);
          setAddChildTarget(null);
        }}
      >
        <input
          value={addTitle}
          onChange={event => setAddTitle(event.target.value)}
          placeholder="文档标题…"
          className="input-base mb-3.5 w-full px-4 py-3 text-[14.5px]"
        />
        <button
          type="button"
          disabled={createItem.isPending}
          onClick={handleCreateDocument}
          className="bg-sage-soft text-sage mb-3 flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-[14.5px] font-bold transition-transform active:scale-[0.97] disabled:opacity-60"
        >
          <FilePlus2 size={17} strokeWidth={2.2} />
          新建文档
        </button>
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            className="bg-input flex items-center gap-2.5 rounded-2xl p-3.5 text-left transition-transform active:scale-[0.97]"
            onClick={() => {
              setAddOpen(false);
              setLinkOpen(true);
            }}
          >
            <span className="bg-apricot-soft text-apricot grid h-10 w-10 shrink-0 place-items-center rounded-xl">
              <Layers size={18} strokeWidth={2} />
            </span>
            <span>
              <span className="text-ink block text-[13.5px] font-bold">关联卡片</span>
              <span className="text-ink-3 block text-[11px]">引用，不复制</span>
            </span>
          </button>
          <button
            type="button"
            className="bg-input flex items-center gap-2.5 rounded-2xl p-3.5 text-left transition-transform active:scale-[0.97]"
            onClick={() => {
              setAddOpen(false);
              setLinkOpen(true);
            }}
          >
            <span className="bg-rose-soft text-rose grid h-10 w-10 shrink-0 place-items-center rounded-xl">
              <FileText size={18} strokeWidth={2} />
            </span>
            <span>
              <span className="text-ink block text-[13.5px] font-bold">关联文章</span>
              <span className="text-ink-3 block text-[11px]">引用，不复制</span>
            </span>
          </button>
        </div>
      </BottomSheet>

      <LinkPickerSheet
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        onPick={pick => {
          createItem.mutate(
            {
              documentId: props.libraryId,
              parentId: currentId ?? undefined,
              title: pick.title,
              refType: pick.refType,
              refId: pick.refId,
            },
            {
              onSuccess: () => toast({ type: "success", text: "已添加关联" }),
              onError: error => props.onError(error, "添加关联失败"),
            }
          );
        }}
      />

      <ActionSheet
        open={menuItem !== null}
        title={menuItem?.title}
        onClose={() => setMenuItem(null)}
        kind="知识节点"
        items={[
          {
            label: "添加子文档",
            icon: <FolderPlus size={18} />,
            tone: "sky",
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
              setDeleteTarget(menuItem);
              setMenuItem(null);
            },
          },
        ]}
      />

      <MobileConfirmDialog
        open={deleteTarget !== null}
        title="删除节点"
        description={`「${clampText(deleteTarget?.title ?? "", 16)}」及其子节点将被删除，被其他库引用的节点会自动脱离。`}
        danger
        loading={deleteItem.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            deleteItem.mutate(deleteTarget.id);
          }
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}

export default KnowledgeDetailPage;
