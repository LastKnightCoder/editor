import { useEffect, useState, useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import { useMemoizedFn, useLocalStorageState } from "ahooks";
import { App } from "antd";
import type { FlashcardDeck, Flashcard } from "@/types";
import useFlashcardStore from "@/stores/useFlashcardStore";
import ResizableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";
import SidebarToggleButton from "@/components/SidebarToggleButton";
import DeckSidebar from "./DeckSidebar";
import DeckFormModal from "./DeckFormModal";
import FlashcardGrid from "./FlashcardGrid";
import FlashcardEditor from "./FlashcardEditor";
import ReviewModal from "./ReviewModal";
import useTheme from "@/hooks/useTheme";
import useThemeColors from "@/hooks/useThemeColors";

type DeckModalState =
  | { open: false; mode: "create" | "edit"; deck?: FlashcardDeck | null }
  | { open: true; mode: "create" | "edit"; deck?: FlashcardDeck | null };

const FlashcardCenter = () => {
  const { isDark } = useTheme();
  const themeColors = useThemeColors();
  const { message } = App.useApp();

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

  const [hideSidebar, setHideSidebar] = useLocalStorageState(
    "flashcard-center-hide-sidebar",
    {
      defaultValue: false,
    },
  );

  const [sidebarWidth, setSidebarWidth] = useLocalStorageState(
    "flashcard-center-sidebar-width",
    {
      defaultValue: 280,
    },
  );

  const onFoldSidebar = useMemoizedFn(() => {
    setHideSidebar(!hideSidebar);
  });

  const activeDeck = getActiveDeck();
  const activeCards = getActiveCards();

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
    <div className="flex h-full w-full relative">
      <ResizableAndHideableSidebar
        width={sidebarWidth ?? 280}
        onWidthChange={setSidebarWidth}
        open={!hideSidebar}
        onToggle={onFoldSidebar}
        sidebarPosition="left"
        disableResize={false}
        minWidth={240}
        maxWidth={400}
        className="h-full overflow-hidden"
      >
        <DeckSidebar
          decks={decks}
          activeDeckId={activeDeckId}
          loading={loadingDecks}
          onSelect={selectDeck}
          onCreate={handleOpenCreateDeck}
          onEdit={handleOpenEditDeck}
          themeColors={themeColors}
        />
      </ResizableAndHideableSidebar>
      <SidebarToggleButton.Expand
        isHidden={!!hideSidebar}
        onToggle={onFoldSidebar}
        side="left"
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex items-center justify-between px-8 pt-8 pb-4">
          <div>
            <h1
              className={`mt-2 text-2xl font-semibold ${themeColors.activeTextClass}`}
            >
              {activeDeck ? activeDeck.name : "尚未创建卡组"}
            </h1>
            {activeDeck && activeDeck.description && (
              <p className={`mt-1 ${themeColors.textClass}`}>
                {activeDeck.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={async () => {
                const queue = await queueReviews({
                  deckId: activeDeck?.id ?? undefined,
                });
                if (queue.length > 0) {
                  setReviewModalOpen(true);
                } else {
                  message.info("当前没有需要回顾的闪卡");
                }
              }}
              disabled={!activeDeck}
              className={`h-11 px-6 rounded-full font-semibold shadow-lg transition hover:scale-105 disabled:opacity-60 disabled:cursor-not-allowed ${themeColors.primaryButtonClass}`}
            >
              开始回顾
            </button>
            <button
              onClick={handleOpenCreateCard}
              disabled={!activeDeck}
              className={`h-11 px-6 rounded-full font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed border ${themeColors.borderClass} ${themeColors.hoverClass} ${themeColors.activeTextClass}`}
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
            onEditCard={handleOpenEditCard}
            onDeleteCard={handleDeleteCard}
            isDark={isDark}
            themeColors={themeColors}
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
        themeColors={themeColors}
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
