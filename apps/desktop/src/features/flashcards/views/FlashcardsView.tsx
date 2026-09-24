/**
 * 闪卡复习页 · 复习台（两块板，与待办页同构）：
 * 工具栏（标题 + 今日摘要 + 新建卡组 / 新建闪卡）→ 卡组 pills（今日总览 + 各卡组）→
 * 左板（今日总览 = 今日块 + 卡组行；选中卡组 = 卡组的卡片列表）+ 右板（近 7 天评分 / 未来 7 天到期；卡组概况）。
 *
 * 复习 = 沉浸模式：页面换成 ReviewSession，导航侧栏收成图标列（mac 信号灯画在侧栏里，不整列隐藏），
 * 结束后恢复进入前的侧栏状态。编辑 = CardEditorDialog；删除卡片不确认，Toast 撤销 5 秒后才落库。
 * 键位（本页在栈顶、无浮层、不在输入框时）：R 复习当前范围 · N 新建闪卡。
 */

import { usePage, usePageBreadcrumb } from "@/page/PageProvider";
import { isEditableTarget } from "@/page/dom";
import type { Flashcard, FlashcardDeck, FlashcardType } from "@/types";
import { useQueryClient } from "@tanstack/react-query";
import { Button, IconButton, Loading, toast, useEdgeFade } from "@tau/ui";
import { FolderPlus, Plus } from "lucide-react";
import { MotionConfig } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CardEditorDialog } from "../components/CardEditorDialog";
import { DeckBoard, type StatusFilter } from "../components/DeckBoard";
import { DeckDialog } from "../components/DeckDialog";
import { DeckPills } from "../components/DeckPills";
import { DeckSide } from "../components/DeckSide";
import { DeleteDeckDialog } from "../components/DeleteDeckDialog";
import { OverviewBoard } from "../components/OverviewBoard";
import { OverviewSide } from "../components/OverviewSide";
import { ReviewSession } from "../components/ReviewSession";
import {
  renderCardMenu as cardMenuItems,
  renderDeckMenu as deckMenuItems,
} from "../components/flashcardMenus";
import { useReviewSidebar } from "../hooks/useReviewSidebar";
import { deckStats, reviewQueue, type DeckStats } from "../model";
import { overlayOpen } from "../overlay";
import {
  invalidateFlashcardViews,
  useFlashcardMutations,
  useFlashcardSnapshot,
  useReviewStats,
} from "../queries";

import { useDeferredCardDelete } from "../hooks/useDeferredCardDelete";
import { useNow } from "../hooks/useNow";

const PAGE_KEY = "review";

