import { useEffect, useRef, useState } from "react";
import { onBackButtonPress } from "@tauri-apps/api/app";
import { useMemoizedFn } from "ahooks";
import { App as AntdApp } from "antd";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { EditorServicesProvider } from "@tau/editor/src";
import type { Descendant } from "slate";
import {
  BilibiliVideoDepsProvider,
  YoutubeVideoDepsProvider,
  NotionVideoDepsProvider,
  RemoteVideoDepsProvider,
  EditDatabaseDepsProvider,
  UseBilibiliVideoDeps,
  UseYoutubeVideoDeps,
  UseNotionVideoDeps,
  UseRemoteVideoDeps,
  UseEditDatabaseDeps,
  type DataTable,
  type DataTableView,
} from "@tau/shared";

import { createMobileEditorServices } from "../services/editorServices";
import { useBootstrap } from "../hooks/useBootstrap";
import { useCardsQuery } from "../hooks/useCardsQuery";
import { useResourceSync } from "../hooks/useResourceSync";
import { useSyncSettings } from "../hooks/useSyncSettings";
import { mapErrorToMessage, parseInvokeError } from "../services/errors";
import * as tauri from "../services/tauri";
import { CardsPage } from "../features/cards/CardsPage";
import { CardPreviewSheet } from "../features/cards/CardPreviewSheet";
import { ContentDetailPage } from "../features/cards/ContentDetailPage";
import { QuickCaptureSheet } from "../features/cards/QuickCaptureSheet";
import type { KnownCardCategory } from "../features/cards/cardCategory";
import {
  EMPTY_EDITOR_CONTENT,
  getContentLength,
  isEditorContentEmpty,
  normalizeEditorContent,
} from "../features/cards/editorContentUtils";
import {
  clearQuickCaptureDraft,
  hasQuickCaptureDraft,
} from "../features/cards/quickCaptureDraft";
import { subscribeContentUpdateAll } from "../features/cards/contentSyncBus";
import { SettingsPage } from "../features/settings/SettingsPage";
import type { SettingModule } from "../features/settings/components/types";
import { SearchPage } from "../features/search/SearchPage";
import { AboutPage } from "../features/about/AboutPage";
import { Header } from "../components/Header";
import { FloatingToolbar } from "../components/FloatingToolbar";
import { ToastViewport } from "../components/ToastViewport";
// import { KeyboardDebugPanel } from "../components/KeyboardDebugPanel";
import { KeyboardViewportProvider } from "../components/KeyboardViewportProvider";
import { toast } from "../components/toast";
import {
  useActiveScreenKey,
  useActiveScreenParams,
  useNavigationActions,
  useNavigationStateSnapshot,
  useNavigationToast,
  useTopOverlayKey,
  useTopOverlayParams,
  useTopSettingsModule,
} from "../navigation/hooks";
import { getPageDefinition } from "../navigation/pageRegistry";
import type { ScreenPageKey, StackEntry } from "../navigation/types";
import { ScreenStackHost } from "../navigation/ScreenStackHost";
import { useRootScrollLock } from "../navigation/useRootScrollLock";
import {
  extractPreviewOverlayUi,
  type PreviewOverlayUi,
} from "./previewOverlayUi";
import type { CardDetailResponse, CardsOverviewResponse } from "../types";

const EMPTY_VIEW_CONFIG = {
  columnOrder: [],
  rowOrder: [],
  sorts: [],
};

function buildUnsupportedMessage(scope: string): string {
  return `MOBILE_UNSUPPORTED: ${scope} - 移动端当前仅支持只读预览`;
}

const bilibiliDeps: UseBilibiliVideoDeps = {
  getCredentials: async () => ({ SESSDATA: "", enabled: true }),
  getPlayUrl: async () => {
    throw new Error(buildUnsupportedMessage("bilibili.getPlayUrl"));
  },
  checkStreamAvailability: async () => ({
    videoAvailable: false,
    audioAvailable: false,
  }),
  cacheVideo: async () => {
    throw new Error(buildUnsupportedMessage("bilibili.cacheVideo"));
  },
  getCacheStatus: async () => false,
  showError: (message) => {
    console.warn("[mobile-bilibili]", message);
  },
};

const youtubeDeps: UseYoutubeVideoDeps = {
  getProxy: async () => ({ enabled: false }),
  getCacheStatus: async () => null,
  cacheVideo: async () => {
    throw new Error(buildUnsupportedMessage("youtube.cacheVideo"));
  },
  convertFileSrc: (path) => path,
  showError: (message) => {
    console.warn("[mobile-youtube]", message);
  },
};

const notionDeps: UseNotionVideoDeps = {
  getToken: async () => ({ token: "", enabled: false }),
  getBlockInfo: async () => ({
    success: false,
    error: buildUnsupportedMessage("notion.getBlockInfo"),
  }),
  getCacheStatus: async () => null,
  cacheVideo: async () => {
    throw new Error(buildUnsupportedMessage("notion.cacheVideo"));
  },
  showError: (message) => {
    console.warn("[mobile-notion]", message);
  },
};

const remoteVideoDeps: UseRemoteVideoDeps = {
  cacheVideo: async ({ url }) => ({
    localUrl: url,
    fileSize: 0,
    cached: true,
  }),
  getCacheStatus: async () => null,
  showError: (message) => {
    console.warn("[mobile-remote-video]", message);
  },
  isRemoteUrl: () => false,
};

