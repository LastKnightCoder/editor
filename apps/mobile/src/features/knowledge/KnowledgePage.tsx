// 知识库列表（v1.1 设计稿）：纯文档树 + 跨内容关联；
// 检索交给右上角全局搜索入口（与现有全局搜索一致）。

import { useMemo, useState } from "react";
import { VirtualContainerList } from "../../components/VirtualContainerList";
import { BookMarked, Ellipsis, Link2, Plus, Search, Star, Trash2 } from "lucide-react";
import type { DocumentLibrary } from "../../types";
import { clampText } from "../../utils/richTextText";
import { formatTimeDisplay } from "../../utils/formatTime";
import BottomSheet from "../../components/BottomSheet";
import { PageHeader, PageHeaderButton } from "../../components/PageHeader";
import ActionSheet from "../../components/ActionSheet";
import MobileConfirmDialog from "../../components/MobileConfirmDialog";
import {
  useLibraryCreate,
  useLibraryDelete,
  useLibraryUpdate,
  useDocumentLibrariesQuery,
} from "./queries";

const LIB_GRADIENTS = [
  "linear-gradient(135deg,#d3e2cf,#a3c2a0)",
  "linear-gradient(135deg,#cfdff0,#9db9d8)",
  "linear-gradient(135deg,#e2daf1,#b7a6d8)",
  "linear-gradient(135deg,#f1e5bf,#dcc684)",
];

export function libGradient(id: number): string {
  return LIB_GRADIENTS[Math.abs(id) % LIB_GRADIENTS.length];
}

type KnowledgePageProps = {
  onBack: () => void;
  onOpenLibrary: (libraryId: number) => void;
  onOpenSearch: () => void;
  onError: (error: unknown, fallback: string) => void;
};

