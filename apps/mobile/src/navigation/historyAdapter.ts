import {
  isOverlayPageKey,
  isPageKey,
  isScreenPageKey,
  ROOT_SCREEN_KEY,
} from "./pageRegistry";
import type {
  NavigationState,
  OverlayPageKey,
  PageParamsMap,
  ScreenPageKey,
  SettingModuleKey,
  StackEntry,
} from "./types";
import { isSettingModuleKey } from "./types";

const HISTORY_MARK = "__tau_mobile_navigation__";
const HISTORY_VERSION = 1;

type HistoryItem<K extends string, P extends object> = {
  key: K;
  params: P;
};

export type NavigationHistorySnapshot = {
  screenStack: HistoryItem<ScreenPageKey, PageParamsMap[ScreenPageKey]>[];
  overlayStack: HistoryItem<OverlayPageKey, PageParamsMap[OverlayPageKey]>[];
  settingsModuleStack: SettingModuleKey[];
};

type NavigationHistoryState = {
  mark: typeof HISTORY_MARK;
  version: typeof HISTORY_VERSION;
  snapshot: NavigationHistorySnapshot;
};

type MinimalNavigationState = Pick<
  NavigationState,
  "screenStack" | "overlayStack" | "settingsModuleStack"
>;

function cloneParams<T extends object>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createStackEntry<K extends ScreenPageKey | OverlayPageKey>(
  key: K,
  params: PageParamsMap[K],
): StackEntry<K> {
  return {
    id: `${key}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    key,
    params,
    createdAt: Date.now(),
  };
}

function normalizeSnapshot(
  rawSnapshot: NavigationHistorySnapshot,
): NavigationHistorySnapshot {
  const screenStack = rawSnapshot.screenStack.filter((item) => {
    if (!isScreenPageKey(item.key)) return false;
    if (!isPageKey(item.key)) return false;
    return item.params && typeof item.params === "object";
  });
  const overlayStack = rawSnapshot.overlayStack.filter((item) => {
    if (!isOverlayPageKey(item.key)) return false;
    if (!isPageKey(item.key)) return false;
    return item.params && typeof item.params === "object";
  });
  const settingsModuleStack = rawSnapshot.settingsModuleStack.filter((value) =>
    isSettingModuleKey(value),
  );

  const ensuredScreens =
    screenStack.length > 0
      ? screenStack
      : [
          {
            key: ROOT_SCREEN_KEY,
            params: {},
          },
        ];
  if (ensuredScreens[0].key !== ROOT_SCREEN_KEY) {
    ensuredScreens.unshift({
      key: ROOT_SCREEN_KEY,
      params: {},
    });
  }

  return {
    screenStack: ensuredScreens,
    overlayStack,
    settingsModuleStack,
  };
}

export function createHistorySnapshot(
  state: MinimalNavigationState,
): NavigationHistorySnapshot {
  return {
    screenStack: state.screenStack.map((entry) => ({
      key: entry.key,
      params: cloneParams(entry.params),
    })),
    overlayStack: state.overlayStack.map((entry) => ({
      key: entry.key,
      params: cloneParams(entry.params),
    })),
    settingsModuleStack: [...state.settingsModuleStack],
  };
}

function toHistoryState(
  snapshot: NavigationHistorySnapshot,
): NavigationHistoryState {
  return {
    mark: HISTORY_MARK,
    version: HISTORY_VERSION,
    snapshot,
  };
}

export function readHistorySnapshot(
  rawState: unknown,
): NavigationHistorySnapshot | null {
  if (!rawState || typeof rawState !== "object") return null;
  const state = rawState as Partial<NavigationHistoryState>;
  if (state.mark !== HISTORY_MARK || state.version !== HISTORY_VERSION) {
    return null;
  }
  if (!state.snapshot || typeof state.snapshot !== "object") {
    return null;
  }
  const snapshot = state.snapshot as NavigationHistorySnapshot;
  if (
    !Array.isArray(snapshot.screenStack) ||
    !Array.isArray(snapshot.overlayStack) ||
    !Array.isArray(snapshot.settingsModuleStack)
  ) {
    return null;
  }
  return normalizeSnapshot(snapshot);
}

export function pushHistorySnapshot(snapshot: NavigationHistorySnapshot): void {
  if (typeof window === "undefined") return;
  window.history.pushState(toHistoryState(snapshot), "");
}

export function replaceHistorySnapshot(
  snapshot: NavigationHistorySnapshot,
): void {
  if (typeof window === "undefined") return;
  window.history.replaceState(toHistoryState(snapshot), "");
}

export function restoreEntriesFromSnapshot(
  snapshot: NavigationHistorySnapshot,
): MinimalNavigationState {
  const normalized = normalizeSnapshot(snapshot);
  const screenStack = normalized.screenStack.map((entry) =>
    createStackEntry(entry.key, entry.params),
  );
  const overlayStack = normalized.overlayStack.map((entry) =>
    createStackEntry(entry.key, entry.params),
  );

  const hasSettingsScreen = screenStack.some(
    (entry) => entry.key === "screen.settings",
  );
  return {
    screenStack,
    overlayStack,
    settingsModuleStack: hasSettingsScreen
      ? normalized.settingsModuleStack
      : [],
  };
}