const editDatabaseDeps: UseEditDatabaseDeps = {
  getDataTableDetail: async (tableId) => {
    const table: DataTable = {
      id: tableId,
      createTime: 0,
      updateTime: 0,
      columns: [],
      rows: [],
      activeViewId: tableId * 1000 + 1,
    };
    const view: DataTableView = {
      id: tableId * 1000 + 1,
      tableId,
      name: "默认视图",
      type: "table",
      order: 0,
      config: EMPTY_VIEW_CONFIG,
      createTime: 0,
      updateTime: 0,
    };
    return { table, views: [view] };
  },
  updateDataTable: async (data) => ({
    id: data.id,
    createTime: 0,
    updateTime: Date.now(),
    columns: data.columns,
    rows: data.rows,
    activeViewId: data.activeViewId ?? null,
  }),
  updateDataTableView: async (view) => view,
  createDataTableView: async (view) => ({
    id: Date.now(),
    tableId: view.tableId,
    name: view.name,
    type: view.type,
    order: view.order,
    config: {
      ...EMPTY_VIEW_CONFIG,
      ...(view.config ?? {}),
    },
    createTime: Date.now(),
    updateTime: Date.now(),
  }),
  deleteDataTableView: async (viewId) => viewId,
  setActiveDataTableView: async () => true,
  reorderDataTableViews: async () => undefined,
};

const EMPTY_CARDS: CardsOverviewResponse = {
  total: 0,
  page: 1,
  pageSize: 20,
  query: "",
  category: "",
  searchMode: "none",
  items: [],
};

const services = createMobileEditorServices();
const SEARCH_SCREEN_TRANSITION = getPageDefinition("screen.search").transition;
const SETTINGS_SCREEN_TRANSITION =
  getPageDefinition("screen.settings").transition;
const ABOUT_SCREEN_TRANSITION = getPageDefinition("screen.about").transition;
const CONTENT_DETAIL_SCREEN_TRANSITION = getPageDefinition(
  "screen.contentDetail",
).transition;
const QUICK_CAPTURE_DEBOUNCE_MS = 600;

