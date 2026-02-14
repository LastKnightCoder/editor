import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import {
  createHistorySnapshot,
  pushHistorySnapshot,
  readHistorySnapshot,
  replaceHistorySnapshot,
  restoreEntriesFromSnapshot,
  type NavigationHistorySnapshot,
} from "./historyAdapter";
import {
  getPageDefinition,
  isOverlayPageKey,
  isScreenPageKey,
  ROOT_SCREEN_KEY,
} from "./pageRegistry";
import type { SettingModule } from "../features/settings/components/types";
import type {
  BackSource,
  DismissOverlaysOption,
  NavigationState,
  NavigationStore,
  OverlayPageKey,
  PageKey,
  PageParamsMap,
  ScreenPageKey,
  SettingModuleKey,
  StackEntry,
} from "./types";
import { isSettingModuleKey } from "./types";

export const DOUBLE_BACK_EXIT_MS = 2000;
const EXIT_HINT_TEXT = "再按一次退出应用";

function createEntry<K extends PageKey>(
  key: K,
  params: PageParamsMap[K],
): StackEntry<K> {
  return {
    id: `${key}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    key,
    params,
    createdAt: Date.now(),
  };
}

function getDefaultParams<K extends PageKey>(key: K): PageParamsMap[K] {
  return getPageDefinition(key).defaultParams as PageParamsMap[K];
}

function ensureRootScreen(
  screenStack: StackEntry<ScreenPageKey>[],
): StackEntry<ScreenPageKey>[] {
  if (screenStack.length === 0) {
    return [createEntry(ROOT_SCREEN_KEY, {})];
  }
  if (screenStack[0].key === ROOT_SCREEN_KEY) {
    return screenStack;
  }
  return [createEntry(ROOT_SCREEN_KEY, {}), ...screenStack];
}

function applyStackStrategy<K extends PageKey>(
  stack: StackEntry<K>[],
  key: K,
  params: PageParamsMap[K],
  enterMode: "push" | "replace" | "bringToTop",
  reuse: "single" | "multi",
): StackEntry<K>[] {
  const nextEntry = createEntry(key, params);
  const existingIndex = stack.findIndex((item) => item.key === key);
  const topIndex = stack.length - 1;

  if (enterMode === "replace") {
    if (stack.length === 0) {
      return [nextEntry];
    }
    if (stack[topIndex]?.key === key) {
      const replaced = [...stack];
      replaced[topIndex] = nextEntry;
      return replaced;
    }
    if (reuse === "single" && existingIndex >= 0) {
      const compacted = [...stack];
      compacted.splice(existingIndex, 1);
      compacted.push(nextEntry);
      return compacted;
    }
    const replaced = [...stack];
    replaced[topIndex] = nextEntry;
    return replaced;
  }

  if (enterMode === "bringToTop") {
    if (existingIndex < 0) {
      return [...stack, nextEntry];
    }
    if (existingIndex === topIndex) {
      return stack;
    }
    const moved = [...stack];
    const [found] = moved.splice(existingIndex, 1);
    moved.push(found);
    return moved;
  }

  if (reuse === "single" && existingIndex >= 0) {
    if (existingIndex === topIndex) {
      return stack;
    }
    const moved = [...stack];
    const [found] = moved.splice(existingIndex, 1);
    moved.push(found);
    return moved;
  }
  return [...stack, nextEntry];
}

function removeLastOverlayByKey(
  stack: StackEntry<OverlayPageKey>[],
  key: OverlayPageKey,
): StackEntry<OverlayPageKey>[] {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    if (stack[index].key === key) {
      return [...stack.slice(0, index), ...stack.slice(index + 1)];
    }
  }
  return stack;
}

function dismissOverlaysForNavigate(
  stack: StackEntry<OverlayPageKey>[],
  dismissOverlays: DismissOverlaysOption,
): StackEntry<OverlayPageKey>[] {
  if (dismissOverlays === "none") {
    return stack;
  }
  if (dismissOverlays === "all") {
    return [];
  }
  if (!Array.isArray(dismissOverlays) || dismissOverlays.length === 0) {
    return stack;
  }
  const dismissed = new Set<OverlayPageKey>(dismissOverlays);
  return stack.filter((entry) => !dismissed.has(entry.key));
}

function hasSettingsScreen(screenStack: StackEntry<ScreenPageKey>[]): boolean {
  return screenStack.some((entry) => entry.key === "screen.settings");
}

function createInitialState(): NavigationState {
  return {
    screenStack: [createEntry(ROOT_SCREEN_KEY, {})],
    overlayStack: [],
    settingsModuleStack: [],
    lastBackTs: 0,
    toast: null,
    historySyncToken: 0,
    isHistoryInitialized: false,
  };
}

type ExitApplicationFn = () => Promise<void>;

async function defaultExitApplication(): Promise<void> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("request_exit");
    return;
  } catch (error) {
    console.error("[navigation] request_exit failed", error);
  }

  let getCurrentWindow:
    | (() => {
        destroy: () => Promise<void>;
        close: () => Promise<void>;
      })
    | null = null;

  try {
    ({ getCurrentWindow } = await import("@tauri-apps/api/window"));
    await getCurrentWindow().destroy();
    return;
  } catch (error) {
    console.error("[navigation] destroy window failed", error);
  }

  try {
    if (!getCurrentWindow) {
      ({ getCurrentWindow } = await import("@tauri-apps/api/window"));
    }
    await getCurrentWindow().close();
  } catch (error) {
    console.error("[navigation] close window failed", error);
  }
}

let exitApplicationImpl: ExitApplicationFn = defaultExitApplication;

export function __setExitApplicationForTest(fn?: ExitApplicationFn): void {
  exitApplicationImpl = fn ?? defaultExitApplication;
}

export function canGoBackInNavigationState(state: NavigationState): boolean {
  const topScreen = state.screenStack[state.screenStack.length - 1];
  const settingsCanBack =
    topScreen?.key === "screen.settings" &&
    state.settingsModuleStack.length > 0;
  return (
    settingsCanBack ||
    state.overlayStack.length > 0 ||
    state.screenStack.length > 1
  );
}

function isSnapshotChanged(
  before: NavigationHistorySnapshot,
  after: NavigationHistorySnapshot,
): boolean {
  return JSON.stringify(before) !== JSON.stringify(after);
}

export const useNavigationStore = create<NavigationStore>()(
  subscribeWithSelector((set, get) => ({
    ...createInitialState(),

    initializeHistory: () => {
      if (typeof window === "undefined") return;
      const current = get();
      if (current.isHistoryInitialized) return;

      const restored = readHistorySnapshot(window.history.state);
      if (restored) {
        const entries = restoreEntriesFromSnapshot(restored);
        set({
          ...entries,
          lastBackTs: 0,
          toast: null,
          historySyncToken: current.historySyncToken + 1,
          isHistoryInitialized: true,
        });
        return;
      }

      const snapshot = createHistorySnapshot(current);
      replaceHistorySnapshot(snapshot);
      set({
        isHistoryInitialized: true,
        historySyncToken: current.historySyncToken + 1,
      });
    },

    syncFromPopState: (rawState) => {
      const snapshot = readHistorySnapshot(rawState);
      if (!snapshot) return;
      const current = get();
      const entries = restoreEntriesFromSnapshot(snapshot);
      const before = createHistorySnapshot(current);
      const after = createHistorySnapshot({
        ...current,
        ...entries,
      });
      if (!isSnapshotChanged(before, after)) {
        return;
      }
      set({
        ...entries,
        lastBackTs: 0,
        toast: null,
        historySyncToken: current.historySyncToken + 1,
        isHistoryInitialized: true,
      });
    },

    navigate: (key, params, options) => {
      if (!isScreenPageKey(key)) return;
      const definition = getPageDefinition(key);
      const resolvedParams = (params ??
        getDefaultParams(key)) as PageParamsMap[typeof key];
      const dismissOverlays = options?.dismissOverlays ?? "none";
      const current = get();
      const nextScreenStack = applyStackStrategy(
        current.screenStack,
        key,
        resolvedParams,
        definition.enterMode,
        definition.reuse,
      );
      const normalizedScreenStack = ensureRootScreen(nextScreenStack);
      const nextSettingsModuleStack = hasSettingsScreen(normalizedScreenStack)
        ? current.settingsModuleStack
        : [];
      const nextOverlayStack = dismissOverlaysForNavigate(
        current.overlayStack,
        dismissOverlays,
      );
      const before = createHistorySnapshot(current);
      const after = createHistorySnapshot({
        ...current,
        screenStack: normalizedScreenStack,
        overlayStack: nextOverlayStack,
        settingsModuleStack: nextSettingsModuleStack,
      });
      if (!isSnapshotChanged(before, after)) {
        return;
      }

      set({
        screenStack: normalizedScreenStack,
        overlayStack: nextOverlayStack,
        settingsModuleStack: nextSettingsModuleStack,
        historySyncToken: current.historySyncToken + 1,
      });
      pushHistorySnapshot(after);
    },

    replaceTop: (key, params) => {
      if (!isScreenPageKey(key)) return;
      const current = get();
      const resolvedParams = (params ??
        getDefaultParams(key)) as PageParamsMap[typeof key];
      const replacement = createEntry(key, resolvedParams);
      const base =
        current.screenStack.length > 0
          ? [...current.screenStack]
          : [createEntry(ROOT_SCREEN_KEY, {})];
      base[base.length - 1] = replacement;
      const normalized = ensureRootScreen(base);
      const nextSettingsModuleStack = hasSettingsScreen(normalized)
        ? current.settingsModuleStack
        : [];
      const before = createHistorySnapshot(current);
      const after = createHistorySnapshot({
        ...current,
        screenStack: normalized,
        settingsModuleStack: nextSettingsModuleStack,
      });
      if (!isSnapshotChanged(before, after)) {
        return;
      }

      set({
        screenStack: normalized,
        settingsModuleStack: nextSettingsModuleStack,
        historySyncToken: current.historySyncToken + 1,
      });
      pushHistorySnapshot(after);
    },

    bringToTop: (key) => {
      if (!isScreenPageKey(key)) return;
      const definition = getPageDefinition(key);
      const current = get();
      const nextScreenStack = applyStackStrategy(
        current.screenStack,
        key,
        getDefaultParams(key),
        "bringToTop",
        definition.reuse,
      );
      const normalized = ensureRootScreen(nextScreenStack);
      const before = createHistorySnapshot(current);
      const after = createHistorySnapshot({
        ...current,
        screenStack: normalized,
      });
      if (!isSnapshotChanged(before, after)) {
        return;
      }
      set({
        screenStack: normalized,
        historySyncToken: current.historySyncToken + 1,
      });
      pushHistorySnapshot(after);
    },

    openOverlay: (key, params) => {
      if (!isOverlayPageKey(key)) return;
      const definition = getPageDefinition(key);
      const resolvedParams = (params ??
        getDefaultParams(key)) as PageParamsMap[typeof key];
      const current = get();
      const nextOverlayStack = applyStackStrategy(
        current.overlayStack,
        key,
        resolvedParams,
        definition.enterMode,
        definition.reuse,
      );
      const before = createHistorySnapshot(current);
      const after = createHistorySnapshot({
        ...current,
        overlayStack: nextOverlayStack,
      });
      if (!isSnapshotChanged(before, after)) {
        return;
      }
      set({
        overlayStack: nextOverlayStack,
        historySyncToken: current.historySyncToken + 1,
      });
      pushHistorySnapshot(after);
    },

    replaceOverlayParams: (key, patch) => {
      if (!isOverlayPageKey(key)) return;
      const current = get();
      const targetIndex = [...current.overlayStack]
        .reverse()
        .findIndex((entry) => entry.key === key);
      if (targetIndex < 0) {
        return;
      }
      const actualIndex = current.overlayStack.length - 1 - targetIndex;
      const target = current.overlayStack[actualIndex];
      const nextParams = {
        ...target.params,
        ...patch,
      } as PageParamsMap[typeof key];

      if (JSON.stringify(target.params) === JSON.stringify(nextParams)) {
        return;
      }

      const nextOverlayStack = [...current.overlayStack];
      nextOverlayStack[actualIndex] = {
        ...target,
        params: nextParams,
      };

      const before = createHistorySnapshot(current);
      const after = createHistorySnapshot({
        ...current,
        overlayStack: nextOverlayStack,
      });
      if (!isSnapshotChanged(before, after)) {
        return;
      }
      set({
        overlayStack: nextOverlayStack,
        historySyncToken: current.historySyncToken + 1,
      });
      replaceHistorySnapshot(after);
    },

    closeOverlay: (key) => {
      const current = get();
      const nextOverlayStack =
        key && isOverlayPageKey(key)
          ? removeLastOverlayByKey(current.overlayStack, key)
          : current.overlayStack.slice(0, -1);
      const before = createHistorySnapshot(current);
      const after = createHistorySnapshot({
        ...current,
        overlayStack: nextOverlayStack,
      });
      if (!isSnapshotChanged(before, after)) {
        return;
      }
      set({
        overlayStack: nextOverlayStack,
        historySyncToken: current.historySyncToken + 1,
      });
      pushHistorySnapshot(after);
    },

    dispatchBack: (source: BackSource) => {
      if (source === "popstate") {
        return;
      }
      const current = get();
      if (canGoBackInNavigationState(current)) {
        if (typeof window !== "undefined") {
          window.history.back();
          return;
        }

        // 极端兜底：无法使用 history API 时仍按统一优先级回退。
        if (current.overlayStack.length > 0) {
          set({
            overlayStack: current.overlayStack.slice(0, -1),
            historySyncToken: current.historySyncToken + 1,
          });
          return;
        }

        const topScreen = current.screenStack[current.screenStack.length - 1];
        if (
          topScreen?.key === "screen.settings" &&
          current.settingsModuleStack.length > 0
        ) {
          set({
            settingsModuleStack: current.settingsModuleStack.slice(0, -1),
            historySyncToken: current.historySyncToken + 1,
          });
          return;
        }

        if (current.screenStack.length > 1) {
          const nextScreenStack = ensureRootScreen(
            current.screenStack.slice(0, -1),
          );
          set({
            screenStack: nextScreenStack,
            historySyncToken: current.historySyncToken + 1,
          });
        }
        return;
      }

      const now = Date.now();
      if (now - current.lastBackTs <= DOUBLE_BACK_EXIT_MS) {
        set({
          lastBackTs: now,
          toast: null,
          historySyncToken: current.historySyncToken + 1,
        });
        void exitApplicationImpl();
        return;
      }

      set({
        lastBackTs: now,
        toast: { type: "info", text: EXIT_HINT_TEXT },
        historySyncToken: current.historySyncToken + 1,
      });
    },

    setSettingsModule: (module) => {
      const current = get();
      const nextModules =
        module && isSettingModuleKey(module)
          ? [module]
          : ([] as SettingModuleKey[]);
      const before = createHistorySnapshot(current);
      const after = createHistorySnapshot({
        ...current,
        settingsModuleStack: nextModules,
      });
      if (!isSnapshotChanged(before, after)) {
        return;
      }
      set({
        settingsModuleStack: nextModules,
        historySyncToken: current.historySyncToken + 1,
      });
      pushHistorySnapshot(after);
    },

    pushSettingsModule: (module) => {
      if (!isSettingModuleKey(module)) return;
      const current = get();
      const top =
        current.settingsModuleStack[current.settingsModuleStack.length - 1];
      if (top === module) return;
      const nextModules = [...current.settingsModuleStack, module];
      const before = createHistorySnapshot(current);
      const after = createHistorySnapshot({
        ...current,
        settingsModuleStack: nextModules,
      });
      if (!isSnapshotChanged(before, after)) {
        return;
      }
      set({
        settingsModuleStack: nextModules,
        historySyncToken: current.historySyncToken + 1,
      });
      pushHistorySnapshot(after);
    },

    popSettingsModule: () => {
      const current = get();
      if (current.settingsModuleStack.length === 0) return;
      const nextModules = current.settingsModuleStack.slice(0, -1);
      const before = createHistorySnapshot(current);
      const after = createHistorySnapshot({
        ...current,
        settingsModuleStack: nextModules,
      });
      if (!isSnapshotChanged(before, after)) {
        return;
      }
      set({
        settingsModuleStack: nextModules,
        historySyncToken: current.historySyncToken + 1,
      });
      pushHistorySnapshot(after);
    },

    clearToast: () => {
      const current = get();
      if (!current.toast) return;
      set({
        toast: null,
        historySyncToken: current.historySyncToken + 1,
      });
    },

    resetNavigation: () => {
      const current = get();
      const next = createInitialState();
      set({
        ...next,
        historySyncToken: current.historySyncToken + 1,
      });
      const snapshot = createHistorySnapshot(next);
      replaceHistorySnapshot(snapshot);
    },
  })),
);

export function getActiveScreenEntry(
  state: NavigationState,
): StackEntry<ScreenPageKey> {
  return (
    state.screenStack[state.screenStack.length - 1] ??
    createEntry(ROOT_SCREEN_KEY, {})
  );
}

export function getTopOverlayEntry(
  state: NavigationState,
): StackEntry<OverlayPageKey> | null {
  return state.overlayStack.length > 0
    ? state.overlayStack[state.overlayStack.length - 1]
    : null;
}

export function getTopSettingsModule(
  state: NavigationState,
): SettingModule | null {
  if (state.settingsModuleStack.length === 0) return null;
  return state.settingsModuleStack[state.settingsModuleStack.length - 1];
}
