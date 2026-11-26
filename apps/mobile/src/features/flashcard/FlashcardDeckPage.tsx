// 卡组详情页：概要条 + 搜索 + 状态筛选 + 卡片列表。
// 批量操作（长按 + 菜单叠加）：
// 长按任一卡 0.6s 或 ⋯ 菜单「批量管理」进入多选；底部纸面浮条见 CardBatchBar。

import {
  flashcardTranslator,
  flashcardCount,
  flashcardDisplayContext,
  useFlashcardI18n,
  type FlashcardMessageKey,
} from "./i18n";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { MoreHorizontal, Plus } from "lucide-react";
import DeckIcon from "@tau/shared/deck-icon";
import { PageHeader } from "../../components/PageHeader";
import { SearchField } from "../../components/SearchField";
import { ActionSheet } from "../../components/ActionSheet";
import type { ActionSheetItem } from "../../components/ActionSheet";
import { MobileConfirmDialog } from "../../components/MobileConfirmDialog";
import { useEdgeFade, useEdgeFadeX } from "../../hooks/useScrollState";
import { useBackHandler } from "../../router";
import { toast } from "../../components/toast";
import { richTextPlainText, clampText } from "../../utils/richTextText";
import * as tauri from "../../services/tauri";
import { invalidateFlashcardQueries, useFlashcardCards, useFlashcardDecks } from "./queries";
import { FLASHCARD_STATUS_MESSAGE, FLASHCARD_TYPE_META, formatDueTime } from "./constants";
import { CardBatchBar } from "./CardBatchBar";
import { DeckFormSheet } from "./DeckFormSheet";
import type { Flashcard, FlashcardStatus } from "./types";

type StatusFilter = "all" | FlashcardStatus;

const STATUS_FILTERS: Array<{ key: StatusFilter; message: FlashcardMessageKey }> = [
  { key: "all", message: "ui.all" },
  { key: "new", message: FLASHCARD_STATUS_MESSAGE.new },
  { key: "learning", message: FLASHCARD_STATUS_MESSAGE.learning },
  { key: "review", message: FLASHCARD_STATUS_MESSAGE.review },
];

const LONG_PRESS_MS = 600;
const LONG_PRESS_CANCEL_PX = 10;

type FlashcardDeckPageProps = {
  deckId: number;
  onBack: () => void;
  onOpenReview: (deckId: number) => void;
  onEditCard: (cardId: number) => void;
  onCreateCard: (deckId: number) => void;
  onError: (error: unknown, fallback: string) => void;
};

