import { useEffect, useMemo, useRef, useState } from "react";
import { onBackButtonPress } from "@tauri-apps/api/app";
import { useMemoizedFn } from "ahooks";
import { App as AntdApp } from "antd";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { EditorServicesProvider } from "@tau/editor/src";
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
import { SettingsPage } from "../features/settings/SettingsPage";
import type { SettingModule } from "../features/settings/components/types";
import { SearchPage } from "../features/search/SearchPage";
import { AboutPage } from "../features/about/AboutPage";
import { Header } from "../components/Header";
import { Sidebar } from "../components/Sidebar";
import { FloatingToolbar } from "../components/FloatingToolbar";
import {
  useActiveScreenKey,
  useActiveScreenParams,
  useNavigationActions,
  useNavigationToast,
  useTopOverlayKey,
  useTopOverlayParams,
  useTopSettingsModule,
} from "../navigation/hooks";
import {
  canGoBackInNavigationState,
  DOUBLE_BACK_EXIT_MS,
  useNavigationStore,
} from "../navigation/store";
import type { CardDetailResponse, CardsOverviewResponse } from "../types";

type NoticeType = "success" | "error" | "info";

type NoticeState = {
  type: NoticeType;
  text: string;
} | null;

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

function extractPreviewOverlayUi(params: unknown): {
  scrollTop: number;
  fullscreen: boolean;
} {
  if (!params || typeof params !== "object") {
    return { scrollTop: 0, fullscreen: false };
  }
  const ui = (params as { ui?: unknown }).ui;
  if (!ui || typeof ui !== "object") {
    return { scrollTop: 0, fullscreen: false };
  }
  const scrollTop = (ui as { scrollTop?: unknown }).scrollTop;
  const fullscreen = (ui as { fullscreen?: unknown }).fullscreen;
  return {
    scrollTop:
      typeof scrollTop === "number" && Number.isFinite(scrollTop)
        ? Math.max(0, scrollTop)
        : 0,
    fullscreen: Boolean(fullscreen),
  };
}

function extractContentDetailParams(params: unknown): {
  contentId: number;
  contentTitle?: string;
  contentType?: string;
  refId?: number;
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
  };
}

