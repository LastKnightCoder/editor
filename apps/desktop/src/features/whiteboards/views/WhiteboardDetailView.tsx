import useSettingStore from "@/stores/useSettingStore";
import { resolveWhiteboardDocumentPage } from "@/commands/whiteboard-document";
import type { WhiteboardElementSnapshot } from "@tau/collaboration";
/**
 * 白板详情（多页）：一整张画布纸面，页签条浮在纸内左下角（与右下状态栏同款 chrome，一左一右），
 * 元素树展开时让到停靠栏右侧；演示时与状态栏一起收起。
 *
 * 页面参数：id = 白板 id，page = 当前页（子白板）id，缺省为上次停留页 → 第一页。
 * 同一块白板内切页经栈机原位更新参数，不进后退历史；停留页记回主进程（查看状态，不刷新更新时间）。
 * 标题栏面包屑「上级白板 › … › 白板名 / 页名」：上级来自 trail（画布里嵌入的白板卡片一路点进来的链），
 * 点上级回到那一级当时的页并定位来源卡片；点当前白板名打开编辑信息。切页保留 trail。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { ConfirmDialog, Loading, Menu, toast } from "@tau/ui";
import { usePage, usePageBreadcrumb, usePageParams } from "@/page/PageProvider";
import { BoardCanvas, type BoardCanvasHandle } from "../components/BoardCanvas";
import { SheetBar } from "../components/SheetBar";
import { OutlineToggle } from "../components/OutlineToggle";
import { WhiteboardInfoDialog } from "../components/WhiteboardInfoDialog";
import { displayTitle, parseTrail, rankTags, type TrailStep, type WhiteboardItem } from "../model";
import {
  WhiteboardNavContext,
  requestReveal,
  trailStepParams,
  type WhiteboardNav,
} from "../navigation";
import {
  useWhiteboardDetail,
  useWhiteboardMutations,
  useWhiteboardPageMutations,
  useWhiteboards,
} from "../queries";

const PAGE_KEY = "whiteboard-detail";

export function WhiteboardDetailView() {
  const { id, page, trail } = usePageParams<{ id: number; page?: number; trail?: string }>();
  return <Detail key={id} id={id} page={page} trailParam={trail} />;
}

function Detail({ id, page, trailParam }: { id: number; page?: number; trailParam?: string }) {
  const { navigator } = usePage();
  const { board, loading } = useWhiteboardDetail(id);
  const pageMutations = useWhiteboardPageMutations(id);
  const mutations = useWhiteboardMutations();
  const { items } = useWhiteboards();
  const canvasRef = useRef<BoardCanvasHandle>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const infoTitle = useRef("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [dockWidth, setDockWidth] = useState(0);

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
  const databaseName = useSettingStore(state => state.setting.database.active);
  const documentId = (
    board?.whiteBoardContentList.find(item => item.id === activeId)?.data as
      | { documentId?: string }
      | undefined
  )?.documentId;
  const documentPage = (contentId: number) => {
    const pageId = (
      board?.whiteBoardContentList.find(item => item.id === contentId)?.data as
        | { pageId?: string }
        | undefined
    )?.pageId;
    if (!pageId || !canvasRef.current?.document) throw new Error("白板文档尚未就绪");
    return { pageId, api: canvasRef.current.document };
  };
  const addPage = async (name: string) => {
    if (!documentId) return pageMutations.add(name);
    const api = canvasRef.current?.document;
    if (!api) throw new Error("白板文档尚未就绪");
    const { createdIds } = await api.submit([{ type: "create_page", title: name }]);
    return resolveWhiteboardDocumentPage(databaseName, documentId, createdIds[0]);
  };
  const renamePage = async (contentId: number, name: string) => {
    if (!documentId) return pageMutations.rename(contentId, name);
    const { pageId, api } = documentPage(contentId),
      current = api.snapshot().pages.find(page => page.id === pageId);
    if (!current) throw new Error("画板页已失效");
    await api.submit([
      {
        type: "edit_page_title",
        id: pageId,
        edit: { offset: 0, remove: current.title.length, text: name },
      },
    ]);
  };
  const removePage = async (contentId: number) => {
    if (!documentId) return pageMutations.remove(contentId);
    const { pageId, api } = documentPage(contentId),
      snapshot = api.snapshot(),
      target = snapshot.pages.find(page => page.id === pageId);
    if (!target || snapshot.pages.length <= 1) throw new Error("白板至少保留一页");
    const ids = (nodes: readonly WhiteboardElementSnapshot[]): string[] =>
      nodes.flatMap(node => [node.id, ...ids(node.children)]);
    await api.submit([
      {
        type: "remove_page",
        id: pageId,
        observedElementIds: ids([...target.children, ...target.recovery]),
      },
    ]);
  };
  const reorderPages = async (ids: number[]) => {
    if (!documentId) return pageMutations.reorder(ids);
    const api = canvasRef.current?.document;
    if (!api || api.snapshot().pages.length !== ids.length)
      throw new Error("页面列表已变化，请重试");
    const pageIds = ids.map(id => documentPage(id).pageId);
    if (new Set(pageIds).size !== pageIds.length) throw new Error("页面顺序无效");
    await api.submit(pageIds.map(id => ({ type: "move_page", id })));
  };

  // 记住停留页（从列表点某一页进来、或切页后）
  useEffect(() => {
    if (!board || activeId === null || board.activeWhiteBoardContentId === activeId) return;
    void pageMutations.setActive(activeId).catch(() => undefined);
  }, [board, activeId, pageMutations]);

  const go = useCallback(
    (pageId: number) => {
      const current = navigator.current();
      if (current?.key === PAGE_KEY && current.params.id === id)
        navigator.push(PAGE_KEY, { id, page: pageId, trail: trailParam });
    },
    [navigator, id, trailParam]
  );

  const trail = useMemo(() => parseTrail(trailParam), [trailParam]);
  const nav = useMemo<WhiteboardNav | null>(
    () => (activeId === null ? null : { boardId: id, pageId: activeId, trail }),
    [id, activeId, trail]
  );
  const itemById = useMemo(() => new Map((items ?? []).map(item => [item.id, item])), [items]);
  const backTo = useCallback(
    (index: number) => {
      const step = trail[index];
      requestReveal(step.pageId, step.elementId);
      navigator.push(PAGE_KEY, trailStepParams(trail, index));
    },
    [navigator, trail]
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
          <TrailCrumbs trail={trail} itemById={itemById} onSelect={backTo} />
          <button
            type="button"
            title="编辑信息"
            onClick={() => {
              infoTitle.current =
                canvasRef.current?.document?.snapshot().title ?? board?.title ?? "";
              setInfoOpen(true);
            }}
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
    [board, pages.length, activePage, trail, itemById, backTo]
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
    <div className="relative flex h-full min-h-0 flex-col px-4 pt-1 pb-4">
      <div className="bg-surface shadow-card rounded-tau-lg relative min-h-0 flex-1 overflow-hidden">
        <WhiteboardNavContext value={nav}>
          <BoardCanvas
            key={documentId ?? activeId}
            id={activeId}
            ref={canvasRef}
            collaboration
            onPresentationModeChange={setPresenting}
            onDockWidthChange={setDockWidth}
          />
        </WhiteboardNavContext>

        {/* 页签条：纸内左下，让开元素树停靠栏；右侧给状态栏（约 340px）留位，页多时页签横向滚动 */}
        {!presenting && (
          <SheetBar
            className="absolute bottom-3 z-[7]"
            style={{
              left: dockWidth + 12,
              maxWidth: `max(200px, calc(100% - ${dockWidth + 12}px - 364px))`,
            }}
            pages={pages}
            textBinding={
              documentId
                ? id => {
                    const { pageId, api } = documentPage(id);
                    return api.pageTitle(pageId);
                  }
                : undefined
            }
            activeId={activeId}
            onSelect={pageId => pageId !== activeId && go(pageId)}
            onAdd={() =>
              void addPage(`第 ${pages.length + 1} 页`)
                .then(go)
                .catch(fail("新建页失败"))
            }
            onRename={(pageId, name) => void renamePage(pageId, name).catch(fail("改名失败"))}
            onDuplicate={pageId =>
              void (async () => {
                if (documentId) {
                  const { pageId: source, api } = documentPage(pageId);
                  const copied = await api.duplicatePage(source);
                  go(await resolveWhiteboardDocumentPage(databaseName, documentId, copied));
                  return;
                }
                if (pageId === activeId) await canvasRef.current?.flush();
                go(await pageMutations.duplicate(pageId));
              })().catch(fail("复制失败"))
            }
            onDelete={pageId => {
              setDeleteTarget(pages.find(p => p.id === pageId) ?? null);
              setDeleteOpen(true);
            }}
            onReorder={ids => void reorderPages(ids).catch(fail("排序失败"))}
          />
        )}
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={next => !next && setDeleteOpen(false)}
        title="删除这一页"
        context={deleteTarget?.name || "未命名"}
        description="这一页上的所有元素会一起删除，其他页不受影响。"
        impact={documentId ? "可通过撤销恢复" : "删除后无法恢复"}
        danger
        confirmText="删除"
        loading={deleting}
        onConfirm={async () => {
          if (!deleteTarget) return;
          const index = pages.findIndex(p => p.id === deleteTarget.id);
          const neighbor = pages[index + 1] ?? pages[index - 1];
          setDeleting(true);
          try {
            if (documentId) {
              await removePage(deleteTarget.id);
              if (neighbor) go(neighbor.id);
            } else {
              if (deleteTarget.id === activeId && neighbor) {
                // 先把这一页未落库的改动存完、切走，再删——免得卸载时的保存落在已删除的页上
                await canvasRef.current?.flush();
                go(neighbor.id);
                await new Promise(requestAnimationFrame);
              }
              await removePage(deleteTarget.id);
            }
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
          if (documentId) {
            const api = canvasRef.current?.document;
            if (!api) throw new Error("白板文档尚未就绪");
            const current = api.snapshot().title,
              desired = next.title.trim();
            if (
              desired !== infoTitle.current.trim() &&
              current !== infoTitle.current &&
              current !== desired
            )
              throw new Error("标题已被其他编辑更新，当前输入已保留，请核对后再保存");
            if (desired !== infoTitle.current.trim() && current !== desired)
              await api.submit([
                {
                  type: "edit_title",
                  edit: { offset: 0, remove: current.length, text: desired },
                },
              ]);
          }
          await mutations.saveInfo(id, next, !!documentId);
          toast.success("已保存");
        }}
      />
    </div>
  );
}