export function FlashcardDeckPage({
  deckId,
  onBack,
  onOpenReview,
  onEditCard,
  onCreateCard,
  onError,
}: FlashcardDeckPageProps) {
  useFlashcardI18n();
  const scrollRef = useRef<HTMLDivElement>(null);
  useEdgeFade(scrollRef);
  const statusFilterRef = useRef<HTMLDivElement>(null);
  useEdgeFadeX(statusFilterRef);
  const decksQuery = useFlashcardDecks();
  const deck = decksQuery.data?.find(item => item.id === deckId);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [searchText, setSearchText] = useState("");
  // 只拉一次全量：筛选与搜索在前端完成（搜索框本就需要即时反馈，服务端过滤反而多一次全量往返）
  const cardsQuery = useFlashcardCards({ deckId });
  const allCards = cardsQuery.data ?? [];
  const counts = useMemo(() => {
    const byStatus = { all: 0, new: 0, learning: 0, review: 0 } as Record<StatusFilter, number>;
    for (const card of allCards) {
      byStatus.all += 1;
      if (card.status in byStatus) byStatus[card.status as StatusFilter] += 1;
    }
    return byStatus;
  }, [allCards]);
  const cards = useMemo(() => {
    let list = allCards;
    if (filter !== "all") list = list.filter(card => card.status === filter);
    const keyword = searchText.trim().toLowerCase();
    if (keyword) {
      list = list.filter(card =>
        `${richTextPlainText(card.prompt)}\n${richTextPlainText(card.detail)}`
          .toLowerCase()
          .includes(keyword)
      );
    }
    return list;
  }, [allCards, filter, searchText]);

  // ── 批量多选（长按进入；菜单进入见 deckMenuItems）──
  const [batchMode, setBatchMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const pressTimer = useRef<number | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const longPressFired = useRef(false);
  // 卸载时清理长按计时器：残留触发会在页面销毁后 setState
  useEffect(
    () => () => {
      if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
    },
    []
  );

  const exitBatch = () => {
    setBatchMode(false);
    setSelected(new Set());
  };
  // 批量模式是页面内状态：返回手势先退出批量模式（消费返回），
  // 常规态放行正常弹栈——handler 内不调 goBack（并发守卫会拒绝嵌套调用）
  useBackHandler(() => {
    if (!batchMode) return false;
    exitBatch();
    return true;
  });
  const toggleSelected = (cardId: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  };
  const beginLongPress = (cardId: number, event: React.PointerEvent) => {
    if (batchMode) return;
    pressStart.current = { x: event.clientX, y: event.clientY };
    pressTimer.current = window.setTimeout(() => {
      pressTimer.current = null;
      longPressFired.current = true;
      setBatchMode(true);
      setSelected(new Set([cardId]));
    }, LONG_PRESS_MS);
  };
  const trackLongPress = (event: React.PointerEvent) => {
    if (!pressStart.current || pressTimer.current === null) return;
    const dx = event.clientX - pressStart.current.x;
    const dy = event.clientY - pressStart.current.y;
    if (Math.hypot(dx, dy) > LONG_PRESS_CANCEL_PX) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };
  const cancelLongPress = () => {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    if (longPressFired.current) {
      // 长按已触发：吞掉紧随其后的本次 click 后复位；
      // 否则手指移出卡片再抬起（无 click）时标志残留，会吞掉下一次点击
      window.setTimeout(() => {
        longPressFired.current = false;
      }, 0);
    }
  };

  // ── 单卡操作 / 卡组管理 ──
  const [moreCard, setMoreCard] = useState<Flashcard | null>(null);
  const [deletingCard, setDeletingCard] = useState<Flashcard | null>(null);
  const [deckMenuOpen, setDeckMenuOpen] = useState(false);
  const [editDeckOpen, setEditDeckOpen] = useState(false);
  const [deletingDeck, setDeletingDeck] = useState(false);

  const moreItems: ActionSheetItem[] = moreCard
    ? [
        {
          label: flashcardTranslator.t("ui.editCard"),
          icon: "✎",
          onClick: () => {
            onEditCard(moreCard.id);
            setMoreCard(null);
          },
        },
        {
          label: flashcardTranslator.t("ui.deleteCard"),
          icon: "🗑",
          danger: true,
          onClick: () => {
            setDeletingCard(moreCard);
            setMoreCard(null);
          },
        },
      ]
    : [];

  const dueCount = deck?.stats?.dueCards ?? 0;
  const deckMenuItems: ActionSheetItem[] = [
    {
      label: flashcardTranslator.t("ui.manageCardsInBulk"),
      icon: "☑",
      desc: flashcardTranslator.t("ui.selectCardsToMoveChangeDifficultyOrDelete"),
      onClick: () => {
        setDeckMenuOpen(false);
        setBatchMode(true);
      },
    },
    ...(dueCount > 0
      ? [
          {
            label: flashcardTranslator.t("ui.startReview"),
            icon: "▶",
            desc: flashcardCount("count.dueCards", dueCount),
            onClick: () => {
              setDeckMenuOpen(false);
              onOpenReview(deckId);
            },
          },
        ]
      : []),
    {
      label: flashcardTranslator.t("ui.editDeck"),
      icon: "✎",
      onClick: () => {
        setDeckMenuOpen(false);
        // deck 可能仍在加载或已被同步删除：此时进表单会被当成新建态，误存出重复卡组
        if (!deck) {
          toast({
            type: "info",
            text: flashcardTranslator.t("ui.deckInformationIsNotReadyTryAgainShortly"),
          });
          return;
        }
        setEditDeckOpen(true);
      },
    },
    {
      label: flashcardTranslator.t("ui.deleteDeck"),
      icon: "🗑",
      danger: true,
      onClick: () => {
        setDeckMenuOpen(false);
        setDeletingDeck(true);
      },
    },
  ];

  const confirmDeleteCard = async () => {
    if (!deletingCard) return;
    try {
      await tauri.flashcardDeleteCard(deletingCard.id);
      invalidateFlashcardQueries();
      toast({ type: "success", text: flashcardTranslator.t("ui.cardDeleted") });
    } catch (error) {
      onError(error, flashcardTranslator.t("ui.couldNotDeleteCard"));
    } finally {
      setDeletingCard(null);
    }
  };

  const confirmDeleteDeck = async () => {
    try {
      await tauri.flashcardDeleteDeck(deckId);
      invalidateFlashcardQueries();
      toast({ type: "success", text: flashcardTranslator.t("ui.deckDeleted") });
      onBack();
    } catch (error) {
      onError(error, flashcardTranslator.t("ui.couldNotDeleteDeck"));
    } finally {
      setDeletingDeck(false);
    }
  };

  const allSelected = batchMode && cards.length > 0 && selected.size === cards.length;

  return (
    <div className="mobile-kb-screen bg-page relative flex h-full flex-col">
      {/* 顶栏：常规 / 多选两态（mobile-topbar 补安全区，状态栏不再压住按钮） */}
      {batchMode ? (
        <div className="mobile-topbar flex min-h-14 flex-none items-center justify-between pr-2 pl-3">
          <button
            type="button"
            onClick={exitBatch}
            className="text-accent rounded-full px-2.5 py-2 text-[13.5px] font-extrabold"
          >
            {flashcardTranslator.t("ui.exitSelection")}
          </button>
          <div className="text-ink-1 text-[15px] font-extrabold">
            {flashcardCount("deck.selected", selected.size)}
          </div>
          <button
            type="button"
            onClick={() =>
              setSelected(allSelected ? new Set() : new Set(cards.map(card => card.id)))
            }
            className="text-accent rounded-full px-2.5 py-2 text-[13.5px] font-extrabold"
          >
            {allSelected
              ? flashcardTranslator.t("ui.deselectAll")
              : flashcardTranslator.t("ui.selectAll")}
          </button>
        </div>
      ) : (
        <PageHeader
          title={deck?.name ?? flashcardTranslator.t("ui.deck")}
          onBack={onBack}
          actions={
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={flashcardTranslator.t("ui.newFlashcard")}
                onClick={() => onCreateCard(deckId)}
                className="bg-surface text-ink-1 shadow-card grid h-9 w-9 place-items-center rounded-full active:scale-90"
              >
                <Plus size={18} />
              </button>
              <button
                type="button"
                aria-label={flashcardTranslator.t("ui.deckActions")}
                onClick={() => setDeckMenuOpen(true)}
                className="bg-surface text-ink-1 shadow-card grid h-9 w-9 place-items-center rounded-full active:scale-90"
              >
                <MoreHorizontal size={18} />
              </button>
            </div>
          }
        />
      )}

      {!batchMode ? (
        <>
          {/* 概要 + 开始复习 */}
          <div className="flex-none px-5">
            <div className="bg-surface shadow-card flex items-center gap-3.5 rounded-[20px] p-3.5">
              <div className="bg-page text-ink-2 grid h-[46px] w-[46px] flex-none place-items-center rounded-[14px] text-[22px]">
                <DeckIcon emoji={deck?.emoji} className="size-[22px]" />
              </div>
              <div className="text-ink-2 min-w-0 flex-1 text-[12.5px] font-semibold">
                {flashcardTranslator.t("deck.totalDue", {
                  total: deck?.stats?.totalCards ?? 0,
                  due: dueCount,
                })}
              </div>
              {dueCount > 0 ? (
                <button
                  type="button"
                  onClick={() => onOpenReview(deckId)}
                  className="shadow-lift text-ink-inverse flex-none rounded-[16px] px-4 py-2.5 text-[13px] font-extrabold active:scale-95"
                  style={{ background: "var(--tau-accent)" }}
                >
                  {flashcardTranslator.t("ui.startReview")}
                </button>
              ) : null}
            </div>
          </div>
          {/* 卡片搜索 */}
          <div className="flex-none px-5 pt-3">
            <SearchField
              value={searchText}
              onValueChange={setSearchText}
              placeholder={flashcardTranslator.t("ui.searchCardsInThisDeck")}
            />
          </div>
          {/* 状态筛选：左右间距挂外层（同上方搜索框），滚动层只负责滚动与渐隐 */}
          <div className="flex-none px-5 pt-3 pb-1">
            <div
              ref={statusFilterRef}
              className="edge-fade-x-scroll flex gap-2 overflow-x-auto"
              style={{ scrollbarWidth: "none" }}
            >
              {STATUS_FILTERS.map(item => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setFilter(item.key)}
                  className={`flex-none rounded-full px-3.5 py-2 text-[13px] font-bold ${
                    filter === item.key
                      ? "bg-ink-1 text-[var(--tau-ink-inverse)]"
                      : "bg-surface text-ink-2 shadow-card"
                  }`}
                >
                  {flashcardTranslator.t(item.message)} {counts[item.key]}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : null}

      {/* 卡片列表 */}
      <div
        ref={scrollRef}
        className="edge-fade-scroll mobile-page-scroll flex-1 overflow-y-auto"
        style={
          batchMode
            ? ({
                "--page-bottom-inset": "calc(96px + var(--mobile-screen-safe-bottom))",
              } as CSSProperties)
            : undefined
        }
      >
        <div className="flex flex-col gap-2.5 px-5 pt-2">
          {cardsQuery.isLoading ? (
            <div className="text-ink-3 py-6 text-center text-[13px] font-semibold">
              {flashcardTranslator.t("ui.loading")}
            </div>
          ) : cardsQuery.isError ? (
            <div className="border-line-1 text-ink-3 grid min-h-[120px] place-items-center rounded-[20px] border-2 border-dashed text-[13px] font-semibold">
              {flashcardTranslator.t("ui.couldNotLoad")}
              <button
                type="button"
                onClick={() => void cardsQuery.refetch()}
                className="text-accent ml-2 font-extrabold"
              >
                {flashcardTranslator.t("ui.retry")}
              </button>
            </div>
          ) : cards.length === 0 && searchText.trim() ? (
            <div className="border-line-1 text-ink-3 grid min-h-[120px] place-items-center rounded-[20px] border-2 border-dashed text-[13px] font-semibold">
              {flashcardTranslator.t("deck.noSearch", { query: searchText.trim() })}
            </div>
          ) : cards.length === 0 ? (
            <button
              type="button"
              onClick={() => onCreateCard(deckId)}
              className="border-line-1 text-ink-3 active:bg-hover grid min-h-[140px] place-items-center rounded-[20px] border-2 border-dashed text-[13.5px] font-extrabold"
            >
              {flashcardTranslator.t("ui.noCardsYet")}
              <br />
              {flashcardTranslator.t("ui.createAFlashcard")}
            </button>
          ) : (
            cards.map(card => {
              const isSelected = batchMode && selected.has(card.id);
              return (
                <div
                  key={card.id}
                  onContextMenu={event => event.preventDefault()}
                  onPointerDown={event => beginLongPress(card.id, event)}
                  onPointerMove={trackLongPress}
                  onPointerUp={cancelLongPress}
                  onPointerCancel={cancelLongPress}
                  onClick={() => {
                    if (longPressFired.current) {
                      // 长按选中后的松手 click，不再进入编辑
                      longPressFired.current = false;
                      return;
                    }
                    if (batchMode) toggleSelected(card.id);
                    else onEditCard(card.id);
                  }}
                  className={`active:bg-hover flex gap-3 rounded-[20px] p-4 ${
                    isSelected
                      ? "bg-accent-soft shadow-card"
                      : batchMode
                        ? "bg-surface shadow-card"
                        : "bg-surface shadow-card flex-col gap-2"
                  }`}
                  style={
                    isSelected ? { boxShadow: "inset 0 0 0 2px var(--tau-accent)" } : undefined
                  }
                >
                  {batchMode ? (
                    <span
                      className={`mt-1 grid h-6 w-6 flex-none place-items-center self-start rounded-full border-2 text-[12px] font-extrabold transition-colors ${
                        isSelected
                          ? "border-accent bg-accent text-ink-inverse"
                          : "border-[var(--tau-ink-3)] text-transparent"
                      }`}
                    >
                      ✓
                    </span>
                  ) : null}
                  <div className={batchMode ? "min-w-0 flex-1" : "contents"}>
                    <div className="flex items-center justify-between">
                      <span className="bg-tag-3-soft text-tag-3 rounded-full px-2.5 py-1 text-[10.5px] font-extrabold">
                        {flashcardTranslator.t(FLASHCARD_TYPE_META[card.type].labelKey)}
                      </span>
                      <span
                        className="flex items-center gap-1.5 text-[11.5px] font-bold"
                        style={{
                          color:
                            card.dueTime <= Date.now() ? "var(--tau-accent)" : "var(--tau-ink-2)",
                        }}
                      >
                        <span
                          className="h-[7px] w-[7px] rounded-full"
                          style={{
                            background:
                              card.dueTime <= Date.now() ? "var(--tau-accent)" : "var(--tau-ink-3)",
                          }}
                        />
                        {card.status === "new"
                          ? flashcardTranslator.t("ui.new")
                          : formatDueTime(card.dueTime, flashcardDisplayContext())}
                      </span>
                    </div>
                    <div className="text-ink-1 line-clamp-2 text-[14px] leading-[1.55] font-semibold">
                      {clampText(richTextPlainText(card.prompt), 80) ||
                        flashcardTranslator.t("ui.blankCard")}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-ink-3 text-[11px] font-semibold">
                        {card.tags.length > 0
                          ? card.tags
                              .slice(0, 3)
                              .map(tag => `#${tag}`)
                              .join(" ")
                          : "—"}
                      </span>
                      {batchMode ? null : (
                        <button
                          type="button"
                          aria-label={flashcardTranslator.t("ui.cardActions")}
                          onClick={event => {
                            event.stopPropagation();
                            setMoreCard(card);
                          }}
                          className="text-ink-3 active:bg-press -mr-1 grid h-7 w-7 place-items-center rounded-full"
                        >
                          <MoreHorizontal size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 批量操作条（含移动/难度/删除弹层） */}
      <CardBatchBar
        open={batchMode}
        deckId={deckId}
        selectedIds={selected}
        onFinished={exitBatch}
      />

      <ActionSheet
        open={moreCard !== null}
        title={clampText(richTextPlainText(moreCard?.prompt ?? []), 16)}
        items={moreItems}
        onClose={() => setMoreCard(null)}
      />
      <ActionSheet
        open={deckMenuOpen}
        title={deck?.name}
        items={deckMenuItems}
        onClose={() => setDeckMenuOpen(false)}
      />
      <DeckFormSheet
        open={editDeckOpen}
        deck={deck ?? null}
        onClose={() => setEditDeckOpen(false)}
        onError={onError}
      />
      <MobileConfirmDialog
        open={deletingCard !== null}
        title={flashcardTranslator.t("ui.deleteCard")}
        description={flashcardTranslator.t(
          "ui.thisCardAndItsReviewHistoryWillBePermanentlyDeleted"
        )}
        danger
        confirmText={flashcardTranslator.t("ui.delete")}
        onCancel={() => setDeletingCard(null)}
        onConfirm={() => void confirmDeleteCard()}
      />
      <MobileConfirmDialog
        open={deletingDeck}
        title={flashcardTranslator.t("ui.deleteDeck")}
        description={flashcardTranslator.t("deck.deleteWarning", {
          name: deck?.name ?? flashcardTranslator.t("ui.thisDeck"),
        })}
        danger
        confirmText={flashcardTranslator.t("ui.delete")}
        onCancel={() => setDeletingDeck(false)}
        onConfirm={() => void confirmDeleteDeck()}
      />
    </div>
  );
}
