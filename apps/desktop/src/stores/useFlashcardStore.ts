import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  FlashcardDeck,
  Flashcard,
  FlashcardReviewRating,
  CreateFlashcardDeckInput,
  UpdateFlashcardDeckInput,
  CreateFlashcardInput,
  UpdateFlashcardInput,
  FlashcardReviewPayload,
  FlashcardQueueRequest,
} from "@/types";
import {
  listFlashcardDecks,
  createFlashcardDeck,
  updateFlashcardDeck,
  deleteFlashcardDeck,
  listFlashcards,
  createFlashcard,
  updateFlashcard,
  deleteFlashcard,
  getFlashcardReviewQueue,
  submitFlashcardReview,
} from "@/commands/flashcard";

type FlashcardFilters = {
  search: string;
  tag: string;
  statuses: Flashcard["status"][];
};

type FlashcardViewMode = "overview" | "table" | "review";

interface ReviewHistoryEntry {
  cardId: number;
  rating: FlashcardReviewRating;
  reviewTime: number;
}

interface FlashcardState {
  decks: FlashcardDeck[];
  cardsByDeck: Record<number, Flashcard[]>;
  activeDeckId: number | null;
  loadingDecks: boolean;
  loadingCards: boolean;
  loadingReview: boolean;
  reviewQueue: Flashcard[];
  queueDeckId: number | null;
  filters: FlashcardFilters;
  viewMode: FlashcardViewMode;
  editingCard: Flashcard | null;
  reviewHistory: ReviewHistoryEntry[];
}

interface FlashcardActions {
  fetchDecks: () => Promise<void>;
  selectDeck: (deckId: number) => Promise<void>;
  refreshActiveDeck: () => Promise<void>;
  fetchCards: (deckId: number) => Promise<void>;
  createDeck: (payload: CreateFlashcardDeckInput) => Promise<FlashcardDeck>;
  updateDeck: (
    payload: UpdateFlashcardDeckInput,
  ) => Promise<FlashcardDeck | null>;
  deleteDeck: (deckId: number) => Promise<void>;
  createCard: (payload: CreateFlashcardInput) => Promise<Flashcard>;
  updateCard: (payload: UpdateFlashcardInput) => Promise<Flashcard | null>;
  deleteCard: (cardId: number) => Promise<void>;
  queueReviews: (params?: FlashcardQueueRequest) => Promise<Flashcard[]>;
  submitReview: (payload: FlashcardReviewPayload) => Promise<Flashcard | null>;
  setFilters: (partial: Partial<FlashcardFilters>) => void;
  setViewMode: (mode: FlashcardViewMode) => void;
  setEditingCard: (card: Flashcard | null) => void;
  getActiveDeck: () => FlashcardDeck | null;
  getActiveCards: () => Flashcard[];
}

const initialState: FlashcardState = {
  decks: [],
  cardsByDeck: {},
  activeDeckId: null,
  loadingDecks: false,
  loadingCards: false,
  loadingReview: false,
  reviewQueue: [],
  queueDeckId: null,
  filters: {
    search: "",
    tag: "",
    statuses: [],
  },
  viewMode: "overview",
  editingCard: null,
  reviewHistory: [],
};

const upsertCard = (cards: Flashcard[], card: Flashcard) => {
  const index = cards.findIndex((item) => item.id === card.id);
  if (index === -1) {
    return [card, ...cards];
  }
  const copy = [...cards];
  copy[index] = card;
  return copy;
};

const removeCard = (cards: Flashcard[], cardId: number) => {
  return cards.filter((card) => card.id !== cardId);
};

const findDeckIdByCard = (
  cardsByDeck: Record<number, Flashcard[]>,
  cardId: number,
) => {
  for (const [deckId, cards] of Object.entries(cardsByDeck)) {
    if (cards.some((card) => card.id === cardId)) {
      return Number(deckId);
    }
  }
  return null;
};

