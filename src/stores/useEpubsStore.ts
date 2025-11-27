import { create } from "zustand";
import { produce } from "immer";
import { Epub, CreateEpub } from "@/types";
import {
  createEpub,
  updateEpub,
  removeEpub,
  getEpubList,
  updateEpubProgress,
} from "@/commands/epub";

interface IState {
  epubs: Epub[];
  activeEpub: Epub | null;
}

interface IAction {
  initEpubs: () => Promise<void>;
  createEpub: (epub: CreateEpub) => Promise<Epub>;
  updateEpub: (epub: Epub) => Promise<Epub>;
  removeEpub: (id: number) => Promise<number>;
  setActiveEpub: (epub: Epub | null) => void;
  updateProgress: (params: {
    id: number;
    progressCfi: string;
    progressPercentage: number;
  }) => Promise<Epub>;
}

const useEpubsStore = create<IState & IAction>((set, get) => ({
  epubs: [],
  activeEpub: null,

  initEpubs: async () => {
    const epubs = await getEpubList();
    set({
      epubs,
    });
  },

  createEpub: async (epub: CreateEpub) => {
    const { epubs } = get();
    const newEpub = await createEpub(epub);
    const newEpubs = produce(epubs, (draft) => {
      draft.unshift(newEpub); // 新的在前面
    });
    set({
      epubs: newEpubs,
    });
    return newEpub;
  },

  updateEpub: async (epub: Epub) => {
    const { epubs } = get();
    const newEpub = await updateEpub(epub);
    const newEpubs = produce(epubs, (draft) => {
      const index = draft.findIndex((item) => item.id === epub.id);
      if (index !== -1) {
        draft[index] = newEpub;
      }
    });
    set({
      epubs: newEpubs,
    });
    return newEpub;
  },

  removeEpub: async (id: number) => {
    const { epubs } = get();
    const newEpubs = produce(epubs, (draft) => {
      const index = draft.findIndex((item) => item.id === id);
      if (index !== -1) {
        draft.splice(index, 1);
      }
    });
    await removeEpub(id);
    set({
      epubs: newEpubs,
    });
    return id;
  },

  setActiveEpub: (epub: Epub | null) => {
    set({
      activeEpub: epub,
    });
  },

  updateProgress: async (params: {
    id: number;
    progressCfi: string;
    progressPercentage: number;
  }) => {
    const { epubs } = get();
    const newEpub = await updateEpubProgress(params);
    const newEpubs = produce(epubs, (draft) => {
      const index = draft.findIndex((item) => item.id === params.id);
      if (index !== -1) {
        draft[index] = newEpub;
      }
    });
    set({
      epubs: newEpubs,
    });
    return newEpub;
  },
}));

export default useEpubsStore;
