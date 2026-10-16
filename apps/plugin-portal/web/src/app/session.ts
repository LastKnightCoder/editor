import { useSyncExternalStore } from "react";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import type { Session } from "../../../contracts";
import { queryKeys, useApi } from "./api";

export function useSession() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.session,
    queryFn: () => api.getSession(),
    staleTime: 5 * 60_000,
  });
}

/* ---------- 会话过期信号：任一请求 401 时置位，登录页据此提示 ---------- */

let expired = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());

export const sessionExpiry = {
  mark(queryClient: QueryClient) {
    queryClient.setQueryData<Session>(queryKeys.session, { user: null, csrfToken: null });
    if (expired) return;
    expired = true;
    emit();
  },
  clear() {
    if (!expired) return;
    expired = false;
    emit();
  },
  get: () => expired,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  },
};

export const useSessionExpired = () =>
  useSyncExternalStore(sessionExpiry.subscribe, sessionExpiry.get, sessionExpiry.get);

/* ---------- 登录后回到原页面：OAuth 回调固定落在 /submissions ---------- */

const RETURN_KEY = "tau-portal:return-to";

const isPortalPath = (path: string) => /^\/submissions(\/[\w-]+)?(\?|$)/.test(path);

export function rememberReturnTo(path: string) {
  if (!isPortalPath(path) || path === "/submissions" || path.startsWith("/submissions/new")) return;
  try {
    sessionStorage.setItem(RETURN_KEY, path);
  } catch {
    /* 存储不可用时登录后停在列表页 */
  }
}

export function takeReturnTo(): string | null {
  try {
    const path = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    return path && isPortalPath(path) ? path : null;
  } catch {
    return null;
  }
}
