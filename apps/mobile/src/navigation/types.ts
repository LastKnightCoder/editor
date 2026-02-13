import type { SettingModule } from "../features/settings/components/types";

export type BackSource = "android" | "popstate" | "ui";

export type PageLayer = "screen" | "overlay";
export type ReusePolicy = "single" | "multi";
export type EnterMode = "push" | "replace" | "bringToTop";
export type BackPolicy = "default" | "consume";
export type ScreenTransitionPreset = "none" | "sheetUp" | "slideRight";
export type PageTransitionConfig = {
  preset: ScreenTransitionPreset;
  enterMs: number;
  exitMs: number;
};

export type ScreenPageKey =
  | "main.home"
  | "screen.search"
  | "screen.settings"
  | "screen.about"
  | "screen.contentDetail";
export type OverlayPageKey =
  | "overlay.sidebar"
  | "overlay.cardPreview"
  | "overlay.quickCapture";
export type PageKey = ScreenPageKey | OverlayPageKey;

export type DismissOverlaysOption = "none" | "all" | OverlayPageKey[];

export type NavigateOptions = {
  dismissOverlays?: DismissOverlaysOption;
};

export type SettingModuleKey = Exclude<SettingModule, null>;

export const SETTING_MODULE_KEYS = [
  "theme",
  "about",
  "database",
  "sync-status-db",
  "sync-status-resource",
  "integration",
  "integration-github",
  "integration-s3",
  "integration-webdav",
  "integration-alioss",
  "resource",
  "resource-local",
  "resource-github",
  "resource-alioss",
  "resource-s3",
  "resource-webdav",
  "sync-webdav",
  "sync-alioss",
  "sync-github",
  "sync-s3",
] as const satisfies readonly SettingModuleKey[];

const SETTING_MODULE_KEY_SET = new Set<string>(SETTING_MODULE_KEYS);

export function isSettingModuleKey(value: unknown): value is SettingModuleKey {
  return typeof value === "string" && SETTING_MODULE_KEY_SET.has(value);
}

export type PageParamsMap = {
  "main.home": Record<string, never>;
  "screen.search": Record<string, never>;
  "screen.settings": Record<string, never>;
  "screen.about": Record<string, never>;
  "screen.contentDetail": {
    contentId: number;
    contentTitle?: string;
    contentType?: string;
    refId?: number;
    fromPreviewOverlay?: boolean;
    previewCardId?: number;
    previewUiSnapshot?: {
      scrollTop?: number;
      panelState?: "normal" | "full";
    };
  };
  "overlay.sidebar": Record<string, never>;
  "overlay.cardPreview": {
    cardId: number;
    ui?: {
      scrollTop?: number;
      panelState?: "normal" | "full";
      fullscreen?: boolean;
    };
  };
  "overlay.quickCapture": Record<string, never>;
};

export type StackEntry<K extends PageKey = PageKey> = {
  id: string;
  key: K;
  params: PageParamsMap[K];
  createdAt: number;
};

export type PageLifecycleHooks = {
  onEnter?: () => void;
  onLeave?: () => void;
  onResume?: () => void;
  onPause?: () => void;
  onDestroy?: () => void;
};

export type PageDefinition<K extends PageKey = PageKey> = {
  key: K;
  layer: PageLayer;
  reuse: ReusePolicy;
  enterMode: EnterMode;
  backPolicy: BackPolicy;
  defaultParams: PageParamsMap[K];
  transition?: PageTransitionConfig;
  lifecycleHooks?: PageLifecycleHooks;
};

export type NavigationToast = {
  type: "info" | "error" | "success";
  text: string;
} | null;

export type NavigationState = {
  screenStack: StackEntry<ScreenPageKey>[];
  overlayStack: StackEntry<OverlayPageKey>[];
  settingsModuleStack: SettingModuleKey[];
  lastBackTs: number;
  toast: NavigationToast;
  historySyncToken: number;
  isHistoryInitialized: boolean;
};

export type NavigationActions = {
  initializeHistory: () => void;
  syncFromPopState: (rawState: unknown) => void;
  navigate: <K extends ScreenPageKey>(
    key: K,
    params?: PageParamsMap[K],
    options?: NavigateOptions,
  ) => void;
  replaceTop: <K extends ScreenPageKey>(
    key: K,
    params?: PageParamsMap[K],
  ) => void;
  bringToTop: <K extends ScreenPageKey>(key: K) => void;
  openOverlay: <K extends OverlayPageKey>(
    key: K,
    params?: PageParamsMap[K],
  ) => void;
  replaceOverlayParams: <K extends OverlayPageKey>(
    key: K,
    patch: Partial<PageParamsMap[K]>,
  ) => void;
  closeOverlay: (key?: OverlayPageKey) => void;
  dispatchBack: (source: BackSource) => void;
  setSettingsModule: (module: SettingModule | null) => void;
  pushSettingsModule: (module: SettingModuleKey) => void;
  popSettingsModule: () => void;
  clearToast: () => void;
  resetNavigation: () => void;
};

export type NavigationStore = NavigationState & NavigationActions;
