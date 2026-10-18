import { QueryCache, QueryClient, useQuery } from "@tanstack/react-query";
import type { QueryMeta } from "../../contracts";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  init?: RequestInit
): Promise<{ data: T; meta?: QueryMeta }> {
  const response = await fetch(path, { ...init, credentials: "same-origin" });
  const body = await response.json();
  if (!response.ok) throw new ApiError(response.status, body.error?.message ?? "请求失败，请重试");
  return body;
}
export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: error => {
      if (error instanceof ApiError && error.status === 401)
        queryClient.setQueryData(["session"], false);
    },
  }),
  defaultOptions: { queries: { staleTime: 60000, retry: false, refetchOnWindowFocus: true } },
});
export interface Filters {
  from: string;
  to: string;
  environment: string;
}
export function useAnalytics<T>(endpoint: string, filters: Filters, dimension?: string) {
  return useQuery({
    queryKey: ["analytics", endpoint, filters, dimension],
    queryFn: () =>
      api<T>(
        `/v1/admin/${endpoint}?${new URLSearchParams({ ...filters, ...(dimension ? { dimension } : {}) })}`
      ),
  });
}
export const localDay = (time = Date.now()) =>
  new Date(time + 8 * 3600000).toISOString().slice(0, 10);