const useFlashcardStore = create<FlashcardState & FlashcardActions>()(
  persist(
    (set, get) => ({
      ...initialState,
      fetchDecks: async () => {
        set({ loadingDecks: true });
        try {
          const decks = await listFlashcardDecks();
          set((state) => {
            const nextActive =
              state.activeDeckId &&
              decks.some((d) => d.id === state.activeDeckId)
                ? state.activeDeckId
                : (decks[0]?.id ?? null);
            return {
              decks,
              activeDeckId: nextActive,
            };
          });
          const activeDeckId = get().activeDeckId;
          if (activeDeckId && !get().cardsByDeck[activeDeckId]) {
            await get().fetchCards(activeDeckId);
          }
        } catch (error) {
          console.error("[FlashcardStore] fetchDecks failed", error);
        } finally {
          set({ loadingDecks: false });
        }
      },
      selectDeck: async (deckId: number) => {
        set({ activeDeckId: deckId });
        await get().fetchCards(deckId);
      },
      refreshActiveDeck: async () => {
        const deckId = get().activeDeckId;
        if (deckId) {
          await get().fetchCards(deckId);
        }
      },
      fetchCards: async (deckId: number) => {
        set({ loadingCards: true });
        try {
          const { filters } = get();
          const cards = await listFlashcards({
            deckId,
            search: filters.search?.trim() || undefined,
            tag: filters.tag?.trim() || undefined,
            statuses:
              filters.statuses && filters.statuses.length > 0
                ? filters.statuses
                : undefined,
          });
          set((state) => ({
            cardsByDeck: {
              ...state.cardsByDeck,
              [deckId]: cards,
            },
          }));
        } catch (error) {
          console.error("[FlashcardStore] fetchCards failed", error);
        } finally {
          set({ loadingCards: false });
        }
      },
      createDeck: async (payload) => {
        const deck = await createFlashcardDeck(payload);
        set((state) => ({
          decks: [deck, ...state.decks],
          activeDeckId: deck.id,
        }));
        set((state) => ({
          cardsByDeck: {
            ...state.cardsByDeck,
            [deck.id]: [],
          },
        }));
        return deck;
      },
      updateDeck: async (payload) => {
        const deck = await updateFlashcardDeck(payload);
        if (!deck) {
          return null;
        }
        set((state) => ({
          decks: state.decks.map((item) => (item.id === deck.id ? deck : item)),
        }));
        return deck;
      },
      deleteDeck: async (deckId) => {
        const success = await deleteFlashcardDeck(deckId);
        if (!success) return;
        set((state) => {
          const updatedDecks = state.decks.filter((deck) => deck.id !== deckId);
          const { [deckId]: _, ...restCards } = state.cardsByDeck;
          const nextActive =
            state.activeDeckId === deckId
              ? (updatedDecks[0]?.id ?? null)
              : state.activeDeckId;
          return {
            decks: updatedDecks,
            cardsByDeck: restCards,
            activeDeckId: nextActive,
            reviewQueue: state.queueDeckId === deckId ? [] : state.reviewQueue,
            queueDeckId:
              state.queueDeckId === deckId ? null : state.queueDeckId,
          };
        });
        const nextActive = get().activeDeckId;
        if (nextActive) {
          await get().fetchCards(nextActive);
        }
      },
      createCard: async (payload) => {
        const card = await createFlashcard(payload);
        set((state) => {
          const currentCards = state.cardsByDeck[card.deckId] ?? [];
          return {
            cardsByDeck: {
              ...state.cardsByDeck,
              [card.deckId]: [card, ...currentCards],
            },
          };
        });
        await get().fetchDecks();
        return card;
      },
      updateCard: async (payload) => {
        const card = await updateFlashcard(payload);
        if (!card) return null;
        set((state) => {
          const previousDeckId = findDeckIdByCard(state.cardsByDeck, card.id);
          const nextCardsByDeck = { ...state.cardsByDeck };
          if (previousDeckId !== null && previousDeckId !== card.deckId) {
            nextCardsByDeck[previousDeckId] = removeCard(
              nextCardsByDeck[previousDeckId] ?? [],
              card.id,
            );
          }
          nextCardsByDeck[card.deckId] = upsertCard(
            nextCardsByDeck[card.deckId] ?? [],
            card,
          );
          return {
            cardsByDeck: nextCardsByDeck,
            reviewQueue: state.reviewQueue.map((item) =>
              item.id === card.id ? card : item,
            ),
            editingCard:
              state.editingCard && state.editingCard.id === card.id
                ? card
                : state.editingCard,
          };
        });
        return card;
      },
      deleteCard: async (cardId) => {
        const success = await deleteFlashcard(cardId);
        if (!success) return;
        set((state) => {
          const deckId = findDeckIdByCard(state.cardsByDeck, cardId);
          if (deckId === null) {
            return {
              reviewQueue: state.reviewQueue.filter(
                (card) => card.id !== cardId,
              ),
              editingCard:
                state.editingCard && state.editingCard.id === cardId
                  ? null
                  : state.editingCard,
            };
          }
          return {
            cardsByDeck: {
              ...state.cardsByDeck,
              [deckId]: removeCard(state.cardsByDeck[deckId] ?? [], cardId),
            },
            reviewQueue: state.reviewQueue.filter((card) => card.id !== cardId),
            editingCard:
              state.editingCard && state.editingCard.id === cardId
                ? null
                : state.editingCard,
          };
        });
        await get().fetchDecks();
      },
      queueReviews: async (params) => {
        set({ loadingReview: true });
        try {
          const deckId = params?.deckId ?? get().activeDeckId ?? undefined;
          const queue = await getFlashcardReviewQueue({
            deckId,
            includeUpcoming: params?.includeUpcoming,
            limit: params?.limit ?? 20,
            statuses: params?.statuses,
          });
          set({
            reviewQueue: queue,
            queueDeckId: deckId ?? null,
          });
          return queue;
        } catch (error) {
          console.error("[FlashcardStore] queueReviews failed", error);
          return [];
        } finally {
          set({ loadingReview: false });
        }
      },
      submitReview: async (payload) => {
        const card = await submitFlashcardReview(payload);
        if (!card) return null;
        set((state) => {
          const nextCardsByDeck = { ...state.cardsByDeck };
          nextCardsByDeck[card.deckId] = upsertCard(
            nextCardsByDeck[card.deckId] ?? [],
            card,
          );
          return {
            cardsByDeck: nextCardsByDeck,
            reviewQueue: state.reviewQueue.filter(
              (item) => item.id !== payload.cardId,
            ),
            reviewHistory: [
              {
                cardId: payload.cardId,
                rating: payload.rating,
                reviewTime: Date.now(),
              },
              ...state.reviewHistory,
            ].slice(0, 20),
            editingCard:
              state.editingCard && state.editingCard.id === card.id
                ? card
                : state.editingCard,
          };
        });
        await get().fetchDecks();
        return card;
      },
      setFilters: (partial) => {
        set((state) => ({
          filters: {
            ...state.filters,
            ...partial,
          },
        }));
      },
      setViewMode: (mode) => {
        set({ viewMode: mode });
      },
      setEditingCard: (card) => {
        set({ editingCard: card });
      },
      getActiveDeck: () => {
        const { decks, activeDeckId } = get();
        return decks.find((deck) => deck.id === activeDeckId) ?? null;
      },
      getActiveCards: () => {
        const { activeDeckId, cardsByDeck } = get();
        if (!activeDeckId) return [];
        return cardsByDeck[activeDeckId] ?? [];
      },
    }),
    {
      name: "flashcard-center",
      partialize: (state) => ({
        activeDeckId: state.activeDeckId,
        filters: state.filters,
        viewMode: state.viewMode,
      }),
    },
  ),
);

export default useFlashcardStore;
