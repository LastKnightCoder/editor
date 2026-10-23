// AppShell：全局数据编排 + Provider 组装。导航/页面/浮层全部交给 router。

import { useEffect, useMemo, useRef } from "react";
import { useMemoizedFn } from "ahooks";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import {
  RemoteVideoDepsProvider,
  EditDatabaseDepsProvider,
  UseRemoteVideoDeps,
  UseEditDatabaseDeps,
  type DataTable,
  type DataTableView,
} from "@tau/shared";

import { useBootstrap } from "../hooks/useBootstrap";
import { useCardsQuery } from "../hooks/useCardsQuery";
import { emitDatabaseChange, useDatabaseChangeEffect } from "../hooks/useDatabaseChangeEffect";
import { useResourceSync } from "../hooks/useResourceSync";
import { useSyncSettings } from "../hooks/useSyncSettings";
import { mapErrorToMessage, parseInvokeError } from "../services/errors";
import * as tauri from "../services/tauri";
import { initThemeRuntime } from "@tau/themes/react";
import { normalizeEditorContent } from "../features/cards/editorContentUtils";
import { subscribeContentUpdateAll } from "../features/cards/contentSyncBus";
import { setupEntityRefsRebuild } from "../features/context/refIndex";
import type { CardsOverviewResponse } from "../types";
import { useTodoStore } from "../features/todo/store/useTodoStore";
import { useDiaryStore } from "../features/diary/store/useDiaryStore";
import { invalidateCalendarQueries } from "../features/calendar/queries";
import { ToastViewport } from "../components/ToastViewport";
import { EditorConfirmHost, EditorPromptHost } from "../services/editorNotifier";
import { KeyboardViewportProvider } from "../components/KeyboardViewportProvider";
import { AppDock } from "../components/AppDock";
import { toast } from "../components/toast";
import {
  OverlayHost,
  PageHost,
  PageQueryProvider,
  RouterDevTools,
  RouterProvider,
} from "../router";
import { AppContext, type AppContextValue } from "./AppContext";
import { HomeScreen } from "./HomeScreen";
import { writeLastSyncTime } from "../features/settings/sync/syncState";
import "../pages";

const EMPTY_VIEW_CONFIG = {
  columnOrder: [],
  rowOrder: [],
  sorts: [],
};

const remoteVideoDeps: UseRemoteVideoDeps = {
  cacheVideo: async ({ url }) => ({
    localUrl: url,
    fileSize: 0,
    cached: true,
  }),
  getCacheStatus: async () => null,
  showError: message => {
    console.warn("[mobile-remote-video]", message);
  },
  isRemoteUrl: () => false,
};

