import type { SettingModule } from "../features/settings/components/types";
import type { NavigationState, OverlayPageKey, ScreenPageKey } from "./types";
import {
  getActiveScreenEntry,
  getTopOverlayEntry,
  getTopSettingsModule,
  useNavigationStore,
} from "./store";

export function useNavigationActions() {
  const initializeHistory = useNavigationStore(
    (state) => state.initializeHistory,
  );
  const syncFromPopState = useNavigationStore(
    (state) => state.syncFromPopState,
  );
  const navigate = useNavigationStore((state) => state.navigate);
  const replaceTop = useNavigationStore((state) => state.replaceTop);
  const bringToTop = useNavigationStore((state) => state.bringToTop);
  const openOverlay = useNavigationStore((state) => state.openOverlay);
  const closeOverlay = useNavigationStore((state) => state.closeOverlay);
  const dispatchBack = useNavigationStore((state) => state.dispatchBack);
  const setSettingsModule = useNavigationStore(
    (state) => state.setSettingsModule,
  );
  const pushSettingsModule = useNavigationStore(
    (state) => state.pushSettingsModule,
  );
  const popSettingsModule = useNavigationStore(
    (state) => state.popSettingsModule,
  );
  const clearToast = useNavigationStore((state) => state.clearToast);
  const resetNavigation = useNavigationStore((state) => state.resetNavigation);

  return {
    initializeHistory,
    syncFromPopState,
    navigate,
    replaceTop,
    bringToTop,
    openOverlay,
    closeOverlay,
    dispatchBack,
    setSettingsModule,
    pushSettingsModule,
    popSettingsModule,
    clearToast,
    resetNavigation,
  };
}

export function useActiveScreenKey(): ScreenPageKey {
  return useNavigationStore((state) => getActiveScreenEntry(state).key);
}

export function useOverlayOpen(key: OverlayPageKey): boolean {
  return useNavigationStore((state) =>
    state.overlayStack.some((entry) => entry.key === key),
  );
}

export function useTopOverlayKey(): OverlayPageKey | null {
  return useNavigationStore((state) => getTopOverlayEntry(state)?.key ?? null);
}

export function useTopOverlayParams() {
  return useNavigationStore(
    (state) => getTopOverlayEntry(state)?.params ?? null,
  );
}

export function useTopSettingsModule(): SettingModule | null {
  return useNavigationStore((state) => getTopSettingsModule(state));
}

export function useNavigationToast() {
  return useNavigationStore((state) => state.toast);
}

export function useNavigationCanGoBack(): boolean {
  return useNavigationStore((state) => {
    const topScreen = getActiveScreenEntry(state);
    const settingsCanBack =
      topScreen.key === "screen.settings" &&
      state.settingsModuleStack.length > 0;
    return (
      settingsCanBack ||
      state.overlayStack.length > 0 ||
      state.screenStack.length > 1
    );
  });
}

export function useNavigationStateSnapshot(): Pick<
  NavigationState,
  "screenStack" | "overlayStack" | "settingsModuleStack"
> {
  return useNavigationStore((state) => ({
    screenStack: state.screenStack,
    overlayStack: state.overlayStack,
    settingsModuleStack: state.settingsModuleStack,
  }));
}
