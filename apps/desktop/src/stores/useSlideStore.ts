import { create } from "zustand";
import { produce } from "immer";
import {
  createSlideAsset,
  createSlideDeck,
  createSlidePage,
  deleteSlideAsset,
  deleteSlideDeck,
  deleteSlidePage,
  getSlideAssetsByDeck,
  getSlideDeckById,
  getSlideDecks,
  getSlidePageById,
  getSlidePagesByDeck,
  updateSlideDeck,
  updateSlidePage,
} from "@/commands";
import {
  CreateSlideDeck,
  CreateSlidePage,
  SlideAsset,
  SlideDeck,
  SlidePage,
  SlideStorageMode,
  UpdateSlideDeck,
  UpdateSlidePage,
} from "@/types/slide";
import { DEFAULT_CARD_CONTENT } from "@/constants";

interface SlideState {
  decks: SlideDeck[];
  pagesByDeck: Record<number, SlidePage[]>;
  assetsByDeck: Record<number, SlideAsset[]>;
  loadingDecks: boolean;
  loadingPages: boolean;
  currentDeckId?: number;
  currentPageId?: number;
}

interface SlideActions {
  init: () => Promise<void>;
  refreshDeck: (id: number) => Promise<void>;
  selectDeck: (id: number) => Promise<void>;
  selectPage: (pageId: number) => void;
  createDeck: (payload: CreateSlideDeck) => Promise<SlideDeck>;
  updateDeck: (payload: UpdateSlideDeck) => Promise<SlideDeck>;
  removeDeck: (id: number) => Promise<void>;
  createPage: (payload: CreateSlidePage) => Promise<SlidePage>;
  updatePage: (payload: UpdateSlidePage) => Promise<SlidePage>;
  removePage: (id: number) => Promise<void>;
  loadAssets: (deckId: number) => Promise<void>;
  addAsset: (payload: Parameters<typeof createSlideAsset>[0]) => Promise<void>;
  removeAsset: (id: number, deckId: number) => Promise<void>;
}

const ensurePagesOrder = (pages: SlidePage[]) =>
  [...pages].sort((a, b) => a.pageIndex - b.pageIndex);

const defaultDeckMetadata = {
  storageMode: "reference" as SlideStorageMode,
};

