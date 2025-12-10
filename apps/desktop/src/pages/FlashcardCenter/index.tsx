import { useEffect, useState, useCallback, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import type { FlashcardDeck, Flashcard } from "@/types";
import useFlashcardStore from "@/stores/useFlashcardStore";
import DeckSidebar from "./DeckSidebar";
import DeckFormModal from "./DeckFormModal";
import FlashcardGrid from "./FlashcardGrid";
import FlashcardEditor from "./FlashcardEditor";
import ReviewModal from "./ReviewModal";
import useTheme from "@/hooks/useTheme";

type DeckModalState =
  | { open: false; mode: "create" | "edit"; deck?: FlashcardDeck | null }
  | { open: true; mode: "create" | "edit"; deck?: FlashcardDeck | null };

const FlashcardCenter = () => {
  const { isDark } = useTheme();

  const {
    decks,
    activeDeckId,
    loadingDecks,
    loadingCards,
    filters,
    viewMode,
    reviewQueue,
    fetchDecks,
    selectDeck,
    setViewMode,
    deleteCard,
    setEditingCard,
    queueReviews,
    submitReview,
    getActiveDeck,
    getActiveCards,
    refreshActiveDeck,
    setFilters,
  } = useFlashcardStore(
    useShallow((state) => ({
      decks: state.decks,
      activeDeckId: state.activeDeckId,
      loadingDecks: state.loadingDecks,
      loadingCards: state.loadingCards,
      filters: state.filters,
      viewMode: state.viewMode,
      reviewQueue: state.reviewQueue,
      fetchDecks: state.fetchDecks,
      selectDeck: state.selectDeck,
      setViewMode: state.setViewMode,
      deleteCard: state.deleteCard,
      setEditingCard: state.setEditingCard,
      queueReviews: state.queueReviews,
      submitReview: state.submitReview,
      getActiveDeck: state.getActiveDeck,
      getActiveCards: state.getActiveCards,
      refreshActiveDeck: state.refreshActiveDeck,
      setFilters: state.setFilters,
    })),
  );

  const [deckModal, setDeckModal] = useState<DeckModalState>({
    open: false,
    mode: "create",
  });
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"create" | "edit">("create");
  const [reviewModalOpen, setReviewModalOpen] = useState(false);

  const activeDeck = getActiveDeck();
  const activeCards = getActiveCards();
  const containerClass = useMemo(
    () =>
      isDark
        ? "bg-gradient-to-br from-slate-900 via-slate-950 to-zinc-950 text-gray-100"
        : "bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-900",
    [isDark],
  );
  const titleTextClass = isDark ? "text-white" : "text-slate-900";
  const subtitleTextClass = isDark ? "text-slate-400" : "text-slate-500";
  const secondaryButtonClass = isDark
    ? "border border-white/10 text-white hover:bg-white/10"
    : "border border-slate-200 text-slate-900 hover:bg-slate-100";

  useEffect(() => {
    fetchDecks();
  }, [fetchDecks]);

  const handleOpenCreateDeck = () => {
    setDeckModal({ open: true, mode: "create" });
  };

  const handleOpenEditDeck = (deck: FlashcardDeck) => {
    setDeckModal({ open: true, mode: "edit", deck });
  };

  const handleOpenCreateCard = () => {
    setEditorMode("create");
    setEditingCard(null);
    setEditorOpen(true);
  };

  const handleOpenEditCard = (card: Flashcard) => {
    setEditorMode("edit");
    setEditingCard(card);
    setEditorOpen(true);
  };

  const handleSearch = useCallback(
    (term: string) => {
      setFilters({ search: term });
      refreshActiveDeck();
    },
    [refreshActiveDeck, setFilters],
  );

  const handleStatusToggle = useCallback(
    (status: Flashcard["status"]) => {
      const statusSet = new Set(filters.statuses);
      if (statusSet.has(status)) {
        statusSet.delete(status);
      } else {
        statusSet.add(status);
      }
      setFilters({ statuses: Array.from(statusSet) });
      refreshActiveDeck();
    },
    [filters.statuses, refreshActiveDeck, setFilters],
  );

  const handleDeleteCard = useCallback(
    async (cardId: number) => {
      await deleteCard(cardId);
    },
    [deleteCard],
  );

  return (
    <div className={`flex h-full w-full ${containerClass}`}>
      <DeckSidebar
        decks={decks}
        activeDeckId={activeDeckId}
        loading={loadingDecks}
        onSelect={selectDeck}
        onCreate={handleOpenCreateDeck}
        onEdit={handleOpenEditDeck}
        isDark={isDark}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex items-center justify-between px-8 pt-8 pb-4">
          <div>
            <p
              className={`text-sm uppercase tracking-[0.3em] ${
                isDark ? "text-slate-500" : "text-slate-400"
              }`}
            >
              闪卡管理中心
            </p>
            <h1 className={`mt-2 text-2xl font-semibold ${titleTextClass}`}>
              {activeDeck ? activeDeck.name : "尚未创建卡组"}
            </h1>
            {activeDeck && activeDeck.description && (
              <p className={`mt-1 ${subtitleTextClass}`}>
                {activeDeck.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={async () => {
                const queue = await queueReviews({ deckId: activeDeck?.id ?? undefined });
                if (queue.length > 0) {
                  setReviewModalOpen(true);
                }
              }}
              disabled={!activeDeck}
              className="h-11 px-6 rounded-full bg-linear-to-r from-emerald-400 via-emerald-500 to-emerald-600 text-white font-semibold shadow-lg shadow-emerald-600/30 transition hover:scale-105 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              开始回顾
            </button>
            <button
              onClick={handleOpenCreateCard}
              disabled={!activeDeck}
              className={`h-11 px-6 rounded-full font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed ${secondaryButtonClass}`}
            >
              新建闪卡
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 px-6 pb-6 overflow-hidden">
          <FlashcardGrid
            cards={activeCards}
            loading={loadingCards}
            filters={filters}
            viewMode={viewMode}
            onSearch={handleSearch}
            onToggleStatus={handleStatusToggle}
            onViewModeChange={setViewMode}
            onCreateCard={handleOpenCreateCard}
            onEditCard={handleOpenEditCard}
            onDeleteCard={handleDeleteCard}
            isDark={isDark}
          />
        </div>
      </div>
      <ReviewModal
        open={reviewModalOpen}
        reviewQueue={reviewQueue}
        onSubmitReview={async (cardId, rating) => {
          await submitReview({
            cardId,
            deckId: activeDeck?.id ?? 0,
            rating,
          });
        }}
        onClose={() => setReviewModalOpen(false)}
      />
      <DeckFormModal
        state={deckModal}
        onClose={() => setDeckModal({ open: false, mode: "create" })}
        isDark={isDark}
      />
      <FlashcardEditor
        open={editorOpen}
        mode={editorMode}
        activeDeckId={activeDeck?.id ?? null}
        onClose={() => setEditorOpen(false)}
        isDark={isDark}
      />
    </div>
  );
};

export default FlashcardCenter;