export function FlashcardsView() {
  const { navigator } = usePage();
  const queryClient = useQueryClient();
  const { snapshot, loading, error, retry } = useFlashcardSnapshot();
  const reviewStats = useReviewStats();
  const mutations = useFlashcardMutations();
  const now = useNow(snapshot);

  const [deckId, setDeckId] = useState<number | null>(null);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [type, setType] = useState<FlashcardType | "all">("all");
  const [review, setReview] = useState<{ queue: number[]; scopeId: number | null } | null>(null);
  const [editor, setEditor] = useState<{ card: Flashcard | null; deckId: number | null } | null>(
    null
  );
  const [deckDialog, setDeckDialog] = useState<{ deck: FlashcardDeck | null } | null>(null);
  const [deletingDeck, setDeletingDeck] = useState<FlashcardDeck | null>(null);
  /* 左板段头 sticky 吸顶：只做底部渐隐，顶部渐隐会把吸住的段头淡掉（同待办议程板） */
  const [boardScrollEl, setBoardScrollEl] = useState<HTMLDivElement | null>(null);
  useEdgeFade(boardScrollEl, { top: false });
  const [sideScrollEl, setSideScrollEl] = useState<HTMLDivElement | null>(null);
  useEdgeFade(sideScrollEl);

  const { pendingDelete, scheduleDelete } = useDeferredCardDelete(mutations);

  /* ---------- 派生 ---------- */

  const derived = useMemo(() => {
    if (!snapshot) return null;
    const cards = snapshot.cards.filter(c => !pendingDelete.has(c.id));
    const byDeck = new Map<number, Flashcard[]>();
    for (const card of cards) {
      const list = byDeck.get(card.deckId) ?? [];
      list.push(card);
      byDeck.set(card.deckId, list);
    }
    const stats = new Map<number, DeckStats>();
    for (const deck of snapshot.decks)
      stats.set(deck.id, deckStats(byDeck.get(deck.id) ?? [], now));
    return {
      cards,
      byDeck,
      stats,
      queue: reviewQueue(cards, now),
      allStats: deckStats(cards, now),
      cardsById: new Map(cards.map(c => [c.id, c])),
      decksById: new Map(snapshot.decks.map(d => [d.id, d])),
      dueByDeck: new Map([...stats].map(([id, s]) => [id, s.due])),
    };
  }, [snapshot, pendingDelete, now]);

  const deck = deckId != null ? (derived?.decksById.get(deckId) ?? null) : null;

  /* 选中的卡组被删除后回到总览 */
  useEffect(() => {
    if (snapshot && deckId != null && !snapshot.decks.some(d => d.id === deckId)) setDeckId(null);
  }, [snapshot, deckId]);

  /* ---------- 复习 ---------- */

  useReviewSidebar(review !== null);
  const startReview = (scopeId: number | null) => {
    if (!derived) return;
    const queue = reviewQueue(derived.cards, Date.now(), scopeId).map(c => c.id);
    if (!queue.length) {
      toast.info("这里没有需要复习的卡片");
      return;
    }
    setReview({ queue, scopeId });
  };
  const endReview = (reviewed: number) => {
    const scopeId = review?.scopeId ?? null;
    setReview(null);
    invalidateFlashcardViews(queryClient);
    if (reviewed && derived) {
      const left = reviewQueue(derived.cards, Date.now(), scopeId).length;
      toast.success(
        left
          ? `已复习 ${reviewed} 张，剩下 ${left} 张留在队列里`
          : `已复习 ${reviewed} 张，队列清空了`
      );
    }
  };

  const openNewCard = (targetDeckId: number | null = deckId) => {
    if (!snapshot?.decks.length) {
      setDeckDialog({ deck: null });
      toast.info("先新建一个卡组");
      return;
    }
    setEditor({ card: null, deckId: targetDeckId });
  };

  /* 键位：R 复习 · N 新建（仅本页在栈顶，浮层与输入框让位） */
  const keyHandlers = useRef({ startReview, openNewCard, deckId, reviewing: review !== null });
  keyHandlers.current = { startReview, openNewCard, deckId, reviewing: review !== null };
  useEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      const h = keyHandlers.current;
      if (h.reviewing || e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
      if (navigator.current()?.key !== PAGE_KEY || isEditableTarget(e.target)) return;
      if (overlayOpen()) return;
      const key = e.key.toLowerCase();
      if (key === "r") {
        e.preventDefault();
        h.startReview(h.deckId);
      } else if (key === "n") {
        e.preventDefault();
        h.openNewCard(h.deckId);
      }
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [navigator]);

  /* 标题栏面包屑：卡组视图 / 复习中显示「闪卡复习 / 范围」 */
  const crumbScope = review
    ? review.scopeId != null
      ? (derived?.decksById.get(review.scopeId)?.name ?? "")
      : "全部卡组"
    : (deck?.name ?? null);
  const breadcrumb = useMemo(() => {
    if (crumbScope == null) return null;
    return (
      <span className="text-tau-meta text-ink-2 flex min-w-0 items-center gap-1">
        <button
          type="button"
          disabled={review !== null}
          onClick={() => setDeckId(null)}
          className="ease-tau-out hover:text-accent-text rounded-tau-sm hover:bg-hover px-1.5 py-0.5 transition-colors disabled:pointer-events-none"
        >
          闪卡复习
        </button>
        <span className="text-ink-3">/</span>
        <span className="text-ink-1 truncate px-1.5 font-semibold">{crumbScope}</span>
      </span>
    );
  }, [crumbScope, review]);
  usePageBreadcrumb(PAGE_KEY, breadcrumb);

  if (error && !snapshot) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-danger">闪卡加载失败</p>
        <Button variant="secondary" onClick={() => void retry()}>
          重试
        </Button>
      </div>
    );
  }
  if (loading || !snapshot || !derived) return <Loading />;

  /* ---------- 菜单 ---------- */

  const renderDeckMenu = (target: FlashcardDeck) =>
    deckMenuItems(target, {
      onEdit: deck => setDeckDialog({ deck }),
      onAddCard: openNewCard,
      onDelete: setDeletingDeck,
    });
  const renderCardMenu = (card: Flashcard) =>
    cardMenuItems(card, {
      decks: snapshot.decks,
      mutations,
      onEdit: card => setEditor({ card, deckId: card.deckId }),
      onDelete: scheduleDelete,
    });

  const dialogs = (
    <>
      <CardEditorDialog
        open={editor !== null}
        card={editor?.card ?? null}
        decks={snapshot.decks}
        defaultDeckId={editor?.deckId ?? null}
        now={now}
        mutations={mutations}
        onClose={() => setEditor(null)}
        onDelete={scheduleDelete}
      />
      <DeckDialog
        open={deckDialog !== null}
        deck={deckDialog?.deck ?? null}
        mutations={mutations}
        onClose={() => setDeckDialog(null)}
        onCreated={created => setDeckId(created.id)}
      />
      <DeleteDeckDialog
        deck={deletingDeck}
        cardCount={deletingDeck ? (derived.byDeck.get(deletingDeck.id)?.length ?? 0) : 0}
        mutations={mutations}
        onClose={() => setDeletingDeck(null)}
        onDeleted={removed => deckId === removed.id && setDeckId(null)}
      />
    </>
  );

  if (review) {
    return (
      <MotionConfig reducedMotion="user">
        <ReviewSession
          queue={review.queue}
          cardsById={derived.cardsById}
          decksById={derived.decksById}
          scope={review.scopeId != null ? (derived.decksById.get(review.scopeId) ?? null) : null}
          mutations={mutations}
          onEdit={card => setEditor({ card, deckId: card.deckId })}
          onExit={endReview}
        />
        {dialogs}
      </MotionConfig>
    );
  }

  const deckCards = deck ? (derived.byDeck.get(deck.id) ?? []) : [];
  const currentStats = deck ? (derived.stats.get(deck.id) ?? deckStats(deckCards, now)) : null;
  const deckTypeCounts = new Map<FlashcardType, number>();
  for (const card of deckCards)
    deckTypeCounts.set(card.type, (deckTypeCounts.get(card.type) ?? 0) + 1);

  return (
    <MotionConfig reducedMotion="user">
      <div className="mx-auto flex h-full max-w-[1720px] flex-col px-[26px] pb-4">
        <div className="flex h-[44px] flex-none items-center gap-3">
          <h1 className="text-[19px] font-semibold tracking-[-0.01em]">闪卡复习</h1>
          <span className="text-ink-2 text-tau-meta tabular-nums">
            今天 <b className="text-ink-1 font-semibold">{derived.queue.length}</b> 张待复习 ·{" "}
            {derived.cards.length} 张 · {snapshot.decks.length} 个卡组
          </span>
          <span className="flex-1" />
          <IconButton
            aria-label="新建卡组"
            title="新建卡组"
            onClick={() => setDeckDialog({ deck: null })}
          >
            <FolderPlus size={16} strokeWidth={1.75} />
          </IconButton>
          <Button variant="soft" icon={Plus} onClick={() => openNewCard(deckId)}>
            新建闪卡
          </Button>
        </div>

        {snapshot.decks.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 pb-16 text-center">
            <p className="text-ink-2 text-[15px] font-medium">还没有卡组</p>
            <p className="text-ink-3 text-[12.5px]">
              闪卡归属于卡组——先建一个，比如「操作系统」「英语词汇」
            </p>
            <Button
              className="mt-3"
              variant="primary"
              size="sm"
              icon={FolderPlus}
              onClick={() => setDeckDialog({ deck: null })}
            >
              新建卡组
            </Button>
          </div>
        ) : (
          <>
            <DeckPills
              decks={snapshot.decks}
              dueByDeck={derived.dueByDeck}
              totalDue={derived.queue.length}
              value={deck?.id ?? null}
              onChange={id => {
                setDeckId(id);
                setStatus("all");
                setType("all");
              }}
              renderDeckMenu={renderDeckMenu}
            />
            <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_clamp(260px,24vw,320px)] gap-4 pt-1">
              {/* 同右板：滚动容器上下右留隙，滚动条不贴卡片边缘与圆角；board 内上下内边距相应减去 10px */}
              <div className="bg-surface shadow-card flex min-h-0 flex-col overflow-hidden rounded-[16px]">
                <div
                  ref={setBoardScrollEl}
                  className="edge-fade-scroll my-2.5 mr-1.5 min-h-0 flex-1 overflow-y-auto"
                >
                  {deck ? (
                    <DeckBoard
                      deck={deck}
                      cards={deckCards}
                      stats={currentStats ?? derived.allStats}
                      now={now}
                      status={status}
                      type={type}
                      onStatusChange={setStatus}
                      onTypeChange={setType}
                      onStart={() => startReview(deck.id)}
                      onAddCard={() => openNewCard(deck.id)}
                      onOpenCard={card => setEditor({ card, deckId: card.deckId })}
                      deckMenu={renderDeckMenu(deck)}
                      renderCardMenu={renderCardMenu}
                    />
                  ) : (
                    <OverviewBoard
                      decks={snapshot.decks}
                      stats={derived.stats}
                      queue={derived.queue}
                      cards={derived.cards}
                      now={now}
                      onStart={startReview}
                      onOpenDeck={setDeckId}
                      onAddCard={openNewCard}
                      renderDeckMenu={renderDeckMenu}
                    />
                  )}
                </div>
              </div>
              {/* 卡片不滚动，内层滚动容器离边缘留隙：滚动条不贴卡片圆角（同待办右板） */}
              <div className="bg-surface shadow-card flex min-h-0 flex-col overflow-hidden rounded-[16px]">
                <div
                  ref={setSideScrollEl}
                  className="edge-fade-scroll my-2.5 mr-1.5 min-h-0 flex-1 overflow-y-auto"
                >
                  {deck ? (
                    <DeckSide
                      stats={currentStats ?? derived.allStats}
                      typeCounts={deckTypeCounts}
                      now={now}
                      createTime={deck.createTime}
                    />
                  ) : (
                    <OverviewSide
                      reviewStats={reviewStats}
                      forecast={derived.allStats.forecast}
                      now={now}
                    />
                  )}
                </div>
              </div>
            </div>
          </>
        )}
        {dialogs}
      </div>
    </MotionConfig>
  );
}
