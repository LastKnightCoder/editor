import { create } from "zustand";
import { produce } from "immer";
import {
  SliderDeck,
  SliderPage,
  SliderEditorBlock,
  SliderTemplateSet,
  SliderTemplate,
  ICreateSliderDeck,
  IUpdateSliderDeck,
  ICreateSliderPage,
  IUpdateSliderPage,
  ICreateSliderEditorBlock,
  IUpdateSliderEditorBlock,
  ICreateSliderTemplateSet,
  IUpdateSliderTemplateSet,
  ICreateSliderTemplate,
  IUpdateSliderTemplate,
} from "@/types";
import {
  createSliderDeck,
  updateSliderDeck,
  deleteSliderDeck,
  getSliderDeck,
  getAllSliderDecks,
  createSliderPage,
  updateSliderPage,
  deleteSliderPage,
  getSliderPage,
  getSliderPagesByDeck,
  reorderSliderPages,
  createSliderEditorBlock,
  updateSliderEditorBlock,
  deleteSliderEditorBlock,
  getSliderEditorsByPage,
  createSliderTemplateSet,
  updateSliderTemplateSet,
  deleteSliderTemplateSet,
  getAllSliderTemplateSets,
  createSliderTemplate,
  updateSliderTemplate,
  deleteSliderTemplate,
  getSliderTemplatesBySet,
} from "@/commands";

interface IState {
  decks: SliderDeck[];
  pagesByDeck: Map<number, SliderPage[]>;
  blocksByPage: Map<number, SliderEditorBlock[]>;
  templateSets: SliderTemplateSet[];
  templatesBySet: Map<number, SliderTemplate[]>;
}

interface IAction {
  initDecks: () => Promise<void>;
  createDeck: (deck: ICreateSliderDeck) => Promise<SliderDeck>;
  updateDeck: (deck: IUpdateSliderDeck) => Promise<SliderDeck>;
  deleteDeck: (id: number) => Promise<void>;

  getDeck: (id: number) => Promise<SliderDeck>;
  getPagesByDeck: (deckId: number) => Promise<SliderPage[]>;
  createPage: (page: ICreateSliderPage) => Promise<SliderPage>;
  updatePage: (page: IUpdateSliderPage) => Promise<SliderPage>;
  deletePage: (id: number) => Promise<void>;
  reorderPages: (deckId: number, ids: number[]) => Promise<boolean>;

  getEditorsByPage: (pageId: number) => Promise<SliderEditorBlock[]>;
  createEditor: (block: ICreateSliderEditorBlock) => Promise<SliderEditorBlock>;
  updateEditor: (block: IUpdateSliderEditorBlock) => Promise<SliderEditorBlock>;
  deleteEditor: (id: number) => Promise<void>;

  initTemplateSets: () => Promise<void>;
  createTemplateSet: (
    s: ICreateSliderTemplateSet,
  ) => Promise<SliderTemplateSet>;
  updateTemplateSet: (
    s: IUpdateSliderTemplateSet,
  ) => Promise<SliderTemplateSet>;
  deleteTemplateSet: (id: number) => Promise<void>;

  getTemplatesBySet: (setId: number) => Promise<SliderTemplate[]>;
  createTemplate: (t: ICreateSliderTemplate) => Promise<SliderTemplate>;
  updateTemplate: (t: IUpdateSliderTemplate) => Promise<SliderTemplate>;
  deleteTemplate: (id: number) => Promise<void>;
}