/** 链上最多平铺的上级数，多出的中间级折进「…」菜单（保留第一级与最近两级） */
const MAX_CRUMBS = 3;

function stepLabel(step: TrailStep, item: WhiteboardItem | undefined) {
  if (!item) return "白板";
  const title = displayTitle(item);
  if (item.pages.length <= 1) return title;
  const page = item.pages.find(p => p.id === step.pageId);
  return page ? `${title} · ${page.name || "未命名"}` : title;
}

/** 上级白板面包屑：点击回到那一级当时的页 */
function TrailCrumbs({
  trail,
  itemById,
  onSelect,
}: {
  trail: TrailStep[];
  itemById: Map<number, WhiteboardItem>;
  onSelect(index: number): void;
}) {
  if (!trail.length) return null;
  const indexes = trail.map((_, i) => i);
  const folded = trail.length > MAX_CRUMBS ? indexes.slice(1, trail.length - (MAX_CRUMBS - 1)) : [];
  const shown = indexes.filter(i => !folded.includes(i));
  const separator = <ChevronRight className="text-ink-3 size-3 shrink-0" strokeWidth={2} />;

  return (
    <>
      {shown.map((index, n) => {
        const label = stepLabel(trail[index], itemById.get(trail[index].boardId));
        return (
          <span key={index} className="flex min-w-0 shrink items-center gap-1.5">
            {n === 1 && folded.length > 0 && (
              <>
                <Menu
                  trigger={
                    <button
                      type="button"
                      title="更多上级白板"
                      className="text-ink-2 hover:bg-hover shrink-0 rounded-[6px] px-1.5 py-0.5"
                    >
                      …
                    </button>
                  }
                >
                  {folded.map(i => (
                    <Menu.Item key={i} onSelect={() => onSelect(i)}>
                      {stepLabel(trail[i], itemById.get(trail[i].boardId))}
                    </Menu.Item>
                  ))}
                </Menu>
                {separator}
              </>
            )}
            <button
              type="button"
              title={`回到「${label}」`}
              onClick={() => onSelect(index)}
              className="text-ink-2 hover:text-ink-1 hover:bg-hover max-w-[160px] min-w-0 truncate rounded-[6px] px-1.5 py-0.5"
            >
              {label}
            </button>
            {separator}
          </span>
        );
      })}
    </>
  );
}
