import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ReadLaterItem } from "@/types";
import {
  listReadLater,
  listStarredReadLater,
  listArchivedReadLater,
  addToReadLater,
  removeReadLater,
  starReadLater,
  unstarReadLater,
  archiveReadLater,
  unarchiveReadLater,
  updateReadLater,
  checkReadLaterExists,
} from "@/commands/rss";
import type { CreateReadLaterPayload, UpdateReadLaterPayload } from "@/types";

export type ReadLaterFilterMode = "all" | "starred" | "archived";

interface IState {
  items: ReadLaterItem[];
  loading: boolean;
  filterMode: ReadLaterFilterMode;
  selectedItemId: number | null;
}

interface IAction {
  init: () => Promise<void>;
  loadItems: () => Promise<void>;
  addItem: (payload: CreateReadLaterPayload) => Promise<ReadLaterItem>;
  removeItem: (id: number) => Promise<void>;
  starItem: (id: number) => Promise<void>;
  unstarItem: (id: number) => Promise<void>;
  archiveItem: (id: number) => Promise<void>;
  unarchiveItem: (id: number) => Promise<void>;
  updateItem: (payload: UpdateReadLaterPayload) => Promise<void>;
  checkExists: (sourceType: string, sourceId: number) => Promise<boolean>;
  setFilterMode: (mode: ReadLaterFilterMode) => void;
  setSelectedItem: (id: number | null) => void;
}

const useReadLaterStore = create<IState & IAction>()(
  persist(
    (set, get) => ({
      items: [],
      loading: false,
      filterMode: "all",
      selectedItemId: null,

      init: async () => {
        await get().loadItems();
      },

      loadItems: async () => {
        set({ loading: true });
        try {
          const { filterMode } = get();
          let items: ReadLaterItem[];
          switch (filterMode) {
            case "starred":
              items = await listStarredReadLater(100);
              break;
            case "archived":
              items = await listArchivedReadLater(100);
              break;
            default:
              items = await listReadLater(100);
              break;
          }
          set({ items, loading: false });
        } catch {
          set({ loading: false });
        }
      },

      addItem: async (payload: CreateReadLaterPayload) => {
        const item = await addToReadLater(payload);
        await get().loadItems();
        return item;
      },

      removeItem: async (id: number) => {
        await removeReadLater(id);
        set({ items: get().items.filter((i) => i.id !== id) });
        if (get().selectedItemId === id) {
          set({ selectedItemId: null });
        }
      },

      starItem: async (id: number) => {
        await starReadLater(id);
        set({
          items: get().items.map((i) =>
            i.id === id ? { ...i, isStarred: 1 } : i,
          ),
        });
      },

      unstarItem: async (id: number) => {
        await unstarReadLater(id);
        set({
          items: get().items.map((i) =>
            i.id === id ? { ...i, isStarred: 0 } : i,
          ),
        });
      },

      archiveItem: async (id: number) => {
        await archiveReadLater(id);
        if (get().filterMode !== "archived") {
          set({ items: get().items.filter((i) => i.id !== id) });
        } else {
          set({
            items: get().items.map((i) =>
              i.id === id ? { ...i, isArchived: 1 } : i,
            ),
          });
        }
      },

      unarchiveItem: async (id: number) => {
        await unarchiveReadLater(id);
        if (get().filterMode === "archived") {
          set({ items: get().items.filter((i) => i.id !== id) });
        }
      },

      updateItem: async (payload: UpdateReadLaterPayload) => {
        await updateReadLater(payload);
        await get().loadItems();
      },

      checkExists: async (sourceType: string, sourceId: number) => {
        return await checkReadLaterExists(sourceType, sourceId);
      },

      setFilterMode: (mode: ReadLaterFilterMode) => {
        set({ filterMode: mode });
        get().loadItems();
      },

      setSelectedItem: (id: number | null) => {
        set({ selectedItemId: id });
      },
    }),
    {
      name: "read-later-store",
      partialize: (state) => ({
        filterMode: state.filterMode,
      }),
    },
  ),
);

export default useReadLaterStore;
