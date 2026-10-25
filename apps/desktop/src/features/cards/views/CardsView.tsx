/**
 * 卡片库主视图 · 一整张纸（mockups/cards/plan-sheet.html 方案 B 定稿）：
 * 纸顶工具栏（标题 / 当前标签 + 摘要 + 导入 / 新建）→ 纸内三视图（卡片墙 / 列表 / 表格）。
 *
 * 筛选：标签在侧栏「卡片库」入口的子项里（CardsNav 层级树，页面参数 id），页内不放标签树；
 * 三视图同一套筛选——卡片墙与列表只列命中、表格经 CardDatabaseView 外部查询收窄。
 *
 * 视图分工：卡片墙 = 等高网格 + 时间分组 + 行级虚拟滚动（本域实现）；
 * 列表 = 平铺行 + 列头排序（D-105，mockups/cards/list-view.html）；
 * 表格 = 既有 CardDatabaseView（Database 组件）复用。图谱已移到全局知识地图（KL-022）。
 * 视图切换在标题栏面包屑（「卡片库 / [卡片墙 ▾]」，usePageBreadcrumb 注入）。
 * 不设页内搜索——卡片标题由元信息承担（D-100），语义检索由全局命令面板（Ctrl+K）承担。
 * 卡面 / 列表行 ⇄ 预览弹窗 ⇄ 详情页的纸走共享元素形变（D-106）；表格视图不形变。
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePage, usePageBreadcrumb, usePageParams } from "@/page/PageProvider";
import { morph, queryActivePageMorph } from "@/page/morph";
import { FileText, FolderInput, Import, Layers, Plus, X } from "lucide-react";
import type { Descendant } from "slate";
import "../cards.css";
import { type ICard } from "@/types";
import { isElectron } from "@/electron";
import useSettingStore from "@/stores/useSettingStore";
import PresentationMode from "@/components/PresentationMode";
import CardDatabaseView from "../components/CardDatabaseView";
import ContentExportModal from "@/components/ContentExportModal";
import EpubExportModal from "@/components/EpubExportModal";
import { PdfExportModal } from "@/components/PdfExportModal";
import { getScopedCard, openCardInNewWindow } from "@/commands/card";
import { getContentLength } from "@/utils";
import { Button, ConfirmDialog, Loading, Menu, toast } from "@tau/ui";
import {
  cardDetailKey,
  filterCards,
  sortCards,
  useCardDetail,
  useCardsFeed,
  useCardsMutations,
} from "../queries";
import { CardWallList } from "../components/CardWallList";
import { CardListView } from "../components/CardListView";
import { CardPreviewDialog } from "../components/CardPreviewDialog";
import { CardViewSwitcher } from "../components/CardViewSwitcher";
import { CreateCardDialog } from "../components/CreateCardDialog";
import type { CardFilter, CardItemActions } from "../types";
import type { CardListSort } from "../listModel";
import { cardMorphKey } from "../morph";
import {
  DEFAULT_CARDS_PREFERENCES,
  useCardsPreferencesStore,
  type CardsViewMode,
} from "../preferences";
import { cardTitle as titleOfCard } from "@/utils/card-title";
import { exportContentAsMarkdown, importMarkdownFiles } from "@/services/content-transfer";
import { useTransferStore } from "@/app/transferStore";
import { useImportDrop } from "@/features/transfer/useImportDrop";

/** 悬停预取的新鲜期：鼠标在墙上来回划过时不重复读取 */
const PREFETCH_STALE_MS = 30_000;

