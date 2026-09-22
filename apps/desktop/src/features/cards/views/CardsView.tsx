/**
 * 卡片库主视图：工具栏（导入 / 新建右上角）→ 筛选行（分类 chips）→
 * 左侧分类标签树 + 主体三视图（卡片墙 / 图谱 / 表格）。
 *
 * 视图分工：卡片墙 = 等高网格 + 时间分组 + 行级虚拟滚动（本域实现）；
 * 图谱 = 既有 LinkGraph 复用；表格 = 既有 CardDatabaseView（Database 组件）复用。
 * 视图切换在标题栏面包屑（「卡片库 / [卡片墙 ▾]」，usePageBreadcrumb 注入），
 * 筛选行只留内容筛选；本页只做分类与标签筛选，不设页内搜索——语义检索由全局命令面板（Ctrl+K）承担。
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePage, usePageBreadcrumb, usePageStatusBar } from "@/page/PageProvider";
import { Download, Layers, PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import type { Descendant } from "slate";
import "../cards.css";
import { ECardCategory, type ICard } from "@/types";
import { cardCategoryName } from "@/constants/card";
import { isElectron } from "@/electron";
import useSettingStore from "@/stores/useSettingStore";
import PresentationMode from "@/components/PresentationMode";
import CardDatabaseView from "@/components/CardDatabaseView";
import ContentExportModal from "@/components/ContentExportModal";
import EpubExportModal from "@/components/EpubExportModal";
import { PdfExportModal } from "@/components/PdfExportModal";
import { getScopedCard, openCardInNewWindow } from "@/commands/card";
import { readTextFile, selectFile } from "@/commands";
import { downloadMarkdown, getContentLength, getMarkdown, importFromMarkdown } from "@/utils";
import { getEditorText } from "@/utils/editor";
import { Button, ConfirmDialog, IconButton, Loading, toast, cn } from "@tau/ui";
import {
  buildTagTree,
  cardDetailKey,
  filterCards,
  sortCards,
  useCardDetail,
  useCardsFeed,
  useCardsMutations,
} from "../queries";
import { CardWallList } from "../components/CardWallList";
import { CardTreePanel } from "../components/CardTreePanel";
import { CardPreviewDialog } from "../components/CardPreviewDialog";
import { CardViewSwitcher } from "../components/CardViewSwitcher";
import { CreateCardDialog } from "../components/CreateCardDialog";
import { CardGraphSection } from "../components/CardGraphSection";
import { CATEGORY_COLORS } from "../categoryColors";
import type { CardFilter, CardItemActions, CardTagNode } from "../types";
import {
  DEFAULT_CARDS_PREFERENCES,
  useCardsPreferencesStore,
  type CardsViewMode,
} from "../preferences";

const CATEGORY_ORDER: ("all" | ECardCategory)[] = [
  "all",
  ECardCategory.Temporary,
  ECardCategory.Literature,
  ECardCategory.Permanent,
  ECardCategory.Theme,
];

export function CardsView() {
  const { navigator } = usePage();
  const feed = useCardsFeed();
  const mutations = useCardsMutations();
  const queryClient = useQueryClient();
  const databaseName = useSettingStore(state => state.setting.database.active);

  const preferences = useCardsPreferencesStore(
    state => state.byDatabase[databaseName] ?? DEFAULT_CARDS_PREFERENCES
  );
  const updatePreferences = useCardsPreferencesStore(state => state.update);
  const { view, category, tag, treeCollapsed } = preferences;
  const filter = useMemo<CardFilter>(() => ({ category, tag }), [category, tag]);
  const setView = useCallback(
    (next: CardsViewMode) => updatePreferences(databaseName, { view: next }),
    [updatePreferences, databaseName]
  );
  const setFilter = (update: (current: CardFilter) => CardFilter) =>
    updatePreferences(databaseName, update(filter));
  const resetScrollKey = JSON.stringify([category, tag]);
  const [previewCardId, setPreviewCardId] = useState<number | null>(null);
  const openPreview = useCallback((card: ICard) => setPreviewCardId(card.id), []);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ICard | null>(null);
  const [presenting, setPresenting] = useState<ICard | null>(null);
  const [exportingImage, setExportingImage] = useState<ICard | null>(null);
  const [exportingEpub, setExportingEpub] = useState<ICard | null>(null);
  const [exportingPdf, setExportingPdf] = useState<ICard | null>(null);
  const [createDefaultCategory, setCreateDefaultCategory] = useState<ECardCategory | null>(null);
  /** 数据库视图删除确认桥：其 onDeleteCard 约定 Promise resolve 即删行、reject 即取消 */
  const deleteBridge = useRef<{ resolve(): void; reject(error: Error): void } | null>(null);

  /* 标签树只派生一次：左树与状态栏读数（组数/链接数）共用 */
  const tagTree = useMemo(() => buildTagTree(feed.cards), [feed.cards]);
  const tagNodeCount = useMemo(
    () => tagTree.reduce((sum, node) => sum + countTreeNodes(node), 0),
    [tagTree]
  );
  const linkCount = useMemo(
    () => feed.cards.reduce((sum, card) => sum + card.links.length, 0),
    [feed.cards]
  );

  /* sorted = 排序全集（图谱全集 / 表格 allCards），filtered = 分类 / 标签过滤结果 */
  const sorted = useMemo(() => sortCards(feed.cards), [feed.cards]);
  const filtered = useMemo(() => filterCards(feed.cards, filter), [feed.cards, filter]);
  const highlightIds = useMemo(() => filtered.map(card => card.id), [filtered]);
  const categoryCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const card of feed.cards) counts.set(card.category, (counts.get(card.category) ?? 0) + 1);
    return counts;
  }, [feed.cards]);
  const totalWords = useMemo(
    () => feed.cards.reduce((sum, card) => sum + card.count, 0),
    [feed.cards]
  );
  /* 弹窗基准卡 = 单卡全量按需拉取（列表缓存只有预览块，弹窗可编辑需全文） */
  const previewCardQuery = useCardDetail(previewCardId);
  const previewCard = previewCardId == null ? null : (previewCardQuery.data ?? null);

  /* 全局状态栏（usePageStatusBar，仅栈顶显示；node 须 useMemo 稳定化）：右侧展示知识库读数 */
  const statusBarNode = useMemo(
    () => (
      <div className="text-tau-sm text-ink-3 flex min-w-0 flex-1 items-center gap-3.5 tabular-nums">
        <span className="flex-1" />
        <span>
          {tagNodeCount} 组标签 · {linkCount} 条连接
        </span>
      </div>
    ),
    [tagNodeCount, linkCount]
  );
  usePageStatusBar("cards", statusBarNode);

  /* 标题栏面包屑（usePageBreadcrumb）：「卡片库 / [视图速切器]」——node 须 useMemo 稳定化 */
  const breadcrumbNode = useMemo(
    () => (
      <span className="text-tau-meta text-ink-2 flex min-w-0 items-center gap-1">
        <span className="px-1.5 py-0.5">卡片库</span>
        <span className="text-ink-3">/</span>
        <CardViewSwitcher value={view} onChange={setView} />
      </span>
    ),
    [view, setView]
  );
  usePageBreadcrumb("cards", breadcrumbNode);

  /* 数据库视图删除确认桥：确认 / 取消结果由 ConfirmDialog 回调经 bridge 推进 */
  const handleDatabaseDelete = (cardId: number) =>
    new Promise<void>((resolve, reject) => {
      const card = feed.cards.find(item => item.id === cardId);
      if (!card) return reject(new Error("card not found"));
      setPendingDelete(card);
      deleteBridge.current = { resolve, reject };
    });

  /* 导出 / 演示需要全文：经单卡详情键按需取（与弹窗共用缓存），列表预览块不承载全文 */
  const requireFullCard = async (card: ICard): Promise<ICard | null> => {
    if (!databaseName) return null;
    try {
      return await queryClient.fetchQuery({
        queryKey: cardDetailKey(databaseName, card.id),
        queryFn: () => getScopedCard(databaseName, card.id),
      });
    } catch {
      toast.error("读取卡片失败");
      return null;
    }
  };

  const actions: CardItemActions = {
    onOpen: card => setPreviewCardId(card.id),
    onOpenDetail: card => navigator.push("card-detail", { id: card.id }),
    onToggleTop: card => mutations.toggleTop.mutate({ card, isTop: !card.isTop }),
    onPresent: card => {
      void requireFullCard(card).then(full => full && setPresenting(full));
    },
    onDelete: card => setPendingDelete(card),
    onExportMarkdown: card => {
      void requireFullCard(card).then(full => {
        if (!full) return;
        downloadMarkdown(getMarkdown(full.content), String(full.id));
        toast.success("已导出 Markdown");
      });
    },
    onExportImage: card => {
      void requireFullCard(card).then(full => full && setExportingImage(full));
    },
    onExportEpub: card => {
      void requireFullCard(card).then(full => full && setExportingEpub(full));
    },
    onExportPdf: card => {
      void requireFullCard(card).then(full => full && setExportingPdf(full));
    },
    onChangeCategory: (card, category) => mutations.changeCategory.mutate({ card, category }),
    ...(isElectron && databaseName
      ? { onOpenWindow: (card: ICard) => void openCardInNewWindow(databaseName, card.id) }
      : {}),
  };

  /* 导入与新建共用数据库作用域，切库后中止旧任务。 */
  const handleImport = async () => {
    const paths = await selectFile({
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
    });
    if (!paths?.length) return;
    try {
      for (const path of paths) {
        const markdown = await readTextFile(path);
        const content = importFromMarkdown(markdown, ["yaml"]);
        await mutations.create.mutateAsync({
          content,
          tags: [],
          links: [],
          category:
            filter.category === "all"
              ? ECardCategory.Temporary
              : (filter.category as ECardCategory),
          count: getContentLength(content),
          isTop: false,
        });
      }
      toast.success(`已导入 ${paths.length} 张卡片`);
    } catch {
      toast.error("导入失败");
    }
  };

  /* 标签树面板：wall / graph 共用。收起 = 外层容器宽度过渡归零裁剪面板，
     内层面板恒定 236px 宽避免收起过程中内容重排；容器 gap 不参与过渡（20px 跳变不可感知） */
  const treePanel = (
    <div
      className={cn(
        "ease-tau-out min-h-0 flex-none overflow-hidden transition-[width] duration-200",
        treeCollapsed ? "w-0" : "w-[236px]"
      )}
    >
      <CardTreePanel
        tree={tagTree}
        tag={filter.tag}
        onSelectTag={tag => setFilter(prev => ({ ...prev, tag: prev.tag === tag ? "" : tag }))}
      />
    </div>
  );

  if (feed.loading) return <Loading />;
  if (feed.error)
    return (
      <div role="alert" className="flex flex-col items-center gap-3 py-20">
        <p className="text-danger">卡片加载失败：{feed.error}</p>
        <Button onClick={feed.refresh}>重试</Button>
      </div>
    );

  const cardTitle = (card: ICard | null) =>
    card ? getEditorText(card.content, 20) || `卡片 #${card.id}` : "";

  return (
    <div className="mx-auto flex h-full min-w-0 max-w-[1760px] flex-col px-[26px]">
      {/* 工具栏：标题与读数 + 导入 / 新建（右上角） */}
      <div className="flex h-[44px] flex-none items-center gap-3.5">
        <h1 className="text-[19px] font-semibold tracking-[-0.01em]">卡片库</h1>
        <span className="text-ink-2 text-[12px] tabular-nums">
          共 <b className="text-ink-1 font-semibold">{feed.cards.length}</b> 张 ·{" "}
          <b className="text-ink-1 font-semibold">{totalWords.toLocaleString("zh-CN")}</b> 字
        </span>
        <span className="flex-1" />
        <IconButton title="导入 Markdown" onClick={() => void handleImport()}>
          <Download className="size-[15px]" strokeWidth={1.75} />
        </IconButton>
        <Button variant="primary" size="sm" icon={Plus} onClick={() => setCreating(true)}>
          新建卡片
        </Button>
      </div>

      {/* 筛选行：树收起切换 + 分类 chips（视图切换在标题栏面包屑） */}
      <div className="flex h-[36px] flex-none items-center gap-1.5 pb-1.5">
        {view !== "database" && (
          <IconButton
            title={treeCollapsed ? "展开标签树" : "收起标签树"}
            onClick={() => updatePreferences(databaseName, { treeCollapsed: !treeCollapsed })}
          >
            {treeCollapsed ? (
              <PanelLeftOpen className="size-[15px]" strokeWidth={1.75} />
            ) : (
              <PanelLeftClose className="size-[15px]" strokeWidth={1.75} />
            )}
          </IconButton>
        )}
        {CATEGORY_ORDER.map(key => {
          const active = filter.category === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(prev => ({ ...prev, category: key }))}
              className={cn(
                "shadow-card ease-tau-out flex h-7 items-center gap-1.5 rounded-full px-3 text-[12.5px] transition-[background,color] duration-150",
                active
                  ? "bg-selected text-ink-1 font-semibold"
                  : "bg-surface text-ink-2 hover:text-ink-1"
              )}
            >
              {key !== "all" && (
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: CATEGORY_COLORS[key].text }}
                />
              )}
              {key === "all" ? "全部" : cardCategoryName[key].slice(0, 2)}
              <span
                className={cn(
                  "text-[11px] tabular-nums",
                  active ? "text-accent-text" : "text-ink-3"
                )}
              >
                {key === "all" ? feed.cards.length : (categoryCount.get(key) ?? 0)}
              </span>
            </button>
          );
        })}
      </div>

      {/* 主体三视图 */}
      {view === "wall" && (
        <div className={cn("flex min-h-0 flex-1", !treeCollapsed && "gap-5")}>
          {treePanel}
          <div className="flex min-w-0 flex-1 flex-col">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-0 py-20 text-center">
                <Layers className="text-ink-3 size-6" strokeWidth={1.75} />
                <p className="text-ink-2 text-[15px] font-medium">没有匹配的卡片</p>
                <p className="text-ink-3 text-[12.5px]">
                  清除分类 / 标签筛选，或用 Ctrl+K 全局搜索
                </p>
              </div>
            ) : (
              <CardWallList cards={filtered} actions={actions} resetScrollKey={resetScrollKey} />
            )}
          </div>
        </div>
      )}
      {view === "graph" && (
        <div className={cn("flex min-h-0 flex-1", !treeCollapsed && "gap-5")}>
          {treePanel}
          <CardGraphSection
            cards={sorted}
            highlightIds={highlightIds}
            onOpenCard={openPreview}
            enableHoverPreview={
              previewCardId === null &&
              !creating &&
              pendingDelete === null &&
              !presenting &&
              !exportingImage &&
              !exportingEpub &&
              !exportingPdf
            }
          />
        </div>
      )}
      {view === "database" && (
        <div className="flex min-h-0 flex-1 flex-col">
          <CardDatabaseView
            cards={sorted}
            tag={filter.tag}
            selectCategory={filter.category}
            onCardClick={card => setPreviewCardId(card.id)}
            onOpenCreateCard={defaultCategory => {
              setCreateDefaultCategory(defaultCategory);
              setCreating(true);
            }}
            onDeleteCard={handleDatabaseDelete}
            onUpdateCard={(id, patch) => mutations.patch.mutateAsync({ id, patch })}
          />
        </div>
      )}

      {/* 浮层：预览（编辑） / 新建 / 删除确认 / 演示 / 导出×3 */}
      <CardPreviewDialog
        open={previewCardId !== null}
        card={previewCard}
        error={previewCardQuery.error?.message}
        onRetry={() => void previewCardQuery.refetch()}
        actions={actions}
        onOpenChange={open => {
          if (!open) setPreviewCardId(null);
        }}
      />
      <CreateCardDialog
        open={creating}
        defaultCategory={
          createDefaultCategory ??
          (filter.category === "all" ? ECardCategory.Temporary : (filter.category as ECardCategory))
        }
        onClose={() => {
          setCreating(false);
          setCreateDefaultCategory(null);
        }}
      />
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={open => {
          if (open) return;
          setPendingDelete(null);
          deleteBridge.current?.reject(new Error("取消删除卡片"));
          deleteBridge.current = null;
        }}
        title="删除卡片"
        description="卡片将从卡片库中移除。"
        impact="卡片的正文与双向链接将不再可访问"
        danger
        confirmText="删除"
        loading={mutations.remove.isPending}
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await mutations.remove.mutateAsync(pendingDelete.id);
            deleteBridge.current?.resolve();
            toast.success("已删除");
          } catch {
            deleteBridge.current?.reject(new Error("删除卡片失败"));
            toast.error("删除失败");
          } finally {
            setPendingDelete(null);
            deleteBridge.current = null;
          }
        }}
      />
      {presenting && (
        <PresentationMode
          content={presenting.content as Descendant[]}
          onExit={() => setPresenting(null)}
        />
      )}
      <ContentExportModal
        open={exportingImage !== null}
        onClose={() => setExportingImage(null)}
        content={exportingImage?.content ?? []}
      />
      <EpubExportModal
        open={exportingEpub !== null}
        onClose={() => setExportingEpub(null)}
        content={exportingEpub?.content ?? []}
        title={cardTitle(exportingEpub)}
      />
      <PdfExportModal
        visible={exportingPdf !== null}
        onClose={() => setExportingPdf(null)}
        content={exportingPdf?.content ?? []}
        title={cardTitle(exportingPdf)}
      />
    </div>
  );
}

function countTreeNodes(node: CardTagNode): number {
  return 1 + node.children.reduce((sum, child) => sum + countTreeNodes(child), 0);
}
