import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PluginPermission } from "@tau/plugins";
import type { MobileContentSnapshot } from "./data";
import { subscribeContentUpdate } from "../../features/cards/contentSyncBus";
import { usePluginComponentState } from "./component-scope";

type Resolution =
  | { status: "missing" | "denied" }
  | { status: "prompt"; permission: PluginPermission }
  | { status: "granted"; snapshot: MobileContentSnapshot };
type Access = { result: Resolution; writable: boolean; edit?: Resolution; revision: number };

export function usePluginContentAccess(contentRef: string, mode: "read" | "write") {
  const state = usePluginComponentState();
  const { scope, runtime, revision, active, isActive } = state;
  const client = useQueryClient();
  const key = useMemo(
    () => ["plugin-content-component", scope?.id, contentRef, mode, revision],
    [scope?.id, contentRef, mode, revision]
  );
  const query = useQuery<Access>({
    queryKey: key,
    enabled: active && !!runtime?.data,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: true,
    queryFn: async ({ signal }) => {
      if (!scope || !runtime?.data || !isActive()) throw new Error("插件组件会话已失效");
      const primary = await runtime.data.resolveComponentContent(scope.context, contentRef, mode);
      let result = primary;
      if (mode === "write" && primary.status !== "granted") {
        const readable = await runtime.data.resolveComponentContent(
          scope.context,
          contentRef,
          "read"
        );
        if (readable.status === "granted") result = readable;
      }
      signal.throwIfAborted();
      if (!isActive() || runtime.permissions?.getSnapshot() !== revision)
        throw new Error("访问状态已变化");
      return {
        result,
        writable: mode === "write" && primary.status === "granted",
        edit: primary !== result ? primary : undefined,
        revision,
      };
    },
  });
  const access = active && query.data?.revision === revision ? query.data : undefined;
  const snapshot = access?.result.status === "granted" ? access.result.snapshot : undefined;
  const guard = useCallback(() => {
    if (!isActive() || !snapshot || runtime?.permissions?.getSnapshot() !== revision)
      throw new Error("插件正文访问已失效");
  }, [isActive, snapshot, runtime, revision]);
  const canWrite = useCallback(() => {
    try {
      guard();
      return !!access?.writable;
    } catch {
      return false;
    }
  }, [guard, access?.writable]);
  const contentId = snapshot?.document.contentId;
  useEffect(() => {
    if (!contentId) return;
    return subscribeContentUpdate(contentId, `plugin-preview:${scope?.id}`, () => {
      void client.invalidateQueries({ queryKey: key });
    });
  }, [client, key, scope?.id, contentId]);
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState("");
  const request = async (permission: PluginPermission) => {
    if (!scope || !isActive() || requesting) return;
    setRequesting(true);
    setRequestError("");
    try {
      await scope.context.permissions.request([permission]);
    } catch (error) {
      if (isActive()) setRequestError(String(error));
    } finally {
      if (isActive()) {
        setRequesting(false);
        void client.invalidateQueries({ queryKey: ["plugin-content-component", scope.id] });
      }
    }
  };
  return {
    ...state,
    access,
    snapshot,
    guard,
    canWrite,
    request,
    requesting,
    requestError,
    error: query.error,
    refetch: query.refetch,
  };
}

export function ContentAccessNotice({
  state,
  resolution,
}: {
  state: ReturnType<typeof usePluginContentAccess>;
  resolution?: Resolution;
}) {
  const access = resolution ?? state.access?.result;
  if (!resolution && state.snapshot) return null;
  const message = !state.scope
    ? "正文组件只能在插件页面中使用"
    : !state.active
      ? "插件页面已失效或暂不可用"
      : state.error
        ? `正文加载失败：${String(state.error)}`
        : !access
          ? "正在检查访问权限…"
          : access.status === "missing"
            ? "内容不存在或已删除"
            : access.status === "prompt"
              ? "允许插件访问这段内容后即可继续"
              : "插件未获准访问这段内容，可在插件详情中修改权限";
  return (
    <div
      role={state.error ? "alert" : "status"}
      className="bg-surface border-line-1 text-ink-2 text-tau-meta rounded-tau-md flex flex-wrap items-center gap-3 border px-3 py-2.5"
    >
      <span>{message}</span>
      {access?.status === "prompt" && state.active ? (
        <button
          type="button"
          disabled={state.requesting}
          className="text-accent-text py-1 disabled:opacity-50"
          onClick={() => void state.request(access.permission)}
        >
          允许访问
        </button>
      ) : null}
      {state.requestError ? <span role="alert">{state.requestError}</span> : null}
    </div>
  );
}