export function KnowledgePage(props: KnowledgePageProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [menuLibrary, setMenuLibrary] = useState<DocumentLibrary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentLibrary | null>(null);

  const librariesQuery = useDocumentLibrariesQuery();
  const libraries = librariesQuery.data?.pages.flatMap(page => page.items) ?? [];
  const { isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } = librariesQuery;
  const createLibrary = useLibraryCreate();
  const updateLibrary = useLibraryUpdate();
  const deleteLibrary = useLibraryDelete();

  const statsMap = useMemo(
    () =>
      new Map(
        libraries.map(
          library => [library.id, { nodes: library.itemCount, links: library.linkCount }] as const
        )
      ),
    [libraries]
  );

  const handleCreate = () => {
    const title = createTitle.trim();
    if (!title) {
      return;
    }
    createLibrary.mutate(
      { title, desc: createDesc.trim() || undefined },
      {
        onSuccess: () => {
          setCreateOpen(false);
          setCreateTitle("");
          setCreateDesc("");
        },
        onError: error => props.onError(error, "新建知识库失败"),
      }
    );
  };

  return (
    <div className="mobile-kb-screen bg-page fixed inset-0 z-50 flex flex-col">
      <PageHeader
        title="知识库"
        onBack={props.onBack}
        actions={
          <>
            <PageHeaderButton
              icon={<Search size={17} strokeWidth={2} />}
              aria-label="全局搜索"
              onClick={props.onOpenSearch}
            />
            <PageHeaderButton
              icon={<Plus size={18} strokeWidth={2.6} />}
              variant="brand"
              aria-label="新建知识库"
              onClick={() => setCreateOpen(true)}
            />
          </>
        }
      />

      {/* 二级页无吸底 Dock，底部只留常规呼吸空间（dock-pad 是给 Dock 页面的 110px 留白） */}
      <div
        className="flex min-h-0 flex-1 flex-col overscroll-contain px-4 pt-2"
        style={{ paddingBottom: "calc(32px + var(--mobile-safe-bottom))" }}
      >
        {isLoading ? (
          <div className="card space-y-3 p-4">
            <div className="bg-input h-4 w-2/5 animate-pulse rounded" />
            <div className="bg-input h-4 w-4/5 animate-pulse rounded" />
          </div>
        ) : (libraries ?? []).length === 0 ? (
          <div className="py-16 text-center">
            <BookMarked size={36} strokeWidth={1.4} className="text-ink-3 mx-auto" />
            <p className="text-ink-2 mt-3 text-sm">还没有知识库</p>
            <p className="text-ink-3 mt-1 text-xs">一个主题一棵树，节点之间可以互相引用</p>
          </div>
        ) : (
          <VirtualContainerList
            items={libraries}
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            fetchNextPage={fetchNextPage}
            edgeFade
            className="edge-fade-scroll relative flex-1 overflow-y-auto"
            renderItem={(library, index) => {
              const stats = statsMap.get(library.id) ?? { nodes: 0, links: 0 };
              return (
                <article
                  key={library.id}
                  className="card p-4 transition-transform active:scale-[0.98]"
                  style={{
                    animation: "pop-in .5s var(--ease-bounce) backwards",
                    animationDelay: `${Math.min(index, 8) * 0.05}s`,
                  }}
                  onClick={() => props.onOpenLibrary(library.id)}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-[15px]"
                      style={{ background: libGradient(library.id) }}
                    >
                      <BookMarked size={20} strokeWidth={1.9} className="text-white/90" />
                    </span>
                    <p className="text-ink min-w-0 flex-1 truncate text-base font-bold">
                      {library.title}
                    </p>
                    {library.isTop ? (
                      <Star size={14} fill="currentColor" className="text-apricot shrink-0" />
                    ) : null}
                    <button
                      type="button"
                      aria-label="库操作"
                      className="text-ink-3 active:bg-press -mr-1.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg"
                      onClick={event => {
                        event.stopPropagation();
                        setMenuLibrary(library);
                      }}
                    >
                      <Ellipsis size={16} />
                    </button>
                  </div>
                  {library.descText ? (
                    <p className="text-ink-2 mt-2.5 line-clamp-2 text-[12.5px] leading-relaxed">
                      {clampText(library.descText, 56)}
                    </p>
                  ) : null}
                  <div className="text-ink-3 mt-2.5 flex items-center gap-2 text-[11px] tabular-nums">
                    <span>{stats.nodes} 节点</span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <Link2 size={10} strokeWidth={2.4} />
                      {stats.links} 关联
                    </span>
                    <span>·</span>
                    <span>{formatTimeDisplay(library.updateTime)}</span>
                  </div>
                </article>
              );
            }}
          />
        )}
      </div>

      <BottomSheet open={createOpen} title="新建知识库" onClose={() => setCreateOpen(false)}>
        <input
          value={createTitle}
          onChange={event => setCreateTitle(event.target.value)}
          placeholder="知识库名称，如：写作系统"
          className="input-base mb-2.5 w-full px-4 py-3 text-[14.5px]"
        />
        <input
          value={createDesc}
          onChange={event => setCreateDesc(event.target.value)}
          placeholder="一句话描述（可选）"
          className="input-base mb-3.5 w-full px-4 py-3 text-[14.5px]"
        />
        <button
          type="button"
          disabled={createLibrary.isPending}
          onClick={handleCreate}
          className="shadow-accent mt-1 w-full rounded-full py-3.5 text-[15px] font-bold text-white transition-transform active:scale-[0.97] disabled:opacity-60"
          style={{ background: "var(--brand-grad)" }}
        >
          创建
        </button>
      </BottomSheet>

      <ActionSheet
        open={menuLibrary !== null}
        title={menuLibrary?.title}
        kind="知识库"
        onClose={() => setMenuLibrary(null)}
        items={[
          {
            label: menuLibrary?.isTop ? "取消置顶" : "置顶",
            icon: <Star size={18} />,
            tone: "butter",
            onClick: () => {
              if (menuLibrary) {
                updateLibrary.mutate({ id: menuLibrary.id, isTop: !menuLibrary.isTop });
              }
              setMenuLibrary(null);
            },
          },
          {
            label: "删除知识库",
            danger: true,
            icon: <Trash2 size={18} />,
            onClick: () => {
              setDeleteTarget(menuLibrary);
              setMenuLibrary(null);
            },
          },
        ]}
      />

      <MobileConfirmDialog
        open={deleteTarget !== null}
        title="删除知识库"
        description={`「${clampText(deleteTarget?.title ?? "", 18)}」及其节点将被删除，被其他库引用的节点会自动脱离。`}
        danger
        loading={deleteLibrary.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            deleteLibrary.mutate(deleteTarget.id);
          }
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}

export default KnowledgePage;