export function CardsView() {
  const { navigator } = usePage();
  const params = usePageParams<{ id?: string }>();
  const tag = params.id ?? "";
  const feed = useCardsFeed();
  const mutations = useCardsMutations();
  const queryClient = useQueryClient();
  const databaseName = useSettingStore(state => state.setting.database.active);

  const storedPreferences = useCardsPreferencesStore(state => state.byDatabase[databaseName]);
  const updatePreferences = useCardsPreferencesStore(state => state.update);
  const { view, listSort } = { ...DEFAULT_CARDS_PREFERENCES, ...storedPreferences };
  const filter = useMemo<CardFilter>(() => ({ tag }), [tag]);
  const setView = useCallback(
    (next: CardsViewMode) => updatePreferences(databaseName, { view: next }),
    [updatePreferences, databaseName]
  );
  const setListSort = (next: CardListSort) => updatePreferences(databaseName, { listSort: next });
  const clearTag = () => navigator.push("cards", { id: "" });
  const resetScrollKey = tag;
  const [previewCardId, setPreviewCardId] = useState<number | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ICard | null>(null);
  const [presenting, setPresenting] = useState<ICard | null>(null);
  const [exportingImage, setExportingImage] = useState<ICard | null>(null);
  const [exportingEpub, setExportingEpub] = useState<ICard | null>(null);
  const [exportingPdf, setExportingPdf] = useState<ICard | null>(null);
  /** 数据库视图删除确认桥：其 onDeleteCard 约定 Promise resolve 即删行、reject 即取消 */
  const deleteBridge = useRef<{ resolve(): void; reject(error: Error): void } | null>(null);

  /* sorted = 排序全集（表格 allCards），filtered = 标签过滤结果 */
  const sorted = useMemo(() => sortCards(feed.cards), [feed.cards]);
  const filtered = useMemo(() => filterCards(feed.cards, filter), [feed.cards, filter]);
  const filtering = Boolean(tag);
  /* 摘要跟随筛选：筛选中读命中集，否则读全集 */
  const summaryCards = filtering ? filtered : feed.cards;
  const totalWords = useMemo(
    () => summaryCards.reduce((sum, card) => sum + card.count, 0),
    [summaryCards]
  );
  /* 弹窗基准卡 = 单卡全量按需拉取（列表缓存只有预览块，弹窗可编辑需全文） */
  const previewCardQuery = useCardDetail(previewCardId);
  const previewCard = previewCardId == null ? null : (previewCardQuery.data ?? null);

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

  /* 形变定位：卡面在本页（激活页）内按 key 找；预览卡体内容就绪才算可形变 */
  const cardElement = (id: number) => queryActivePageMorph(cardMorphKey(id));
  const openPreviewElement = () =>
    previewRef.current?.dataset.state === "open" ? previewRef.current : null;

  const openPreview = (card: ICard) =>
    morph({
      from: cardElement(card.id),
      update: () => setPreviewCardId(card.id),
      to: openPreviewElement,
    });

  /* 原卡还在（未被删、在视口内）才缩回，否则弹窗照常淡出 */
  const closePreview = () => {
    const id = previewCardId;
    morph({
      from: id !== null && cardElement(id) ? openPreviewElement() : null,
      update: () => setPreviewCardId(null),
      to: () => (id === null ? null : cardElement(id)),
    });
  };

  /* 从预览进入时由弹窗卡体形变，卡面「进入详情」直接由卡形变；收起预览与 push 同批 */
  const openDetail = (card: ICard) =>
    morph({
      from: openPreviewElement() ?? cardElement(card.id),
      update: () => {
        setPreviewCardId(null);
        navigator.push("card-detail", { id: card.id });
      },
      to: () => queryActivePageMorph(cardMorphKey(card.id)),
    });

  const actions: CardItemActions = {
    onOpen: openPreview,
    onPrefetch: card => {
      if (!databaseName) return;
      void queryClient.prefetchQuery({
        queryKey: cardDetailKey(databaseName, card.id),
        queryFn: () => getScopedCard(databaseName, card.id),
        staleTime: PREFETCH_STALE_MS,
      });
    },
    onOpenDetail: openDetail,
    onToggleTop: card => mutations.toggleTop.mutate({ card, isTop: !card.isTop }),
    onPresent: card => {
      void requireFullCard(card).then(full => full && setPresenting(full));
    },
    onDelete: card => setPendingDelete(card),
    onExportMarkdown: card => {
      void requireFullCard(card).then(full => {
        if (!full) return;
        void exportContentAsMarkdown({
          title: String(full.id),
          content: full.content,
          contentId: full.contentId,
        });
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
    ...(isElectron && databaseName
      ? { onOpenWindow: (card: ICard) => void openCardInNewWindow(databaseName, card.id) }
      : {}),
  };

  /* 导入与新建共用数据库作用域，切库后中止旧任务。 */
  const importDrop = useImportDrop("card");
  const handleImport = async () => {
    await importMarkdownFiles(
      ({ content, contracts }) =>
        mutations.create.mutateAsync({
          content,
          contracts,
          tags: [],
          count: getContentLength(content),
          isTop: false,
        }),
      { unit: "张卡片" }
    );
  };

  if (feed.loading) return <Loading />;
  if (feed.error)
    return (
      <div role="alert" className="flex flex-col items-center gap-3 py-20">
        <p className="text-danger">卡片加载失败：{feed.error}</p>
        <Button onClick={feed.refresh}>重试</Button>
      </div>
    );

  const cardTitle = (card: ICard | null) =>
    card ? titleOfCard(card, 20) || `卡片 #${card.id}` : "";

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1760px] min-w-0 flex-col px-4 pt-1 pb-4">
      {/* 一整张纸：工具栏固定在纸顶，视图在纸内滚动 */}
      <div
        className="bg-surface shadow-card rounded-tau-lg relative flex min-h-0 flex-1 flex-col overflow-hidden"
        {...importDrop.dropProps}
      >
        {importDrop.overlay}
        {/* 工具栏：标题 / 当前标签 + 摘要 + 导入 / 新建 */}
        <div className="mt-5 mb-2 flex h-10 flex-none items-center gap-3 px-8">
          <h1 className="text-tau-title-lg shrink-0 font-semibold tracking-[-0.01em] whitespace-nowrap">
            卡片库
          </h1>
          {tag && (
            <button
              type="button"
              title="清除标签筛选"
              onClick={clearTag}
              className="bg-selected text-accent-text inline-flex h-6 max-w-[200px] shrink-0 items-center gap-1 rounded-full pr-1.5 pl-2.5 text-[12px] font-medium"
            >
              <span className="truncate">{tag}</span>
              <X className="size-3 shrink-0" strokeWidth={2} />
            </button>
          )}
          <span className="text-tau-meta text-ink-2 w-0 flex-1 truncate whitespace-nowrap tabular-nums">
            {filtering ? "找到" : "共"}{" "}
            <b className="text-ink-1 font-semibold">{summaryCards.length}</b> 张 · 累计{" "}
            <b className="text-ink-1 font-semibold">{totalWords.toLocaleString("zh-CN")}</b> 字
          </span>
          {/* 导入：带文字的次要按钮（同文章页），不用「下载」语义的裸图标 */}
          <Menu
            align="end"
            trigger={
              <Button
                variant="secondary"
                size="sm"
                icon={Import}
                title="从本地 Markdown 导入"
                className="shrink-0 whitespace-nowrap"
              >
                导入
              </Button>
            }
          >
            <Menu.Item
              icon={<FileText className="size-[15px] shrink-0" strokeWidth={1.75} />}
              onSelect={() => void handleImport()}
            >
              Markdown 文件…
            </Menu.Item>
            <Menu.Item
              icon={<FolderInput className="size-[15px] shrink-0" strokeWidth={1.75} />}
              onSelect={() => useTransferStore.getState().openImportWizard({ target: "card" })}
            >
              文件夹或压缩包…
            </Menu.Item>
          </Menu>
          <Button
            variant="primary"
            size="sm"
            icon={Plus}
            className="shrink-0 whitespace-nowrap"
            onClick={() => setCreating(true)}
          >
            新建卡片
          </Button>
        </div>

        {/* 主体三视图：卡片墙与列表共用空态 */}
        {(view === "wall" || view === "list") && (
          <div className="flex min-h-0 flex-1 flex-col pr-8 pb-4 pl-8">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-0 py-20 text-center">
                <Layers className="text-ink-3 size-6" strokeWidth={1.75} />
                <p className="text-ink-2 text-[15px] font-medium">没有匹配的卡片</p>
                <p className="text-ink-3 text-[12.5px]">清除标签筛选，或用 Ctrl+K 全局搜索</p>
              </div>
            ) : view === "list" ? (
              <CardListView
                cards={filtered}
                sort={listSort}
                onSortChange={setListSort}
                actions={actions}
                resetScrollKey={resetScrollKey}
              />
            ) : (
              <CardWallList cards={filtered} actions={actions} resetScrollKey={resetScrollKey} />
            )}
          </div>
        )}
        {view === "database" && (
          <div className="flex min-h-0 flex-1 flex-col">
            <CardDatabaseView
              databaseName={databaseName}
              bare
              cards={sorted}
              tag={tag}
              onCardClick={card => setPreviewCardId(card.id)}
              onOpenCreateCard={() => setCreating(true)}
              onDeleteCard={handleDatabaseDelete}
              onUpdateCard={(id, patch) => mutations.patch.mutateAsync({ id, patch })}
            />
          </div>
        )}
      </div>

      {/* 浮层：预览（编辑） / 新建 / 删除确认 / 演示 / 导出×3 */}
      <CardPreviewDialog
        ref={previewRef}
        open={previewCardId !== null}
        card={previewCard}
        error={previewCardQuery.error?.message}
        onRetry={() => void previewCardQuery.refetch()}
        actions={actions}
        onOpenChange={open => {
          if (!open) closePreview();
        }}
      />
      <CreateCardDialog open={creating} onClose={() => setCreating(false)} />
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
            /* 删除的是正在预览的卡片时直接收起预览（不走关闭落盘，卡片已不存在） */
            if (previewCardId === pendingDelete.id) setPreviewCardId(null);
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
