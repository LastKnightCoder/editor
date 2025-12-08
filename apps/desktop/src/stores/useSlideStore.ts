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
  createSlideGroup,
  updateSlideGroup,
  deleteSlideGroup,
  getAllSlideGroups,
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
  SlideGroup,
  CreateSlideGroup,
  UpdateSlideGroup,
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
  // 分组相关状态
  groups: SlideGroup[];
  selectedGroupId: number | null | "all"; // null 表示未分组，"all" 表示全部
  expandedGroups: number[];
  searchKeyword: string;
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
  // 分组相关方法
  initGroups: () => Promise<void>;
  createGroup: (payload: CreateSlideGroup) => Promise<SlideGroup>;
  updateGroup: (payload: UpdateSlideGroup) => Promise<SlideGroup>;
  removeGroup: (id: number) => Promise<void>;
  setSelectedGroup: (id: number | null | "all") => void;
  toggleGroupExpand: (id: number) => void;
  moveDeckToGroup: (deckId: number, groupId: number | null) => Promise<void>;
  setSearchKeyword: (keyword: string) => void;
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
  // 分组相关初始状态
  groups: [],
  selectedGroupId: "all",
  expandedGroups: [],
  searchKeyword: "",

  init: async () => {
    set({ loadingDecks: true });
    const [decks, groups] = await Promise.all([
      getSlideDecks(),
      getAllSlideGroups(),
    ]);
    set({ decks, groups, loadingDecks: false });
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

  // 分组相关方法实现
  initGroups: async () => {
    const groups = await getAllSlideGroups();
    set({ groups });
  },

  createGroup: async (payload: CreateSlideGroup) => {
    const group = await createSlideGroup(payload);
    set(
      produce<SlideState>((state) => {
        state.groups.push(group);
      }),
    );
    return group;
  },

  updateGroup: async (payload: UpdateSlideGroup) => {
    const group = await updateSlideGroup(payload);
    set(
      produce<SlideState>((state) => {
        const idx = state.groups.findIndex((g) => g.id === group.id);
        if (idx !== -1) {
          state.groups[idx] = group;
        }
      }),
    );
    return group;
  },

  removeGroup: async (id: number) => {
    await deleteSlideGroup(id);
    set(
      produce<SlideState>((state) => {
        state.groups = state.groups.filter((g) => g.id !== id);
        // 如果当前选中的是被删除的分组，切换到全部
        if (state.selectedGroupId === id) {
          state.selectedGroupId = "all";
        }
      }),
    );
  },

  setSelectedGroup: (id: number | null | "all") => {
    set({ selectedGroupId: id });
  },

  toggleGroupExpand: (id: number) => {
    set(
      produce<SlideState>((state) => {
        const idx = state.expandedGroups.indexOf(id);
        if (idx !== -1) {
          state.expandedGroups.splice(idx, 1);
        } else {
          state.expandedGroups.push(id);
        }
      }),
    );
  },

  moveDeckToGroup: async (deckId: number, groupId: number | null) => {
    const deck = await updateSlideDeck({ id: deckId, groupId });
    set(
      produce<SlideState>((state) => {
        const idx = state.decks.findIndex((d) => d.id === deckId);
        if (idx !== -1) {
          state.decks[idx] = deck;
        }
      }),
    );
  },

  setSearchKeyword: (keyword: string) => {
    set({ searchKeyword: keyword });
  },
}));

export default useSlideStore;