const useSliderStore = create<IState & IAction>((set, get) => ({
  decks: [],
  pagesByDeck: new Map(),
  blocksByPage: new Map(),
  templateSets: [],
  templatesBySet: new Map(),

  initDecks: async () => {
    const decks = await getAllSliderDecks();
    set({ decks });
  },
  createDeck: async (deck) => {
    const created = await createSliderDeck(deck);
    set(
      produce((state: IState) => {
        state.decks.push(created);
      }),
    );
    return created;
  },
  updateDeck: async (deck) => {
    const updated = await updateSliderDeck(deck);
    set(
      produce((state: IState) => {
        const idx = state.decks.findIndex((d) => d.id === updated.id);
        if (idx >= 0) state.decks[idx] = updated;
      }),
    );
    return updated;
  },
  deleteDeck: async (id) => {
    await deleteSliderDeck(id);
    set(
      produce((state: IState) => {
        state.decks = state.decks.filter((d) => d.id !== id);
        state.pagesByDeck.delete(id);
      }),
    );
  },

  getDeck: async (id) => getSliderDeck(id),

  getPagesByDeck: async (deckId) => {
    const pages = await getSliderPagesByDeck(deckId);
    set(
      produce((state: IState) => {
        state.pagesByDeck.set(deckId, pages);
      }),
    );
    return pages;
  },
  createPage: async (page) => {
    const created = await createSliderPage(page);
    const pages = await getSliderPagesByDeck(created.deckId);
    set(
      produce((state: IState) => {
        state.pagesByDeck.set(created.deckId, pages);
      }),
    );
    return created;
  },
  updatePage: async (page) => {
    const updated = await updateSliderPage(page);
    const pages = await getSliderPagesByDeck(updated.deckId);
    set(
      produce((state: IState) => {
        state.pagesByDeck.set(updated.deckId, pages);
      }),
    );
    return updated;
  },
  deletePage: async (id) => {
    const page = await getSliderPage(id);
    await deleteSliderPage(id);
    const pages = await getSliderPagesByDeck(page.deckId);
    set(
      produce((state: IState) => {
        state.pagesByDeck.set(page.deckId, pages);
      }),
    );
  },
  reorderPages: async (deckId, ids) => {
    const ok = await reorderSliderPages(deckId, ids);
    if (ok) {
      const pages = await getSliderPagesByDeck(deckId);
      set(
        produce((state: IState) => {
          state.pagesByDeck.set(deckId, pages);
        }),
      );
    }
    return ok;
  },

  getEditorsByPage: async (pageId) => {
    const blocks = await getSliderEditorsByPage(pageId);
    set(
      produce((state: IState) => {
        state.blocksByPage.set(pageId, blocks);
      }),
    );
    return blocks;
  },
  createEditor: async (block) => {
    const created = await createSliderEditorBlock(block);
    const blocks = await getSliderEditorsByPage(created.pageId);
    set(
      produce((state: IState) => {
        state.blocksByPage.set(created.pageId, blocks);
      }),
    );
    return created;
  },
  updateEditor: async (block) => {
    const updated = await updateSliderEditorBlock(block);
    const blocks = await getSliderEditorsByPage(updated.pageId);
    set(
      produce((state: IState) => {
        state.blocksByPage.set(updated.pageId, blocks);
      }),
    );
    return updated;
  },
  deleteEditor: async (id) => {
    // 找到其 pageId 以刷新
    const blocksMap = get().blocksByPage;
    let pageId: number | null = null;
    for (const [pid, list] of blocksMap) {
      if (list.some((b) => b.id === id)) {
        pageId = pid;
        break;
      }
    }
    await deleteSliderEditorBlock(id);
    if (pageId != null) {
      const blocks = await getSliderEditorsByPage(pageId);
      set(
        produce((state: IState) => {
          state.blocksByPage.set(pageId!, blocks);
        }),
      );
    }
  },

  initTemplateSets: async () => {
    const sets = await getAllSliderTemplateSets();
    set({ templateSets: sets });
  },
  createTemplateSet: async (s) => {
    const created = await createSliderTemplateSet(s);
    set(
      produce((state: IState) => {
        state.templateSets.push(created);
      }),
    );
    return created;
  },
  updateTemplateSet: async (s) => {
    const updated = await updateSliderTemplateSet(s);
    set(
      produce((state: IState) => {
        const idx = state.templateSets.findIndex((x) => x.id === updated.id);
        if (idx >= 0) state.templateSets[idx] = updated;
      }),
    );
    return updated;
  },
  deleteTemplateSet: async (id) => {
    await deleteSliderTemplateSet(id);
    set(
      produce((state: IState) => {
        state.templateSets = state.templateSets.filter((x) => x.id !== id);
        state.templatesBySet.delete(id);
      }),
    );
  },

  getTemplatesBySet: async (setId) => {
    const list = await getSliderTemplatesBySet(setId);
    set(
      produce((state: IState) => {
        state.templatesBySet.set(setId, list);
      }),
    );
    return list;
  },
  createTemplate: async (t) => {
    const created = await createSliderTemplate(t);
    const list = await getSliderTemplatesBySet(created.setId);
    set(
      produce((state: IState) => {
        state.templatesBySet.set(created.setId, list);
      }),
    );
    return created;
  },
  updateTemplate: async (t) => {
    const updated = await updateSliderTemplate(t);
    const list = await getSliderTemplatesBySet(updated.setId);
    set(
      produce((state: IState) => {
        state.templatesBySet.set(updated.setId, list);
      }),
    );
    return updated;
  },
  deleteTemplate: async (id) => {
    // 找 setId 重刷
    const map = get().templatesBySet;
    let setId: number | null = null;
    for (const [sid, arr] of map) {
      if (arr.some((x) => x.id === id)) {
        setId = sid;
        break;
      }
    }
    await deleteSliderTemplate(id);
    if (setId != null) {
      const list = await getSliderTemplatesBySet(setId);
      set(
        produce((state: IState) => {
          state.templatesBySet.set(setId!, list);
        }),
      );
    }
  },
}));

export default useSliderStore;
