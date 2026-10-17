import { createContext, useContext, type ReactNode } from "react";
import { QueryClient } from "@tanstack/react-query";
import { PortalApiError } from "../api/errors";
import type { PortalApi } from "../api/types";

const ApiContext = createContext<PortalApi | null>(null);

export function ApiProvider({ api, children }: { api: PortalApi; children: ReactNode }) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

export function useApi(): PortalApi {
  const api = useContext(ApiContext);
  if (!api) throw new Error("useApi 需要在 ApiProvider 内使用");
  return api;
}

/** 只重试网络中断与服务暂不可用；4xx 是确定结果，重试无意义 */
export function isRetryable(error: unknown): boolean {
  if (!(error instanceof PortalApiError)) return false;
  return error.code === "NETWORK_ERROR" || error.status === 503;
}

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (count, error) => count < 2 && isRetryable(error),
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  });
}

export const queryKeys = {
  session: ["session"] as const,
  submissions: ["submissions"] as const,
  submission: (id: string) => ["submission", id] as const,
  upload: (id: string) => ["upload", id] as const,
  uploadContent: (id: string) => ["upload-content", id] as const,
};
