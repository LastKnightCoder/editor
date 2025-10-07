import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import {
  Shortcut,
  CreateShortcutPayload,
  UpdateShortcutPayload,
  FindShortcutParams,
} from "@/types";
import * as shortcutCommands from "@/commands/shortcut";

interface ShortcutState {
  items: Shortcut[];
  loaded: boolean;
}

interface ShortcutActions {
  loadShortcuts: () => Promise<void>;
  createShortcut: (payload: CreateShortcutPayload) => Promise<Shortcut>;
  updateShortcutTitle: (id: number, title: string) => Promise<Shortcut>;
  updateShortcut: (payload: UpdateShortcutPayload) => Promise<Shortcut>;
  deleteShortcut: (id: number) => Promise<void>;
  reorderShortcuts: (orderedIds: number[]) => Promise<void>;
  findShortcut: (params: FindShortcutParams) => Shortcut | undefined;
  getShortcutKey: (
    resourceType: string,
    scope: string,
    resourceId?: number,
    projectItemId?: number,
    documentItemId?: number,
  ) => string;
}

const useShortcutStore = create<ShortcutState & ShortcutActions>()(
  immer((set, get) => ({
    items: [],
    loaded: false,

    loadShortcuts: async () => {
      const shortcuts = await shortcutCommands.fetchShortcuts();
      set((state) => {
        state.items = shortcuts;
        state.loaded = true;
      });
    },

    createShortcut: async (payload: CreateShortcutPayload) => {
      const newShortcut = await shortcutCommands.createShortcut(payload);
      set((state) => {
        state.items.push(newShortcut);
      });
      return newShortcut;
    },

    updateShortcutTitle: async (id: number, title: string) => {
      const updated = await shortcutCommands.updateShortcut({ id, title });
      set((state) => {
        const index = state.items.findIndex((item) => item.id === id);
        if (index !== -1) {
          state.items[index] = updated;
        }
      });
      return updated;
    },

    updateShortcut: async (payload: UpdateShortcutPayload) => {
      const updated = await shortcutCommands.updateShortcut(payload);
      set((state) => {
        const index = state.items.findIndex((item) => item.id === payload.id);
        if (index !== -1) {
          state.items[index] = updated;
        }
      });
      return updated;
    },

    deleteShortcut: async (id: number) => {
      await shortcutCommands.deleteShortcut(id);
      set((state) => {
        state.items = state.items.filter((item) => item.id !== id);
      });
    },

    reorderShortcuts: async (orderedIds: number[]) => {
      await shortcutCommands.reorderShortcuts(orderedIds);
      await get().loadShortcuts();
    },

    findShortcut: (params: FindShortcutParams) => {
      const { items } = get();
      return items.find(
        (item) =>
          item.resourceType === params.resourceType &&
          item.scope === params.scope &&
          item.resourceId === params.resourceId &&
          item.projectItemId === params.projectItemId &&
          item.documentItemId === params.documentItemId,
      );
    },

    getShortcutKey: (
      resourceType: string,
      scope: string,
      resourceId?: number,
      projectItemId?: number,
      documentItemId?: number,
    ) => {
      return `${resourceType}-${scope}-${resourceId ?? "null"}-${projectItemId ?? "null"}-${documentItemId ?? "null"}`;
    },
  })),
);

export default useShortcutStore;