export default function AppShell() {
  const [notice, setNotice] = useState<NoticeState>(null);
  const [previewFullscreen, setPreviewFullscreen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewCardId, setPreviewCardId] = useState<number | null>(null);
  const [previewCardDetail, setPreviewCardDetail] =
    useState<CardDetailResponse | null>(null);
  const [previewScrollTop, setPreviewScrollTop] = useState(0);
  const [isSearching, setIsSearching] = useState(false);

  const bootstrap = useBootstrap();
  const cards = useCardsQuery();
  const syncSettings = useSyncSettings();
  const resourceSync = useResourceSync();
  const previewRequestSeq = useRef(0);
  const searchRequestSeq = useRef(0);

  const activeScreenKey = useActiveScreenKey();
  const activeScreenParams = useActiveScreenParams();
  const topOverlayKey = useTopOverlayKey();
  const topOverlayParams = useTopOverlayParams();
  const activeSettingsModule = useTopSettingsModule();
  const navigationToast = useNavigationToast();

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

  const sidebarOpen = topOverlayKey === "overlay.sidebar";
  const previewOpen = topOverlayKey === "overlay.cardPreview";
  const previewCardIdFromNavigation = previewOpen
    ? extractPreviewCardId(topOverlayParams)
    : null;
  const previewUiFromNavigation = previewOpen
    ? extractPreviewOverlayUi(topOverlayParams)
    : { scrollTop: 0, fullscreen: false };
  const contentDetailParams =
    activeScreenKey === "screen.contentDetail"
      ? extractContentDetailParams(activeScreenParams)
      : null;

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
    initializeHistory();
  }, [initializeHistory]);

  useEffect(() => {
    if (!navigationToast) return;
    setNotice({
      type: navigationToast.type,
      text: navigationToast.text,
    });
    clearToast();
  }, [navigationToast, clearToast]);

  useEffect(() => {
    if (!previewOpen || previewCardIdFromNavigation !== null) return;
    previewRequestSeq.current += 1;
    setPreviewFullscreen(false);
    setPreviewScrollTop(0);
    setPreviewLoading(false);
    setPreviewCardId(null);
    setPreviewCardDetail(null);
  }, [previewOpen, previewCardIdFromNavigation]);

  useEffect(() => {
    if (!previewOpen) return;
    setPreviewFullscreen(previewUiFromNavigation.fullscreen);
    setPreviewScrollTop(previewUiFromNavigation.scrollTop);
  }, [
    previewOpen,
    previewUiFromNavigation.fullscreen,
    previewUiFromNavigation.scrollTop,
  ]);

  // 通知自动消失
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(timer);
  }, [notice]);

  const noticeClass = useMemo(() => {
    if (!notice) return "";
    if (notice.type === "success")
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400";
    if (notice.type === "info")
      return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    return "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400";
  }, [notice]);

  const presentError = useMemoizedFn(
    (error: unknown, fallback: string, type: NoticeType = "error") => {
      const parsed = parseInvokeError(error);
      setNotice({
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
          const snapshot = useNavigationStore.getState();
          const hasAppBack = canGoBackInNavigationState(snapshot);
          const inExitWindow =
            Date.now() - snapshot.lastBackTs <= DOUBLE_BACK_EXIT_MS;
          if (!hasAppBack && inExitWindow) {
            return;
          }
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
      setNotice({ type: "success", text: `已切换到 ${name}` });
    } catch (error) {
      presentError(error, "切换数据库失败");
    }
  });

  const handleSaveSetting = useMemoizedFn(async () => {
    try {
      const result = await syncSettings.persistSetting();
      await bootstrap.refreshDatabases();
      await refreshVersionsSafe();
      try {
        await resourceSync.refreshResourceStatus();
      } catch {
        // ignore
      }
      setNotice({ type: "success", text: result.message || "同步配置已保存" });
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
    try {
      const result = await syncSettings.runSyncAction("syncUploadDatabase");
      await syncSettings.loadSetting();
      await bootstrap.refreshDatabases();
      await refreshCardsSafe({ page: 1 });
      await refreshVersionsSafe();
      setNotice({ type: "success", text: result.message });
    } catch (error) {
      presentError(error, "上传失败");
    }
  });

  const handleSyncDownload = useMemoizedFn(async () => {
    try {
      const result = await syncSettings.runSyncAction("syncDownloadDatabase");
      await syncSettings.loadSetting();
      await bootstrap.refreshDatabases();
      await refreshCardsSafe({ page: 1 });
      await refreshVersionsSafe();
      setNotice({ type: "success", text: result.message });
    } catch (error) {
      presentError(error, "下载失败");
    }
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
    setNotice({ type: "success", text: result.message });
  });

  const handleResourceSyncRetryFailed = useMemoizedFn(async () => {
    const result = await resourceSync.retryFailedResourceSync();
    if (!result.ok) {
      throw new Error(
        `${result.code ?? "RESOURCE_SYNC_FAILED"}:${result.message}`,
      );
    }
    setNotice({ type: "success", text: result.message });
  });

  const handleResourceSyncCancel = useMemoizedFn(async () => {
    const result = await resourceSync.cancelResourceSync();
    if (!result.ok) {
      throw new Error(
        `${result.code ?? "RESOURCE_SYNC_FAILED"}:${result.message}`,
      );
    }
    setNotice({ type: "info", text: result.message });
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

  const handleTogglePreviewFullscreen = useMemoizedFn(() => {
    const nextFullscreen = !previewFullscreen;
    setPreviewFullscreen(nextFullscreen);
    if (!previewOpen || previewCardIdFromNavigation === null) {
      return;
    }
    replaceOverlayParams("overlay.cardPreview", {
      ui: {
        scrollTop: previewScrollTop,
        fullscreen: nextFullscreen,
      },
    });
  });

  const handlePreviewCard = useMemoizedFn(async (cardId: number) => {
    openOverlay("overlay.cardPreview", {
      cardId,
      ui: {
        scrollTop: 0,
        fullscreen: false,
      },
    });
    setPreviewFullscreen(false);
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
        fullscreen: previewFullscreen,
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

  const handleAddCard = useMemoizedFn(() => {
    setNotice({ type: "info", text: "新建卡片功能即将上线" });
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

  // 加载态 - 使用内联样式作为后备，确保即使 CSS 未加载也能显示
  if (bootstrap.isLoading) {
    return (
      <main
        className="flex min-h-dvh items-center justify-center bg-gray-50 px-6 dark:bg-gray-900"
        style={{
          display: "flex",
          minHeight: "100dvh",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f5f5f5",
          padding: "0 24px",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: 40,
              height: 40,
              margin: "0 auto 16px",
              border: "2px solid #3b82f6",
              borderTopColor: "transparent",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
            }}
          />
          <p style={{ fontSize: 14, color: "#6b7280" }}>正在初始化...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </main>
    );
  }

  return (
    <AntdApp>
      <EditorServicesProvider services={services}>
        <BilibiliVideoDepsProvider deps={bilibiliDeps}>
          <YoutubeVideoDepsProvider deps={youtubeDeps}>
            <NotionVideoDepsProvider deps={notionDeps}>
              <RemoteVideoDepsProvider deps={remoteVideoDeps}>
                <EditDatabaseDepsProvider deps={editDatabaseDeps}>
                  <DndProvider backend={HTML5Backend}>
                    <main className="min-h-dvh bg-gray-50 dark:bg-gray-900">
                      {/* 顶部导航栏 */}
                      <Header
                        title="卡片"
                        onMenuClick={() => openOverlay("overlay.sidebar", {})}
                      />

                      {/* 通知条 */}
                      {notice && (
                        <div className="px-4 pt-2">
                          <div
                            className={`notice-enter rounded-lg border px-4 py-3 text-sm ${noticeClass}`}
                          >
                            {notice.text}
                          </div>
                        </div>
                      )}

                      {/* 主内容区域 */}
                      <div className="px-4 pt-4">
                        <CardsPage
                          cards={cards.cards}
                          queryState={cards.queryState}
                          totalPages={cards.totalPages}
                          isLoadingCards={cards.isLoadingCards}
                          isPreviewOpen={previewOpen}
                          onPreviewCard={handlePreviewCard}
                          setQueryState={cards.setQueryState}
                          refreshCards={refreshCardsSafe}
                        />
                      </div>

                      {/* 悬浮工具栏 */}
                      <FloatingToolbar
                        onSearchClick={() => navigate("screen.search")}
                        onAddClick={handleAddCard}
                      />

                      {/* 侧边栏 */}
                      <Sidebar
                        open={sidebarOpen}
                        onClose={() => dispatchBack("ui")}
                        onNavigateSettings={() => navigate("screen.settings")}
                        onNavigateAbout={() => navigate("screen.about")}
                      />

                      {/* 搜索页 */}
                      {activeScreenKey === "screen.search" && (
                        <SearchPage
                          onClose={() => dispatchBack("ui")}
                          onSearch={handleSearch}
                          onPreviewCard={handlePreviewCard}
                          isSearching={isSearching}
                        />
                      )}

                      {/* 设置页 */}
                      {activeScreenKey === "screen.settings" && (
                        <SettingsPage
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
                          onResourceSyncRetryFailed={
                            handleResourceSyncRetryFailed
                          }
                          onResourceSyncCancel={handleResourceSyncCancel}
                          updateSetting={syncSettings.updateSetting}
                        />
                      )}

                      {/* 关于页 */}
                      {activeScreenKey === "screen.about" && (
                        <AboutPage onBack={() => dispatchBack("ui")} />
                      )}

                      {/* 内容详情页 */}
                      {activeScreenKey === "screen.contentDetail" && (
                        <ContentDetailPage
                          contentId={contentDetailParams?.contentId ?? -1}
                          contentTitle={contentDetailParams?.contentTitle}
                          contentType={contentDetailParams?.contentType}
                          refId={contentDetailParams?.refId}
                          onBack={() => dispatchBack("ui")}
                          onError={(error, fallback) => {
                            presentError(error, fallback);
                          }}
                        />
                      )}

                      {/* 卡片预览弹窗 */}
                      <CardPreviewSheet
                        open={previewOpen}
                        fullscreen={previewFullscreen}
                        loading={previewLoading}
                        cardId={previewCardId}
                        cardDetail={previewCardDetail}
                        initialScrollTop={previewScrollTop}
                        onClose={() => dispatchBack("ui")}
                        onToggleFullscreen={handleTogglePreviewFullscreen}
                        onScrollTopChange={handlePreviewScrollTopChange}
                      />
                    </main>
                  </DndProvider>
                </EditDatabaseDepsProvider>
              </RemoteVideoDepsProvider>
            </NotionVideoDepsProvider>
          </YoutubeVideoDepsProvider>
        </BilibiliVideoDepsProvider>
      </EditorServicesProvider>
    </AntdApp>
  );
}
