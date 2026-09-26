/**
 * 白板详情（多页）：一整张画布纸面，页签条浮在纸内左下角（与右下状态栏同款 chrome，一左一右），
 * 元素树展开时让到停靠栏右侧；演示时与状态栏一起收起。
 *
 * 页面参数：id = 白板 id，page = 当前页（子白板）id，缺省为上次停留页 → 第一页。
 * 同一块白板内切页经栈机原位更新参数，不进后退历史；停留页记回主进程（查看状态，不刷新更新时间）。
 * 标题栏面包屑「白板名 / 页名」，点白板名打开编辑信息。画布本身（工具条 / 属性栏 / 状态栏等）本轮不换皮。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog, Loading, toast } from "@tau/ui";
import { usePage, usePageBreadcrumb, usePageParams } from "@/page/PageProvider";
import { useWhiteboardOutlineStore } from "@/components/WhiteBoard/components/Sidebar/outlineStore";
import { BoardCanvas, type BoardCanvasHandle } from "../components/BoardCanvas";
import { SheetBar } from "../components/SheetBar";
import { OutlineToggle } from "../components/OutlineToggle";
import { WhiteboardInfoDialog } from "../components/WhiteboardInfoDialog";
import { rankTags } from "../model";
import {
  useWhiteboardDetail,
  useWhiteboardMutations,
  useWhiteboardPageMutations,
  useWhiteboards,
} from "../queries";

const PAGE_KEY = "whiteboard-detail";

export function WhiteboardDetailView() {
  const { id, page } = usePageParams<{ id: number; page?: number }>();
  return <Detail key={id} id={id} page={page} />;
}

function Detail({ id, page }: { id: number; page?: number }) {
  const { navigator } = usePage();
  const { board, loading } = useWhiteboardDetail(id);
  const pageMutations = useWhiteboardPageMutations(id);
  const mutations = useWhiteboardMutations();
  const { items } = useWhiteboards();
  const canvasRef = useRef<BoardCanvasHandle>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const dockWidth = useWhiteboardOutlineStore(s => s.dockWidth);

  const pages = useMemo(
    () => (board?.whiteBoardContentList ?? []).map(p => ({ id: p.id, name: p.name })),
    [board]
  );
  const activeId = useMemo(() => {
    if (page !== undefined && pages.some(p => p.id === page)) return page;
    const stored = board?.activeWhiteBoardContentId;
    if (stored != null && pages.some(p => p.id === stored)) return stored;
    return pages[0]?.id ?? null;
  }, [page, pages, board?.activeWhiteBoardContentId]);
  const activePage = pages.find(p => p.id === activeId);

  // 记住停留页（从列表点某一页进来、或切页后）
  useEffect(() => {
    if (!board || activeId === null || board.activeWhiteBoardContentId === activeId) return;
    void pageMutations.setActive(activeId).catch(() => undefined);
  }, [board, activeId, pageMutations]);

  const go = useCallback(
    (pageId: number) => navigator.push(PAGE_KEY, { id, page: pageId }),
    [navigator, id]
  );

  // ⌃PageUp / ⌃PageDown 切页（同浏览器标签页；仅本页在栈顶时）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const top = navigator.current();
      if (top?.key !== PAGE_KEY || top.params.id !== id || e.defaultPrevented) return;
      if (!e.ctrlKey || (e.key !== "PageUp" && e.key !== "PageDown")) return;
      const index = pages.findIndex(p => p.id === activeId);
      const next = pages[index + (e.key === "PageDown" ? 1 : -1)];
      e.preventDefault();
      if (next) go(next.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigator, id, pages, activeId, go]);

  const breadcrumb = useMemo(
    () =>
      board ? (
        <span className="text-tau-meta flex min-w-0 items-center gap-1.5">
          <OutlineToggle />
          <button
            type="button"
            title="编辑信息"
            onClick={() => setInfoOpen(true)}
            className="text-ink-1 hover:bg-hover min-w-0 truncate rounded-[6px] px-1.5 py-0.5 font-medium"
          >
            {board.title.trim() || "未命名白板"}
          </button>
          {pages.length > 1 && activePage && (
            <>
              <span className="text-ink-3">/</span>
              <span className="text-ink-2 min-w-0 truncate">{activePage.name || "未命名"}</span>
            </>
          )}
        </span>
      ) : null,
    [board, pages.length, activePage]
  );
  usePageBreadcrumb(PAGE_KEY, breadcrumb);

  const knownTags = useMemo(() => rankTags(items ?? []).map(t => t.name), [items]);
  // 只随信息本身变化（切页也会更新 board，不能让打开着的编辑弹窗被重置）
  const title = board?.title;
  const description = board?.description;
  const tagsKey = JSON.stringify(board?.tags ?? []);
  const info = useMemo(
    () =>
      title === undefined
        ? null
        : { title, description: description ?? "", tags: JSON.parse(tagsKey) as string[] },
    [title, description, tagsKey]
  );

  if (loading) return <Loading />;
  if (!board || activeId === null)
    return <div className="text-ink-2 p-6">白板不存在或读取失败</div>;

  const fail = (text: string) => () => toast.error(text);

  return (
    <div className="relative flex h-full min-h-0 flex-col px-4 pb-4 pt-1">
      <div className="bg-surface shadow-card rounded-tau-lg relative min-h-0 flex-1 overflow-hidden">
        <BoardCanvas
          key={activeId}
          id={activeId}
          ref={canvasRef}
          onPresentationModeChange={setPresenting}
        />

        {/* 页签条：纸内左下，让开元素树停靠栏；右侧给状态栏（约 340px）留位，页多时页签横向滚动 */}
        {!presenting && (
          <SheetBar
            className="absolute bottom-3 z-[7]"
            style={{
              left: dockWidth + 12,
              maxWidth: `max(200px, calc(100% - ${dockWidth + 12}px - 364px))`,
            }}
            pages={pages}
            activeId={activeId}
            onSelect={pageId => pageId !== activeId && go(pageId)}
            onAdd={() =>
              void pageMutations
                .add(`第 ${pages.length + 1} 页`)
                .then(go)
                .catch(fail("新建页失败"))
            }
            onRename={(pageId, name) =>
              void pageMutations.rename(pageId, name).catch(fail("改名失败"))
            }
            onDuplicate={pageId =>
              void (async () => {
                if (pageId === activeId) await canvasRef.current?.flush();
                go(await pageMutations.duplicate(pageId));
              })().catch(fail("复制失败"))
            }
            onDelete={pageId => {
              setDeleteTarget(pages.find(p => p.id === pageId) ?? null);
              setDeleteOpen(true);
            }}
            onReorder={ids => void pageMutations.reorder(ids).catch(fail("排序失败"))}
          />
        )}
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={next => !next && setDeleteOpen(false)}
        title="删除这一页"
        context={deleteTarget?.name || "未命名"}
        description="这一页上的所有元素会一起删除，其他页不受影响。"
        impact="删除后无法恢复"
        danger
        confirmText="删除"
        loading={deleting}
        onConfirm={async () => {
          if (!deleteTarget) return;
          const index = pages.findIndex(p => p.id === deleteTarget.id);
          const neighbor = pages[index + 1] ?? pages[index - 1];
          setDeleting(true);
          try {
            if (deleteTarget.id === activeId && neighbor) {
              // 先把这一页未落库的改动存完、切走，再删——免得卸载时的保存落在已删除的页上
              await canvasRef.current?.flush();
              go(neighbor.id);
              await new Promise(requestAnimationFrame);
            }
            await pageMutations.remove(deleteTarget.id);
            setDeleteOpen(false);
            toast.success(`已删除「${deleteTarget.name || "未命名"}」`);
          } catch {
            toast.error("删除失败");
          } finally {
            setDeleting(false);
          }
        }}
      />

      <WhiteboardInfoDialog
        open={infoOpen}
        initial={info}
        knownTags={knownTags}
        onClose={() => setInfoOpen(false)}
        onSubmit={async next => {
          await mutations.saveInfo(id, next);
          toast.success("已保存");
        }}
      />
    </div>
  );
}
