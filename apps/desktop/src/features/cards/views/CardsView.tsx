/**
 * 卡片库主视图 · 一整张纸（mockups/cards/plan-sheet.html 方案 B 定稿）：
 * 纸顶工具栏（标题 / 当前标签 + 摘要 + 导入 / 新建）→ 分类胶囊 → 纸内三视图（卡片墙 / 图谱 / 表格）。
 *
 * 筛选：标签在侧栏「卡片库」入口的子项里（CardsNav 层级树，页面参数 id），页内不放标签树；
 * 分类（4 个，常用且少）留在纸顶胶囊组，按库记忆。两者叠加，三视图同一套筛选——
 * 卡片墙只列命中、图谱高亮命中其余淡出、表格经 CardDatabaseView 外部查询收窄。
 *
 * 视图分工：卡片墙 = 等高网格 + 时间分组 + 行级虚拟滚动（本域实现）；
 * 图谱 = 既有 LinkGraph 复用；表格 = 既有 CardDatabaseView（Database 组件）复用。
 * 视图切换在标题栏面包屑（「卡片库 / [卡片墙 ▾]」，usePageBreadcrumb 注入）。
 * 不设页内搜索——卡片没有标题，语义检索由全局命令面板（Ctrl+K）承担。
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePage, usePageBreadcrumb, usePageParams } from "@/page/PageProvider";
import { Import, Layers, Plus, X } from "lucide-react";
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
import { Button, cn, ConfirmDialog, Loading, toast } from "@tau/ui";
import {
  cardDetailKey,
  filterCards,
  sortCards,
  useCardDetail,
  useCardsFeed,
  useCardsMutations,
} from "../queries";
import { CardWallList } from "../components/CardWallList";
import { CardPreviewDialog } from "../components/CardPreviewDialog";
import { CardViewSwitcher } from "../components/CardViewSwitcher";
import { CreateCardDialog } from "../components/CreateCardDialog";
import { CardGraphSection } from "../components/CardGraphSection";
import { CATEGORY_COLORS } from "../categoryColors";
import type { CardFilter, CardItemActions } from "../types";
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
  const params = usePageParams<{ id?: string }>();
  const tag = params.id ?? "";
  const feed = useCardsFeed();
  const mutations = useCardsMutations();
  const queryClient = useQueryClient();
  const databaseName = useSettingStore(state => state.setting.database.active);

  const preferences = useCardsPreferencesStore(
    state => state.byDatabase[databaseName] ?? DEFAULT_CARDS_PREFERENCES
  );
  const updatePreferences = useCardsPreferencesStore(state => state.update);
  const { view, category } = preferences;
  const filter = useMemo<CardFilter>(() => ({ category, tag }), [category, tag]);
  const setView = useCallback(
    (next: CardsViewMode) => updatePreferences(databaseName, { view: next }),
    [updatePreferences, databaseName]
  );
  const setCategory = (next: CardFilter["category"]) =>
    updatePreferences(databaseName, { category: next });
  const clearTag = () => navigator.push("cards", { id: "" });
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

  /* sorted = 排序全集（图谱全集 / 表格 allCards），filtered = 分类 / 标签过滤结果 */
  const sorted = useMemo(() => sortCards(feed.cards), [feed.cards]);
  const filtered = useMemo(() => filterCards(feed.cards, filter), [feed.cards, filter]);
  const highlightIds = useMemo(() => filtered.map(card => card.id), [filtered]);
  const categoryCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const card of feed.cards) counts.set(card.category, (counts.get(card.category) ?? 0) + 1);
    return counts;
  }, [feed.cards]);
  const filtering = category !== "all" || Boolean(tag);
  /* 摘要跟随筛选：筛选中读命中集，否则读全集 */
  const summaryCards = filtering ? filtered : feed.cards;
  const totalWords = useMemo(
    () => summaryCards.reduce((sum, card) => sum + card.count, 0),
    [summaryCards]
  );
  /* 新建 / 导入的默认分类：跟随当前分类筛选（三视图同一套筛选，表格也不例外） */
  const defaultCategory =
    category === "all" ? ECardCategory.Temporary : (category as ECardCategory);
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
          category: defaultCategory,
          count: getContentLength(content),
          isTop: false,
        });
      }
      toast.success(`已导入 ${paths.length} 张卡片`);
    } catch {
      toast.error("导入失败");
    }
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
    card ? getEditorText(card.content, 20) || `卡片 #${card.id}` : "";

  return (
    <div className="mx-auto flex h-full min-h-0 w-full min-w-0 max-w-[1760px] flex-col px-4 pb-4 pt-1">
      {/* 一整张纸：工具栏与分类胶囊固定在纸顶，视图在纸内滚动 */}
      <div className="bg-surface shadow-card rounded-tau-lg flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* 工具栏：标题 / 当前标签 + 摘要 + 导入 / 新建 */}
        <div className="mb-2 mt-5 flex h-10 flex-none items-center gap-3 px-8">
          <h1 className="text-tau-title-lg shrink-0 whitespace-nowrap font-semibold tracking-[-0.01em]">
            卡片库
          </h1>
          {tag && (
            <button
              type="button"
              title="清除标签筛选"
              onClick={clearTag}
              className="bg-selected text-accent-text inline-flex h-6 max-w-[200px] shrink-0 items-center gap-1 rounded-full pl-2.5 pr-1.5 text-[12px] font-medium"
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
          <Button
            variant="secondary"
            size="sm"
            icon={Import}
            title="从本地 Markdown 文件导入"
            className="shrink-0 whitespace-nowrap"
            onClick={() => void handleImport()}
          >
            导入
          </Button>
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

        {/* 分类胶囊：三视图共用（表格也跟随）；单选，选中取分类软底 + 同色字，未选描边 */}
        <div
          role="radiogroup"
          aria-label="卡片分类"
          className="mb-3 flex flex-none flex-wrap items-center gap-2 px-8"
        >
          {CATEGORY_ORDER.map(key => {
            const active = category === key;
            const color = key === "all" ? null : CATEGORY_COLORS[key];
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setCategory(key)}
                className={cn(
                  "text-tau-meta inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 outline-none transition-colors",
                  "focus-visible:shadow-[var(--tau-focus-ring)]",
                  active
                    ? cn("border-transparent font-medium", !color && "bg-selected text-accent-text")
                    : "border-line-1 text-ink-2 hover:bg-hover hover:text-ink-1"
                )}
                style={active && color ? { background: color.soft, color: color.text } : undefined}
              >
                {color && (
                  <span
                    className="size-[7px] shrink-0 rounded-full"
                    style={{ background: color.text }}
                  />
                )}
                {key === "all" ? "全部" : cardCategoryName[key].slice(0, 2)}
                <span
                  className={cn(
                    "text-[11px] font-normal tabular-nums",
                    active ? "opacity-70" : "text-ink-3"
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
          <div className="flex min-h-0 flex-1 flex-col pb-4 pl-8 pr-8">
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
        )}
        {view === "graph" && (
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
        )}
        {view === "database" && (
          <div className="flex min-h-0 flex-1 flex-col">
            <CardDatabaseView
              bare
              cards={sorted}
              selectCategory={category}
              tag={tag}
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
      </div>

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
        defaultCategory={createDefaultCategory ?? defaultCategory}
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
