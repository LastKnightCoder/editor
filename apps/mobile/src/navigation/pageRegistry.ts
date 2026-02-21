import type {
  OverlayPageKey,
  PageDefinition,
  PageKey,
  ScreenPageKey,
} from "./types";

export const ROOT_SCREEN_KEY: ScreenPageKey = "main.home";

export const PAGE_REGISTRY: Record<PageKey, PageDefinition> = {
  "main.home": {
    key: "main.home",
    layer: "screen",
    reuse: "single",
    enterMode: "push",
    backPolicy: "default",
    defaultParams: {},
    transition: {
      preset: "none",
      enterMs: 0,
      exitMs: 0,
    },
  },
  "screen.search": {
    key: "screen.search",
    layer: "screen",
    reuse: "single",
    enterMode: "bringToTop",
    backPolicy: "default",
    defaultParams: {},
    transition: {
      preset: "sheetUp",
      enterMs: 300,
      exitMs: 250,
    },
  },
  "screen.settings": {
    key: "screen.settings",
    layer: "screen",
    reuse: "single",
    enterMode: "bringToTop",
    backPolicy: "default",
    defaultParams: {},
    transition: {
      preset: "slideRight",
      enterMs: 300,
      exitMs: 250,
    },
  },
  "screen.about": {
    key: "screen.about",
    layer: "screen",
    reuse: "single",
    enterMode: "bringToTop",
    backPolicy: "default",
    defaultParams: {},
    transition: {
      preset: "slideRight",
      enterMs: 300,
      exitMs: 250,
    },
  },
  "screen.todo": {
    key: "screen.todo",
    layer: "screen",
    reuse: "single",
    enterMode: "bringToTop",
    backPolicy: "default",
    defaultParams: {},
    transition: {
      preset: "slideRight",
      enterMs: 300,
      exitMs: 250,
    },
  },
  "screen.todoDetail": {
    key: "screen.todoDetail",
    layer: "screen",
    reuse: "multi",
    enterMode: "push",
    backPolicy: "default",
    defaultParams: {
      todoId: -1,
      groupId: -1,
    },
    transition: {
      preset: "slideRight",
      enterMs: 300,
      exitMs: 250,
    },
  },
  "screen.contentDetail": {
    key: "screen.contentDetail",
    layer: "screen",
    reuse: "multi",
    enterMode: "push",
    backPolicy: "default",
    defaultParams: {
      contentId: -1,
      contentTitle: "",
      contentType: "",
      refId: -1,
      fromPreviewOverlay: false,
    },
    transition: {
      preset: "slideRight",
      enterMs: 300,
      exitMs: 250,
    },
  },
  "overlay.sidebar": {
    key: "overlay.sidebar",
    layer: "overlay",
    reuse: "single",
    enterMode: "push",
    backPolicy: "consume",
    defaultParams: {},
  },
  "overlay.cardPreview": {
    key: "overlay.cardPreview",
    layer: "overlay",
    reuse: "single",
    enterMode: "replace",
    backPolicy: "consume",
    defaultParams: { cardId: -1, ui: { scrollTop: 0, panelState: "normal" } },
  },
  "overlay.quickCapture": {
    key: "overlay.quickCapture",
    layer: "overlay",
    reuse: "single",
    enterMode: "replace",
    backPolicy: "consume",
    defaultParams: {},
  },
};

const PAGE_KEY_SET = new Set<PageKey>(Object.keys(PAGE_REGISTRY) as PageKey[]);
const SCREEN_KEY_SET = new Set<ScreenPageKey>(
  (Object.keys(PAGE_REGISTRY) as PageKey[]).filter(
    (key): key is ScreenPageKey => PAGE_REGISTRY[key].layer === "screen",
  ),
);
const OVERLAY_KEY_SET = new Set<OverlayPageKey>(
  (Object.keys(PAGE_REGISTRY) as PageKey[]).filter(
    (key): key is OverlayPageKey => PAGE_REGISTRY[key].layer === "overlay",
  ),
);

export function getPageDefinition<K extends PageKey>(
  key: K,
): PageDefinition<K> {
  return PAGE_REGISTRY[key] as PageDefinition<K>;
}

export function isPageKey(value: unknown): value is PageKey {
  return typeof value === "string" && PAGE_KEY_SET.has(value as PageKey);
}

export function isScreenPageKey(value: unknown): value is ScreenPageKey {
  return (
    typeof value === "string" && SCREEN_KEY_SET.has(value as ScreenPageKey)
  );
}

export function isOverlayPageKey(value: unknown): value is OverlayPageKey {
  return (
    typeof value === "string" && OVERLAY_KEY_SET.has(value as OverlayPageKey)
  );
}