const editDatabaseDeps: UseEditDatabaseDeps = {
  getDataTableDetail: async tableId => {
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
  updateDataTable: async data => ({
    id: data.id,
    createTime: 0,
    updateTime: Date.now(),
    columns: data.columns,
    rows: data.rows,
    activeViewId: data.activeViewId ?? null,
  }),
  updateDataTableView: async view => view,
  createDataTableView: async view => ({
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
  deleteDataTableView: async viewId => viewId,
  setActiveDataTableView: async () => true,
  reorderDataTableViews: async () => undefined,
};

async function withTimeout<T>(
  task: Promise<T>,
  timeoutMs: number,
  timeoutCode: string,
  timeoutMessage: string
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

export default function AppShell() {
  // AppShellInner 顶层即消费 useCardsQuery（useQueryClient），QueryClient 必须先于它挂载
  return (
    <PageQueryProvider>
      <AppShellInner />
    </PageQueryProvider>
  );
}

function AppShellInner() {
  const bootstrap = useBootstrap();
  const cards = useCardsQuery();
  const syncSettings = useSyncSettings();
  const resourceSync = useResourceSync();
  const initialized = useRef(false);

  const presentError = useMemoizedFn(
    (error: unknown, fallback: string, type: "error" | "info" | "success" = "error") => {
      const parsed = parseInvokeError(error);
      toast({
        type,
        text: mapErrorToMessage(parsed.code, parsed.message || fallback),
      });
    }
  );

  const refreshVersionsSafe = useMemoizedFn(async () => {
    try {
      await bootstrap.refreshVersions();
    } catch (error) {
      presentError(error, "同步配置尚未完成", "info");
    }
  });

  const refreshCardsSafe = useMemoizedFn(
    async (overrides?: { page?: number; pageSize?: number; query?: string }) => {
      try {
        return await cards.refreshCards(overrides);
      } catch (error) {
        presentError(error, "卡片读取失败");
        return cards.cards ?? EMPTY_CARDS_FALLBACK;
      }
    }
  );

  const refreshAfterDatabaseChange = useMemoizedFn(async (event: { databaseName: string }) => {
    const targetDatabaseName =
      event.databaseName ||
      syncSettings.safeSetting?.database?.active ||
      bootstrap.databases?.activeDatabase ||
      null;
    const taskResults = await Promise.allSettled([
      syncSettings.loadSetting(),
      bootstrap.refreshDatabases(),
      refreshCardsSafe({ page: 1 }),
      refreshVersionsSafe(),
      useTodoStore.getState().reloadAfterDatabaseChange(targetDatabaseName),
      useDiaryStore.getState().reloadAfterDatabaseChange(targetDatabaseName),
      invalidateCalendarQueries(),
    ]);
    const fallbackMessages = [
      "刷新设置快照失败",
      "刷新数据库列表失败",
      "刷新卡片列表失败",
      "刷新同步状态失败",
      "刷新任务数据失败",
      "刷新日记数据失败",
      "刷新日历数据失败",
    ] as const;
    taskResults.forEach((result, index) => {
      if (result.status === "rejected") {
        presentError(result.reason, fallbackMessages[index] ?? "数据库变更后刷新失败");
      }
    });
  });

  useDatabaseChangeEffect(
    async event => {
      await refreshAfterDatabaseChange(event);
    },
    [refreshAfterDatabaseChange]
  );

  // 初始化（仅执行一次）
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
    document.body.classList.add("mobile-app-shell");
    return () => {
      document.body.classList.remove("mobile-app-shell");
    };
  }, []);

  // 主题运行时：首帧脚本已预置 data-theme/data-mode，这里接管偏好读写与系统明暗监听
  useEffect(() => initThemeRuntime(), []);

  // entity_refs 引用索引对账：启动一次 + 监听主进程 reconcile 就绪事件（保存、同步下载、切库）
  useEffect(() => setupEntityRefsRebuild(), []);

  // 内容编辑广播：更新卡片列表缓存
  useEffect(() => {
    return subscribeContentUpdateAll(payload => {
      const normalizedContent = normalizeEditorContent(payload.content);
      const updateTime =
        typeof payload.updateTime === "number" &&
        Number.isFinite(payload.updateTime) &&
        payload.updateTime > 0
          ? payload.updateTime
          : Date.now();
      cards.patchCardsByContent({
        contentId: payload.contentId,
        content: normalizedContent,
        updateTime,
      });
    });
  }, [cards.patchCardsByContent]);

  const handleSwitchDatabase = useMemoizedFn(async (name: string) => {
    try {
      const result = await tauri.setActiveDatabase(name);
      const databaseName = result.activeDatabase || name;
      await emitDatabaseChange({
        reason: "switch",
        databaseName,
        timestamp: Date.now(),
      });
      toast.success(`已切换到 ${databaseName}`);
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

  const handleCheckVersions = useMemoizedFn(() => {
    return withTimeout(
      bootstrap.refreshVersions(),
      35000,
      "SYNC_CHECK_FAILED",
      "同步状态刷新超时，请检查网络、Endpoint 或 URL 风格"
    );
  });

  const handleSyncUpload = useMemoizedFn(async () => {
    const result = await syncSettings.runSyncAction("syncUploadDatabase");
    writeLastSyncTime(result.databaseName, Date.now());
    await syncSettings.loadSetting();
    await bootstrap.refreshDatabases();
    await refreshCardsSafe({ page: 1 });
    await refreshVersionsSafe();
    return result;
  });

  const handleSyncDownload = useMemoizedFn(async () => {
    const result = await syncSettings.runSyncAction("syncDownloadDatabase");
    writeLastSyncTime(result.databaseName, Date.now());
    await emitDatabaseChange({
      reason: "syncDownload",
      databaseName: result.databaseName,
      localVersion: result.localVersion,
      remoteVersion: result.remoteVersion,
      timestamp: Date.now(),
    });
    return result;
  });

  const handleResourceSyncRefresh = useMemoizedFn(async () => {
    await resourceSync.refreshResourceStatus();
  });

  const handleResourceSyncStart = useMemoizedFn(async () => {
    const result = await resourceSync.startResourceSync();
    if (!result.ok) {
      throw new Error(`${result.code ?? "RESOURCE_SYNC_FAILED"}:${result.message}`);
    }
    return result;
  });

  const handleResourceSyncRetryFailed = useMemoizedFn(async () => {
    const result = await resourceSync.retryFailedResourceSync();
    if (!result.ok) {
      throw new Error(`${result.code ?? "RESOURCE_SYNC_FAILED"}:${result.message}`);
    }
    return result;
  });

  const handleResourceSyncCancel = useMemoizedFn(async () => {
    const result = await resourceSync.cancelResourceSync();
    if (!result.ok) {
      throw new Error(`${result.code ?? "RESOURCE_SYNC_FAILED"}:${result.message}`);
    }
    return result;
  });

  const handleDeleteCard = useMemoizedFn(async (cardId: number) => {
    try {
      const changed = await tauri.deleteCard(cardId);
      if (changed <= 0) {
        throw new Error("CARD_NOT_FOUND: card does not exist");
      }
      await refreshCardsSafe({ page: 1 });
      toast.success("卡片已删除");
    } catch (error) {
      presentError(error, "删除卡片失败");
      throw error;
    }
  });

  const appContextValue = useMemo<AppContextValue>(
    () => ({
      presentError,
      bootstrap,
      syncSettings,
      resourceSync,
      cards,
      refreshCardsSafe,
      handleDeleteCard,
      handleSwitchDatabase,
      handleSaveSetting,
      handleCheckVersions,
      handleSyncUpload,
      handleSyncDownload,
      handleResourceSyncRefresh,
      handleResourceSyncStart,
      handleResourceSyncRetryFailed,
      handleResourceSyncCancel,
      diaryModuleEnabled: syncSettings.safeSetting?.module?.dailyNote?.enable !== false,
      todoModuleEnabled: syncSettings.safeSetting?.module?.todo?.enable !== false,
      pomodoroModuleEnabled: syncSettings.safeSetting?.module?.pomodoro?.enable !== false,
      calendarModuleEnabled: syncSettings.safeSetting?.module?.calendar?.enable !== false,
    }),
    // context 值随 hook 数据更新即可，页面订阅自己的字段
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      bootstrap,
      syncSettings,
      resourceSync,
      cards,
      presentError,
      refreshCardsSafe,
      handleDeleteCard,
      handleSwitchDatabase,
      handleSaveSetting,
      handleCheckVersions,
      handleSyncUpload,
      handleSyncDownload,
      handleResourceSyncRefresh,
      handleResourceSyncStart,
      handleResourceSyncRetryFailed,
      handleResourceSyncCancel,
    ]
  );

  // 加载态 - 使用内联样式作为后备，确保即使 CSS 未加载也能显示
  if (bootstrap.isLoading) {
    return (
      <main
        className="bg-page flex min-h-dvh items-center justify-center px-6"
        style={{
          display: "flex",
          minHeight: "100dvh",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "var(--tau-bg-page)",
          padding: "0 24px",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: 40,
              height: 40,
              margin: "0 auto 16px",
              border: "2px solid var(--tau-line-1)",
              borderTopColor: "transparent",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
            }}
          />
          <p style={{ fontSize: 14, color: "var(--tau-ink-2)" }}>正在初始化...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </main>
    );
  }

  return (
    <KeyboardViewportProvider>
      <RemoteVideoDepsProvider deps={remoteVideoDeps}>
        <EditDatabaseDepsProvider deps={editDatabaseDeps}>
          <DndProvider backend={HTML5Backend}>
            <PageQueryProvider>
              <AppContext.Provider value={appContextValue}>
                <RouterProvider
                  rootKey="home"
                  onRootBackHint={text => toast({ type: "info", text })}
                >
                  <main className="bg-page min-h-dvh">
                    <PageHost rootContent={<HomeScreen />} />
                    <AppDock />
                    <OverlayHost />
                    <EditorConfirmHost />
                    <EditorPromptHost />
                    <ToastViewport />
                    {import.meta.env.DEV && <RouterDevTools />}
                  </main>
                </RouterProvider>
              </AppContext.Provider>
            </PageQueryProvider>
          </DndProvider>
        </EditDatabaseDepsProvider>
      </RemoteVideoDepsProvider>
    </KeyboardViewportProvider>
  );
}

const EMPTY_CARDS_FALLBACK: CardsOverviewResponse = {
  total: 0,
  page: 1,
  pageSize: 20,
  query: "",
  searchMode: "none",
  items: [],
};