async function withTimeout<T>(
  task: Promise<T>,
  timeoutMs: number,
  timeoutCode: string,
  timeoutMessage: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      task,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${timeoutCode}:${timeoutMessage}`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function extractPreviewCardId(params: unknown): number | null {
  if (!params || typeof params !== "object") {
    return null;
  }
  const cardId = (params as { cardId?: unknown }).cardId;
  return typeof cardId === "number" ? cardId : null;
}

function extractContentDetailParams(params: unknown): {
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
} | null {
  if (!params || typeof params !== "object") {
    return null;
  }
  const contentId = (params as { contentId?: unknown }).contentId;
  if (typeof contentId !== "number" || !Number.isFinite(contentId)) {
    return null;
  }
  const contentTitle = (params as { contentTitle?: unknown }).contentTitle;
  const contentType = (params as { contentType?: unknown }).contentType;
  const refId = (params as { refId?: unknown }).refId;
  const fromPreviewOverlay = (params as { fromPreviewOverlay?: unknown })
    .fromPreviewOverlay;
  const previewCardId = (params as { previewCardId?: unknown }).previewCardId;
  const previewUiSnapshot = (
    params as {
      previewUiSnapshot?: {
        scrollTop?: unknown;
        panelState?: unknown;
      };
    }
  ).previewUiSnapshot;
  const normalizedPreviewUi:
    | { scrollTop?: number; panelState?: "normal" | "full" }
    | undefined =
    previewUiSnapshot && typeof previewUiSnapshot === "object"
      ? {
          scrollTop:
            typeof previewUiSnapshot.scrollTop === "number" &&
            Number.isFinite(previewUiSnapshot.scrollTop)
              ? previewUiSnapshot.scrollTop
              : undefined,
          panelState:
            previewUiSnapshot.panelState === "normal" ||
            previewUiSnapshot.panelState === "full"
              ? (previewUiSnapshot.panelState as "normal" | "full")
              : undefined,
        }
      : undefined;
  return {
    contentId,
    contentTitle:
      typeof contentTitle === "string" && contentTitle.trim()
        ? contentTitle
        : undefined,
    contentType:
      typeof contentType === "string" && contentType.trim()
        ? contentType
        : undefined,
    refId:
      typeof refId === "number" && Number.isFinite(refId) ? refId : undefined,
    fromPreviewOverlay: fromPreviewOverlay === true,
    previewCardId:
      typeof previewCardId === "number" && Number.isFinite(previewCardId)
        ? previewCardId
        : undefined,
    previewUiSnapshot:
      normalizedPreviewUi &&
      (typeof normalizedPreviewUi.scrollTop === "number" ||
        normalizedPreviewUi.panelState === "normal" ||
        normalizedPreviewUi.panelState === "full")
        ? normalizedPreviewUi
        : undefined,
  };
}

export default function AppShell() {
  const [previewPanelState, setPreviewPanelState] = useState<"normal" | "full">(
    "normal",
  );
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewCardId, setPreviewCardId] = useState<number | null>(null);
  const [previewCardDetail, setPreviewCardDetail] =
    useState<CardDetailResponse | null>(null);
  const [previewScrollTop, setPreviewScrollTop] = useState(0);
  const [quickCaptureSaving, setQuickCaptureSaving] = useState(false);
  const [quickCaptureCategory, setQuickCaptureCategory] =
    useState<KnownCardCategory>("temporary");
  const [isSearching, setIsSearching] = useState(false);

  const bootstrap = useBootstrap();
  const cards = useCardsQuery();
  const syncSettings = useSyncSettings();
  const resourceSync = useResourceSync();
  const previewRequestSeq = useRef(0);
  const searchRequestSeq = useRef(0);
  const quickCaptureContentRef = useRef<Descendant[]>(EMPTY_EDITOR_CONTENT);
  const quickCaptureCategoryRef = useRef<KnownCardCategory>("temporary");
  const quickCaptureCardIdRef = useRef<number | null>(null);
  const quickCaptureContentIdRef = useRef<number | null>(null);
  const quickCaptureDebounceTimerRef = useRef<number | null>(null);
  const quickCaptureFlushInFlightRef = useRef<Promise<boolean> | null>(null);
  const quickCaptureDirtyRef = useRef(false);
  const quickCaptureLastSavedSnapshotRef = useRef("");
  const homeRootRef = useRef<HTMLDivElement | null>(null);

  const activeScreenKey = useActiveScreenKey();
  const activeScreenParams = useActiveScreenParams();
  const topOverlayKey = useTopOverlayKey();
  const topOverlayParams = useTopOverlayParams();
  const activeSettingsModule = useTopSettingsModule();
  const navigationToast = useNavigationToast();
  const { screenStack } = useNavigationStateSnapshot();
  const activeScreenEntry = screenStack[screenStack.length - 1] ?? null;
  const activeScreenId = activeScreenEntry?.id ?? null;

  const {
    initializeHistory,
    syncFromPopState,
    navigate,
    openOverlay,
    replaceOverlayParams,
    dispatchBack,
    clearToast,
    pushSettingsModule,
    popSettingsModule,
  } = useNavigationActions();

  const previewOpen = topOverlayKey === "overlay.cardPreview";
  const quickCaptureOpen = topOverlayKey === "overlay.quickCapture";
  const previewCardIdFromNavigation = previewOpen
    ? extractPreviewCardId(topOverlayParams)
    : null;
  const previewUiFromNavigation: PreviewOverlayUi = previewOpen
    ? extractPreviewOverlayUi(topOverlayParams)
    : { scrollTop: 0, panelState: "normal" };
  const contentDetailParams =
    activeScreenKey === "screen.contentDetail"
      ? extractContentDetailParams(activeScreenParams)
      : null;
  const previousScreenKeyRef = useRef(activeScreenKey);
  const previousContentDetailParamsRef = useRef(contentDetailParams);
  const isContentDetailFromPreview =
    activeScreenKey === "screen.contentDetail" &&
    contentDetailParams?.fromPreviewOverlay === true;
  const shouldRenderPreviewSheet = previewOpen && !isContentDetailFromPreview;
  useRootScrollLock(activeScreenKey !== "main.home");

  useEffect(() => {
    const homeRoot = homeRootRef.current;
    if (!homeRoot) {
      return;
    }
    if (activeScreenKey === "main.home") {
      homeRoot.removeAttribute("inert");
      homeRoot.removeAttribute("aria-hidden");
      return;
    }
    homeRoot.setAttribute("inert", "");
    homeRoot.setAttribute("aria-hidden", "true");
  }, [activeScreenKey]);

  useEffect(() => {
    document.body.classList.add("mobile-app-shell");
    return () => {
      document.body.classList.remove("mobile-app-shell");
    };
  }, []);

  useEffect(() => {
    quickCaptureCategoryRef.current = quickCaptureCategory;
  }, [quickCaptureCategory]);

  const clearQuickCaptureDebounceTimer = useMemoizedFn(() => {
    if (quickCaptureDebounceTimerRef.current === null) {
      return;
    }
    if (typeof window !== "undefined") {
      window.clearTimeout(quickCaptureDebounceTimerRef.current);
    } else {
      clearTimeout(quickCaptureDebounceTimerRef.current);
    }
    quickCaptureDebounceTimerRef.current = null;
  });

  const resetQuickCaptureSession = useMemoizedFn(() => {
    clearQuickCaptureDebounceTimer();
    quickCaptureCardIdRef.current = null;
    quickCaptureContentIdRef.current = null;
    quickCaptureDirtyRef.current = false;
    quickCaptureLastSavedSnapshotRef.current = "";
    quickCaptureContentRef.current = EMPTY_EDITOR_CONTENT;
    quickCaptureCategoryRef.current = "temporary";
    setQuickCaptureCategory("temporary");
  });

  // 初始化主题
  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem("tau-mobile-theme");
      if (savedTheme === "dark") {
        document.documentElement.classList.add("dark");
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!hasQuickCaptureDraft()) {
      return;
    }
    toast.info("检测到未完成闪念草稿，可点击 + 继续编辑");
  }, []);

  useEffect(() => {
    if (!quickCaptureOpen) {
      return;
    }
    resetQuickCaptureSession();
  }, [quickCaptureOpen, resetQuickCaptureSession]);

  useEffect(() => {
    return () => {
      clearQuickCaptureDebounceTimer();
    };
  }, [clearQuickCaptureDebounceTimer]);

  useEffect(() => {
    initializeHistory();
  }, [initializeHistory]);

  useEffect(() => {
    if (!navigationToast) return;
    toast({
      type: navigationToast.type,
      text: navigationToast.text,
    });
    clearToast();
  }, [navigationToast, clearToast]);

  useEffect(() => {
    if (!previewOpen || previewCardIdFromNavigation !== null) return;
    previewRequestSeq.current += 1;
    setPreviewPanelState("normal");
    setPreviewScrollTop(0);
    setPreviewLoading(false);
    setPreviewCardId(null);
    setPreviewCardDetail(null);
  }, [previewOpen, previewCardIdFromNavigation]);

  useEffect(() => {
    if (!previewOpen) return;
    setPreviewPanelState(previewUiFromNavigation.panelState);
    setPreviewScrollTop(previewUiFromNavigation.scrollTop);
  }, [
    previewOpen,
    previewUiFromNavigation.panelState,
    previewUiFromNavigation.scrollTop,
  ]);

  useEffect(() => {
    if (!isContentDetailFromPreview) {
      return;
    }
    const snapshot = contentDetailParams?.previewUiSnapshot;
    if (!snapshot) {
      return;
    }
    if (snapshot.panelState === "normal" || snapshot.panelState === "full") {
      setPreviewPanelState(snapshot.panelState);
    }
    if (
      typeof snapshot.scrollTop === "number" &&
      Number.isFinite(snapshot.scrollTop)
    ) {
      setPreviewScrollTop(Math.max(0, snapshot.scrollTop));
    }
  }, [
    isContentDetailFromPreview,
    contentDetailParams?.previewUiSnapshot?.panelState,
    contentDetailParams?.previewUiSnapshot?.scrollTop,
  ]);

  useEffect(() => {
    return subscribeContentUpdateAll((payload) => {
      const normalizedContent = normalizeEditorContent(payload.content);
      const updateTime =
        typeof payload.updateTime === "number" &&
        Number.isFinite(payload.updateTime) &&
        payload.updateTime > 0
          ? payload.updateTime
          : Date.now();
      const count =
        typeof payload.count === "number" && Number.isFinite(payload.count)
          ? payload.count
          : getContentLength(normalizedContent);

      cards.patchCardsByContent({
        contentId: payload.contentId,
        content: normalizedContent,
        updateTime,
      });

      setPreviewCardDetail((prev) => {
        if (!prev || prev.contentId !== payload.contentId) {
          return prev;
        }
        return {
          ...prev,
          content: normalizedContent,
          count,
          updateTime: Math.max(prev.updateTime, updateTime),
        };
      });
    });
  }, [cards.patchCardsByContent]);

  const presentError = useMemoizedFn(
    (
      error: unknown,
      fallback: string,
      type: "error" | "info" | "success" = "error",
    ) => {
      const parsed = parseInvokeError(error);
      toast({
        type,
        text: mapErrorToMessage(parsed.code, parsed.message || fallback),
      });
    },
  );

  const refreshVersionsSafe = useMemoizedFn(async () => {
    try {
      await bootstrap.refreshVersions();
    } catch (error) {
      presentError(error, "同步配置尚未完成", "info");
    }
  });

  const refreshCardsSafe = useMemoizedFn(
    async (overrides?: {
      page?: number;
      pageSize?: number;
      query?: string;
      category?: string;
    }) => {
      try {
        return await cards.refreshCards(overrides);
      } catch (error) {
        presentError(error, "卡片读取失败");
        return cards.cards ?? EMPTY_CARDS;
      }
    },
  );

  // 初始化（仅执行一次）
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    (async () => {
      try {
        await bootstrap.initialize();
        await syncSettings.loadSetting();
        await cards.refreshCards({ page: 1 });
        try {
          await bootstrap.refreshVersions();
        } catch {
          // 同步未配置时版本检查会失败，忽略
        }
        try {
          await resourceSync.refreshResourceStatus();
        } catch {
          // 资源同步未配置时会失败，忽略
        }
      } catch (error) {
        presentError(error, "初始化失败");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      syncFromPopState(event.state);
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [syncFromPopState]);

  useEffect(() => {
    let active = true;
    let listener: { unregister: () => Promise<void> } | null = null;
    let removeCloseRequested: (() => void) | null = null;

    onBackButtonPress(() => {
      dispatchBack("android");
    })
      .then((registered) => {
        if (!active) {
          void registered.unregister();
          return;
        }
        listener = registered;
      })
      .catch((error) => {
        console.error(
          "[navigation] failed to register onBackButtonPress",
          error,
        );
      });

    import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) =>
        getCurrentWindow().onCloseRequested((event) => {
          event.preventDefault();
          dispatchBack("android");
        }),
      )
      .then((unlisten) => {
        if (!active) {
          unlisten();
          return;
        }
        removeCloseRequested = unlisten;
      })
      .catch((error) => {
        console.error(
          "[navigation] failed to register onCloseRequested",
          error,
        );
      });

    return () => {
      active = false;
      if (listener) {
        void listener.unregister();
      }
      if (removeCloseRequested) {
        removeCloseRequested();
      }
    };
  }, [dispatchBack]);

  const handleSwitchDatabase = useMemoizedFn(async (name: string) => {
    try {
      await tauri.setActiveDatabase(name);
      await syncSettings.loadSetting();
      await bootstrap.refreshDatabases();
      await refreshCardsSafe({ page: 1 });
      await refreshVersionsSafe();
      toast.success(`已切换到 ${name}`);
    } catch (error) {
      presentError(error, "切换数据库失败");
    }
  });

  const handleSaveSetting = useMemoizedFn(async () => {
    try {
      await syncSettings.persistSetting();
      await bootstrap.refreshDatabases();
      await refreshVersionsSafe();
      try {
        await resourceSync.refreshResourceStatus();
      } catch {
        // ignore
      }
      toast.success("设置保存成功");
    } catch (error) {
      presentError(error, "保存同步配置失败");
    }
  });

  const handleCheckVersions = useMemoizedFn(async () => {
    return await withTimeout(
      bootstrap.refreshVersions(),
      35000,
      "SYNC_CHECK_FAILED",
      "同步状态刷新超时，请检查网络、Endpoint 或 URL 风格",
    );
  });

  const handleSyncUpload = useMemoizedFn(async () => {
    const result = await syncSettings.runSyncAction("syncUploadDatabase");
    await syncSettings.loadSetting();
    await bootstrap.refreshDatabases();
    await refreshCardsSafe({ page: 1 });
    await refreshVersionsSafe();
    return result;
  });

  const handleSyncDownload = useMemoizedFn(async () => {
    const result = await syncSettings.runSyncAction("syncDownloadDatabase");
    await syncSettings.loadSetting();
    await bootstrap.refreshDatabases();
    await refreshCardsSafe({ page: 1 });
    await refreshVersionsSafe();
    return result;
  });

  const handleResourceSyncRefresh = useMemoizedFn(async () => {
    await resourceSync.refreshResourceStatus();
  });

  const handleResourceSyncStart = useMemoizedFn(async () => {
    const result = await resourceSync.startResourceSync();
    if (!result.ok) {
      throw new Error(
        `${result.code ?? "RESOURCE_SYNC_FAILED"}:${result.message}`,
      );
    }
    return result;
  });

  const handleResourceSyncRetryFailed = useMemoizedFn(async () => {
    const result = await resourceSync.retryFailedResourceSync();
    if (!result.ok) {
      throw new Error(
        `${result.code ?? "RESOURCE_SYNC_FAILED"}:${result.message}`,
      );
    }
    return result;
  });

  const handleResourceSyncCancel = useMemoizedFn(async () => {
    const result = await resourceSync.cancelResourceSync();
    if (!result.ok) {
      throw new Error(
        `${result.code ?? "RESOURCE_SYNC_FAILED"}:${result.message}`,
      );
    }
    return result;
  });

  const requestPreviewCardDetail = useMemoizedFn(async (cardId: number) => {
    const requestSeq = ++previewRequestSeq.current;
    setPreviewLoading(true);
    setPreviewCardId(cardId);
    setPreviewCardDetail(null);

    try {
      const detail = await tauri.getCardDetail(cardId);
      if (previewRequestSeq.current !== requestSeq) {
        return;
      }
      setPreviewCardDetail(detail);
    } catch (error) {
      if (previewRequestSeq.current !== requestSeq) {
        return;
      }
      presentError(error, "卡片预览加载失败");
      dispatchBack("ui");
      setPreviewCardId(null);
      setPreviewCardDetail(null);
    } finally {
      if (previewRequestSeq.current === requestSeq) {
        setPreviewLoading(false);
      }
    }
  });

  const handlePreviewPanelStateChange = useMemoizedFn(
    (nextState: "normal" | "full") => {
      setPreviewPanelState(nextState);
      if (!previewOpen || previewCardIdFromNavigation === null) {
        return;
      }
      replaceOverlayParams("overlay.cardPreview", {
        ui: {
          scrollTop: previewScrollTop,
          panelState: nextState,
        },
      });
    },
  );

  const handlePreviewCard = useMemoizedFn(async (cardId: number) => {
    openOverlay("overlay.cardPreview", {
      cardId,
      ui: {
        scrollTop: 0,
        panelState: "normal",
      },
    });
    setPreviewPanelState("normal");
    setPreviewScrollTop(0);
    await requestPreviewCardDetail(cardId);
  });

  const handlePreviewScrollTopChange = useMemoizedFn((scrollTop: number) => {
    const nextScrollTop = Math.max(0, scrollTop);
    setPreviewScrollTop(nextScrollTop);
    if (!previewOpen || previewCardIdFromNavigation === null) {
      return;
    }
    replaceOverlayParams("overlay.cardPreview", {
      ui: {
        scrollTop: nextScrollTop,
        panelState: previewPanelState,
      },
    });
  });

  const handleSearch = useMemoizedFn(async (query: string) => {
    const requestSeq = ++searchRequestSeq.current;
    setIsSearching(true);
    try {
      return await tauri.getCardsOverview({
        page: 1,
        pageSize: cards.queryState.pageSize || EMPTY_CARDS.pageSize,
        query,
        category: cards.queryState.category,
      });
    } catch (error) {
      presentError(error, "搜索失败");
      return EMPTY_CARDS;
    } finally {
      if (searchRequestSeq.current === requestSeq) {
        setIsSearching(false);
      }
    }
  });

  const handleUpdateCardCategory = useMemoizedFn(
    async (cardId: number, category: KnownCardCategory) => {
      try {
        await tauri.updateCardCategory({ id: cardId, category });
        if (
          previewCardId === cardId ||
          previewCardIdFromNavigation === cardId
        ) {
          void requestPreviewCardDetail(cardId);
        }
        await refreshCardsSafe({ page: 1 });
        toast.success("卡片类型已更新");
      } catch (error) {
        presentError(error, "更新卡片类型失败");
        throw error;
      }
    },
  );

  const handleDeleteCard = useMemoizedFn(async (cardId: number) => {
    try {
      const changed = await tauri.deleteCard(cardId);
      if (changed <= 0) {
        throw new Error("CARD_NOT_FOUND: card does not exist");
      }
      if (previewCardIdFromNavigation === cardId) {
        dispatchBack("ui");
      }
      if (previewCardId === cardId) {
        setPreviewCardId(null);
        setPreviewCardDetail(null);
      }
      await refreshCardsSafe({ page: 1 });
      toast.success("卡片已删除");
    } catch (error) {
      presentError(error, "删除卡片失败");
      throw error;
    }
  });

  const persistQuickCapture = useMemoizedFn(async (): Promise<boolean> => {
    const normalizedContent = normalizeEditorContent(
      quickCaptureContentRef.current,
    );
    quickCaptureContentRef.current = normalizedContent;
    if (isEditorContentEmpty(normalizedContent)) {
      return true;
    }

    const contentKey = JSON.stringify(normalizedContent);
    const category = quickCaptureCategoryRef.current;
    const nextSnapshot = JSON.stringify({
      contentKey,
      category,
    });
    if (nextSnapshot === quickCaptureLastSavedSnapshotRef.current) {
      clearQuickCaptureDraft();
      return true;
    }

    let lastSavedContentKey = "";
    let lastSavedCategory: KnownCardCategory | null = null;
    if (quickCaptureLastSavedSnapshotRef.current) {
      try {
        const parsed = JSON.parse(quickCaptureLastSavedSnapshotRef.current) as {
          contentKey?: string;
          category?: KnownCardCategory;
        };
        lastSavedContentKey = parsed.contentKey ?? "";
        lastSavedCategory = parsed.category ?? null;
      } catch {
        // ignore malformed snapshot
      }
    }

    setQuickCaptureSaving(true);
    try {
      let cardId = quickCaptureCardIdRef.current;
      let contentId = quickCaptureContentIdRef.current;
      if (cardId === null) {
        const created = await tauri.createTemporaryCard({
          content: normalizedContent,
          count: getContentLength(normalizedContent),
        });
        cardId = created.id;
        contentId = created.contentId;
        quickCaptureCardIdRef.current = cardId;
        quickCaptureContentIdRef.current = contentId;
        if (category !== "temporary") {
          await tauri.updateCardCategory({ id: cardId, category });
        }
      } else {
        if (lastSavedContentKey !== contentKey) {
          if (!contentId || contentId <= 0) {
            const detail = await tauri.getCardDetail(cardId);
            contentId = detail.contentId;
            quickCaptureContentIdRef.current = contentId;
          }
          await tauri.updateContent({
            contentId,
            content: normalizedContent,
            count: getContentLength(normalizedContent),
          });
        }
        if (lastSavedCategory !== category) {
          await tauri.updateCardCategory({ id: cardId, category });
        }
      }

      quickCaptureLastSavedSnapshotRef.current = nextSnapshot;
      clearQuickCaptureDraft();
      return true;
    } catch (error) {
      presentError(error, "闪念实时保存失败，请稍后重试");
      return false;
    } finally {
      setQuickCaptureSaving(false);
    }
  });

  const flushQuickCapturePersistQueue = useMemoizedFn(async () => {
    if (quickCaptureFlushInFlightRef.current) {
      return quickCaptureFlushInFlightRef.current;
    }
    const task = (async () => {
      let allSucceeded = true;
      do {
        quickCaptureDirtyRef.current = false;
        const success = await persistQuickCapture();
        if (!success) {
          allSucceeded = false;
        }
      } while (quickCaptureDirtyRef.current);
      return allSucceeded;
    })();
    quickCaptureFlushInFlightRef.current = task.finally(() => {
      quickCaptureFlushInFlightRef.current = null;
    });
    return quickCaptureFlushInFlightRef.current;
  });

  const scheduleQuickCapturePersist = useMemoizedFn(() => {
    clearQuickCaptureDebounceTimer();
    quickCaptureDebounceTimerRef.current = window.setTimeout(() => {
      quickCaptureDebounceTimerRef.current = null;
      void flushQuickCapturePersistQueue();
    }, QUICK_CAPTURE_DEBOUNCE_MS);
  });

  const handleQuickCaptureContentChange = useMemoizedFn(
    (content: Descendant[]) => {
      quickCaptureContentRef.current = normalizeEditorContent(content);
      quickCaptureDirtyRef.current = true;
      scheduleQuickCapturePersist();
    },
  );

  const handleQuickCaptureCategoryChange = useMemoizedFn(
    (category: KnownCardCategory) => {
      if (quickCaptureCategoryRef.current === category) {
        return;
      }
      quickCaptureCategoryRef.current = category;
      setQuickCaptureCategory(category);
      quickCaptureDirtyRef.current = true;
      scheduleQuickCapturePersist();
    },
  );

  const handleQuickCaptureClear = useMemoizedFn(() => {
    if (quickCaptureSaving) {
      return;
    }
    clearQuickCaptureDebounceTimer();
    quickCaptureDirtyRef.current = false;
    quickCaptureContentRef.current = EMPTY_EDITOR_CONTENT;
    quickCaptureLastSavedSnapshotRef.current = "";
    clearQuickCaptureDraft();

    const cardId = quickCaptureCardIdRef.current;
    if (cardId === null) {
      return;
    }

    setQuickCaptureSaving(true);
    void (async () => {
      try {
        const changed = await tauri.deleteCard(cardId);
        if (changed <= 0) {
          throw new Error("CARD_NOT_FOUND: card does not exist");
        }
        quickCaptureCardIdRef.current = null;
        quickCaptureContentIdRef.current = null;
        await refreshCardsSafe({ page: 1 });
      } catch (error) {
        presentError(error, "清空闪念失败，请稍后重试");
      } finally {
        setQuickCaptureSaving(false);
      }
    })();
  });

  const handleQuickCaptureClose = useMemoizedFn(
    async (content?: Descendant[]) => {
      if (quickCaptureSaving) {
        return;
      }

      clearQuickCaptureDebounceTimer();
      const normalizedContent = normalizeEditorContent(
        content ?? quickCaptureContentRef.current,
      );
      quickCaptureContentRef.current = normalizedContent;

      if (!isEditorContentEmpty(normalizedContent)) {
        quickCaptureDirtyRef.current = true;
        const persisted = await flushQuickCapturePersistQueue();
        if (!persisted) {
          return;
        }
      }

      const finalContent = normalizeEditorContent(
        quickCaptureContentRef.current,
      );
      const currentCardId = quickCaptureCardIdRef.current;
      if (isEditorContentEmpty(finalContent) && currentCardId !== null) {
        setQuickCaptureSaving(true);
        try {
          const changed = await tauri.deleteCard(currentCardId);
          if (changed <= 0) {
            throw new Error("CARD_NOT_FOUND: card does not exist");
          }
        } catch (error) {
          presentError(error, "删除空白闪念卡片失败");
          return;
        } finally {
          setQuickCaptureSaving(false);
        }
      }

      clearQuickCaptureDraft();
      resetQuickCaptureSession();
      if (quickCaptureOpen) {
        dispatchBack("ui");
      }
      await refreshCardsSafe({ page: 1 });
    },
  );

  const handleAddCard = useMemoizedFn(() => {
    resetQuickCaptureSession();
    openOverlay("overlay.quickCapture", {});
  });

  const handleSettingsModuleChange = useMemoizedFn(
    (module: SettingModule | null) => {
      if (module) {
        pushSettingsModule(module);
      } else {
        popSettingsModule();
      }
    },
  );

  useEffect(() => {
    const previousScreenKey = previousScreenKeyRef.current;
    const previousDetailParams = previousContentDetailParamsRef.current;
    const leftDetailFromPreview =
      previousScreenKey === "screen.contentDetail" &&
      previousDetailParams?.fromPreviewOverlay === true &&
      activeScreenKey !== "screen.contentDetail";

    if (leftDetailFromPreview && previewOpen) {
      const restoreCardId =
        previousDetailParams?.previewCardId ?? previewCardIdFromNavigation;
      if (
        typeof restoreCardId === "number" &&
        Number.isFinite(restoreCardId) &&
        restoreCardId > 0
      ) {
        void requestPreviewCardDetail(restoreCardId);
      }
    }

    previousScreenKeyRef.current = activeScreenKey;
    previousContentDetailParamsRef.current = contentDetailParams;
  }, [
    activeScreenKey,
    contentDetailParams,
    previewCardIdFromNavigation,
    previewOpen,
    requestPreviewCardDetail,
  ]);

  useEffect(() => {
    if (!previewOpen || previewCardIdFromNavigation === null) return;
    const cardId = previewCardIdFromNavigation;
    if (previewCardId === cardId) {
      if (previewLoading) return;
      if (previewCardDetail?.id === cardId) return;
    }
    void requestPreviewCardDetail(cardId);
  }, [
    previewCardDetail?.id,
    previewCardId,
    previewCardIdFromNavigation,
    previewLoading,
    previewOpen,
    requestPreviewCardDetail,
  ]);

  const renderScreenEntry = useMemoizedFn(
    (entry: StackEntry<ScreenPageKey>) => {
      if (entry.key === "screen.search") {
        return (
          <SearchPage
            transition={SEARCH_SCREEN_TRANSITION}
            onClose={() => dispatchBack("ui")}
            onSearch={handleSearch}
            onPreviewCard={handlePreviewCard}
            isSearching={isSearching}
          />
        );
      }

      if (entry.key === "screen.settings") {
        return (
          <SettingsPage
            transition={SETTINGS_SCREEN_TRANSITION}
            safeSetting={syncSettings.safeSetting}
            databases={bootstrap.databases}
            versions={bootstrap.versions}
            isSavingSetting={syncSettings.isSavingSetting}
            isSyncing={syncSettings.isSyncing}
            onBack={() => dispatchBack("ui")}
            activeModule={activeSettingsModule}
            onActiveModuleChange={handleSettingsModuleChange}
            onSwitchDatabase={handleSwitchDatabase}
            onSaveSetting={handleSaveSetting}
            onCheckVersions={handleCheckVersions}
            onSyncUpload={handleSyncUpload}
            onSyncDownload={handleSyncDownload}
            resourceSyncProgress={resourceSync.progress}
            resourceSyncStatusFile={resourceSync.statusFile}
            isResourceSyncing={resourceSync.isResourceSyncing}
            onResourceSyncRefresh={handleResourceSyncRefresh}
            onResourceSyncStart={handleResourceSyncStart}
            onResourceSyncRetryFailed={handleResourceSyncRetryFailed}
            onResourceSyncCancel={handleResourceSyncCancel}
            updateSetting={syncSettings.updateSetting}
          />
        );
      }

      if (entry.key === "screen.about") {
        return (
          <AboutPage
            transition={ABOUT_SCREEN_TRANSITION}
            onBack={() => dispatchBack("ui")}
          />
        );
      }

      if (entry.key === "screen.contentDetail") {
        const params = extractContentDetailParams(entry.params);
        if (!params) {
          return null;
        }
        return (
          <ContentDetailPage
            transition={CONTENT_DETAIL_SCREEN_TRANSITION}
            contentId={params.contentId}
            contentTitle={params.contentTitle}
            contentType={params.contentType}
            refId={params.refId}
            onBack={() => dispatchBack("ui")}
            onError={(error, fallback) => {
              presentError(error, fallback);
            }}
          />
        );
      }

      return null;
    },
  );

  // 加载态 - 使用内联样式作为后备，确保即使 CSS 未加载也能显示
  if (bootstrap.isLoading) {
    return (
      <main
        className="flex min-h-dvh items-center justify-center bg-gray-50 px-6 dark:bg-black"
        style={{
          display: "flex",
          minHeight: "100dvh",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "var(--color-bg-page)",
          padding: "0 24px",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: 40,
              height: 40,
              margin: "0 auto 16px",
              border: "2px solid var(--color-border)",
              borderTopColor: "transparent",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
            }}
          />
          <p style={{ fontSize: 14, color: "var(--color-text-secondary)" }}>
            正在初始化...
          </p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </main>
    );
  }

  return (
    <AntdApp>
      <KeyboardViewportProvider>
        <EditorServicesProvider services={services}>
          <BilibiliVideoDepsProvider deps={bilibiliDeps}>
            <YoutubeVideoDepsProvider deps={youtubeDeps}>
              <NotionVideoDepsProvider deps={notionDeps}>
                <RemoteVideoDepsProvider deps={remoteVideoDeps}>
                  <EditDatabaseDepsProvider deps={editDatabaseDeps}>
                    <DndProvider backend={HTML5Backend}>
                      <main className="min-h-dvh bg-gray-50 dark:bg-black">
                        <div ref={homeRootRef}>
                          {/* 顶部导航栏 */}
                          <Header title="卡片" />
                          <ToastViewport />

                          {/* 主内容区域 */}
                          <div className="px-4 pt-4">
                            <CardsPage
                              cards={cards.cards}
                              queryState={cards.queryState}
                              totalPages={cards.totalPages}
                              isLoadingCards={cards.isLoadingCards}
                              isPreviewOpen={previewOpen}
                              onPreviewCard={handlePreviewCard}
                              onUpdateCardCategory={handleUpdateCardCategory}
                              onDeleteCard={handleDeleteCard}
                              setQueryState={cards.setQueryState}
                              refreshCards={refreshCardsSafe}
                            />
                          </div>

                          {/* 悬浮工具栏 */}
                          <FloatingToolbar
                            onSearchClick={() => navigate("screen.search")}
                            onAddClick={handleAddCard}
                            onSettingsClick={() => navigate("screen.settings")}
                          />
                        </div>

                        <ScreenStackHost
                          screenStack={screenStack}
                          activeScreenId={activeScreenId}
                          renderScreen={renderScreenEntry}
                        />

                        {/* 卡片预览弹窗 */}
                        <CardPreviewSheet
                          open={shouldRenderPreviewSheet}
                          panelState={previewPanelState}
                          loading={previewLoading}
                          cardId={previewCardId}
                          cardDetail={previewCardDetail}
                          initialScrollTop={previewScrollTop}
                          onClose={() => dispatchBack("ui")}
                          onPanelStateChange={handlePreviewPanelStateChange}
                          onScrollTopChange={handlePreviewScrollTopChange}
                        />

                        {/* 快速闪念抽屉 */}
                        <QuickCaptureSheet
                          open={quickCaptureOpen}
                          saving={quickCaptureSaving}
                          category={quickCaptureCategory}
                          onContentChange={handleQuickCaptureContentChange}
                          onCategoryChange={handleQuickCaptureCategoryChange}
                          onClear={handleQuickCaptureClear}
                          onRequestClose={(content) => {
                            void handleQuickCaptureClose(content);
                          }}
                        />
                        {/* <KeyboardDebugPanel /> */}
                      </main>
                    </DndProvider>
                  </EditDatabaseDepsProvider>
                </RemoteVideoDepsProvider>
              </NotionVideoDepsProvider>
            </YoutubeVideoDepsProvider>
          </BilibiliVideoDepsProvider>
        </EditorServicesProvider>
      </KeyboardViewportProvider>
    </AntdApp>
  );
}
