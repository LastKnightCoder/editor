// 全局应用上下文：跨页面共享的数据 hook 结果与操作回调。
// 页面私有状态不放这里（归页面 store/组件 state），这里只放"全局唯一"的东西。

import { createContext, useContext } from "react";
import type {
  CardsOverviewResponse,
  ResourceSyncActionResponse,
  SyncActionResponse,
  SyncVersionResponse,
} from "../types";
import type { useBootstrap } from "../hooks/useBootstrap";
import type { useCardsQuery } from "../hooks/useCardsQuery";
import type { useSyncSettings } from "../hooks/useSyncSettings";
import type { useResourceSync } from "../hooks/useResourceSync";

export type AppContextValue = {
  presentError: (error: unknown, fallback: string, type?: "error" | "info" | "success") => void;
  bootstrap: ReturnType<typeof useBootstrap>;
  syncSettings: ReturnType<typeof useSyncSettings>;
  resourceSync: ReturnType<typeof useResourceSync>;
  cards: ReturnType<typeof useCardsQuery>;
  refreshCardsSafe: (overrides?: {
    page?: number;
    pageSize?: number;
    query?: string;
  }) => Promise<CardsOverviewResponse | null>;
  handleDeleteCard: (cardId: number) => Promise<void>;
  handleSwitchDatabase: (name: string) => Promise<void>;
  handleSaveSetting: () => Promise<void>;
  handleCheckVersions: () => Promise<SyncVersionResponse>;
  handleSyncUpload: () => Promise<SyncActionResponse>;
  handleSyncDownload: () => Promise<SyncActionResponse>;
  handleResourceSyncRefresh: () => Promise<void>;
  handleResourceSyncStart: () => Promise<ResourceSyncActionResponse>;
  handleResourceSyncRetryFailed: () => Promise<ResourceSyncActionResponse>;
  handleResourceSyncCancel: () => Promise<ResourceSyncActionResponse>;
  diaryModuleEnabled: boolean;
  todoModuleEnabled: boolean;
  pomodoroModuleEnabled: boolean;
  calendarModuleEnabled: boolean;
};

export const AppContext = createContext<AppContextValue | null>(null);

export function useAppContext(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) {
    throw new Error("useAppContext 必须在 AppContext.Provider 内使用");
  }
  return value;
}