const useSlideStore = create<SlideState & SlideActions>((set, get) => ({
  decks: [],
  pagesByDeck: {},
  assetsByDeck: {},
  loadingDecks: false,
  loadingPages: false,
  currentDeckId: undefined,
  currentPageId: undefined,

  init: async () => {
    set({ loadingDecks: true });
    const decks = await getSlideDecks();
    set({ decks, loadingDecks: false });
    if (decks.length > 0) {
      await get().selectDeck(decks[0].id);
    }
  },

  refreshDeck: async (id: number) => {
    const deck = await getSlideDeckById(id);
    set(
      produce<SlideState>((state) => {
        const idx = state.decks.findIndex((d) => d.id === id);
        if (idx !== -1) {
          state.decks[idx] = deck;
        } else {
          state.decks.push(deck);
        }
      }),
    );
  },

  selectDeck: async (id: number) => {
    set({ currentDeckId: id, currentPageId: undefined });
    const { pagesByDeck } = get();
    if (!pagesByDeck[id]) {
      set({ loadingPages: true });
      const pages = await getSlidePagesByDeck(id);
      set(
        produce<SlideState>((state) => {
          state.pagesByDeck[id] = ensurePagesOrder(pages);
          state.loadingPages = false;
          state.currentPageId = pages[0]?.id;
        }),
      );
    } else {
      const existing = pagesByDeck[id];
      set({
        currentPageId: existing[0]?.id,
      });
    }
  },

  selectPage: (pageId: number) => {
    set({ currentPageId: pageId });
  },

  createDeck: async (payload: CreateSlideDeck) => {
    const deck = await createSlideDeck({
      ...payload,
      metadata: { ...defaultDeckMetadata, ...payload.metadata },
    });
    set(
      produce<SlideState>((state) => {
        state.decks.unshift(deck);
        state.currentDeckId = deck.id;
        state.currentPageId = undefined;
      }),
    );
    return deck;
  },

  updateDeck: async (payload: UpdateSlideDeck) => {
    const deck = await updateSlideDeck(payload);
    set(
      produce<SlideState>((state) => {
        const idx = state.decks.findIndex((d) => d.id === deck.id);
        if (idx !== -1) {
          state.decks[idx] = deck;
        }
      }),
    );
    return deck;
  },

  createPage: async (payload: CreateSlidePage) => {
    const page = await createSlidePage({
      clicksConfig: {
        clicksStart: 0,
        clicks: [],
      },
      ...payload,
      content: payload.content ?? DEFAULT_CARD_CONTENT,
    });
    set(
      produce<SlideState>((state) => {
        const list = state.pagesByDeck[page.deckId] || [];
        list.push(page);
        state.pagesByDeck[page.deckId] = ensurePagesOrder(list);
        if (state.currentDeckId === page.deckId) {
          state.currentPageId = page.id;
        }
        const deckIdx = state.decks.findIndex(
          (deck) => deck.id === page.deckId,
        );
        if (deckIdx !== -1) {
          state.decks[deckIdx].pageIds = state.pagesByDeck[page.deckId].map(
            (p) => p.id,
          );
        }
      }),
    );
    return page;
  },

  updatePage: async (payload: UpdateSlidePage) => {
    const page = await updateSlidePage(payload);
    set(
      produce<SlideState>((state) => {
        const list = state.pagesByDeck[page.deckId];
        if (list) {
          const idx = list.findIndex((p) => p.id === page.id);
          if (idx !== -1) {
            list[idx] = page;
            state.pagesByDeck[page.deckId] = ensurePagesOrder(list);
          }
          const deckIdx = state.decks.findIndex(
            (deck) => deck.id === page.deckId,
          );
          if (deckIdx !== -1) {
            state.decks[deckIdx].pageIds = state.pagesByDeck[page.deckId].map(
              (p) => p.id,
            );
          }
        }
      }),
    );
    return page;
  },

  removePage: async (id: number) => {
    const page = await getSlidePageById(id);
    await deleteSlidePage(id);
    set(
      produce<SlideState>((state) => {
        const list = state.pagesByDeck[page.deckId];
        if (list) {
          state.pagesByDeck[page.deckId] = list.filter((p) => p.id !== id);
        }
        if (state.currentPageId === id) {
          state.currentPageId =
            state.pagesByDeck[page.deckId]?.[0]?.id ?? undefined;
        }
        const deckIdx = state.decks.findIndex(
          (deck) => deck.id === page.deckId,
        );
        if (deckIdx !== -1) {
          state.decks[deckIdx].pageIds =
            state.pagesByDeck[page.deckId]?.map((p) => p.id) ?? [];
        }
      }),
    );
  },

  removeDeck: async (id: number) => {
    await deleteSlideDeck(id);
    set(
      produce<SlideState>((state) => {
        state.decks = state.decks.filter((d) => d.id !== id);
        delete state.pagesByDeck[id];
        delete state.assetsByDeck[id];
        if (state.currentDeckId === id) {
          state.currentDeckId = state.decks[0]?.id;
          const nextPages = state.currentDeckId
            ? state.pagesByDeck[state.currentDeckId]
            : undefined;
          state.currentPageId = nextPages?.[0]?.id;
        }
      }),
    );
    const nextDeckId = get().currentDeckId;
    if (nextDeckId) {
      await get().selectDeck(nextDeckId);
    }
  },

  loadAssets: async (deckId: number) => {
    const assets = await getSlideAssetsByDeck(deckId);
    set(
      produce<SlideState>((state) => {
        state.assetsByDeck[deckId] = assets;
      }),
    );
  },

  addAsset: async (payload: Parameters<typeof createSlideAsset>[0]) => {
    const asset = await createSlideAsset(payload);
    set(
      produce<SlideState>((state) => {
        const list = state.assetsByDeck[payload.deckId] || [];
        list.unshift(asset);
        state.assetsByDeck[payload.deckId] = list;
      }),
    );
  },

  removeAsset: async (id: number, deckId: number) => {
    await deleteSlideAsset(id);
    set(
      produce<SlideState>((state) => {
        const list = state.assetsByDeck[deckId];
        if (list) {
          state.assetsByDeck[deckId] = list.filter((asset) => asset.id !== id);
        }
      }),
    );
  },
}));

export default useSlideStore;
