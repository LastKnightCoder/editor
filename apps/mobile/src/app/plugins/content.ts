import { createContentMetrics } from "@tau/db-schema/content-metrics";
import { editorMetricRules } from "@tau/editor/content-metrics";
import { ContentPluginRegistry } from "@tau/plugins/content";

export const mobileContentMetrics = createContentMetrics(editorMetricRules);
export const mobileContentPlugins = new ContentPluginRegistry(rules => {
  mobileContentMetrics.setRules([...editorMetricRules, ...rules]);
});

export const mobilePluginElementSupport = new Map<string, "none" | "render" | "edit">();

/**
 * 插件会话阶段：starting 时应用照常可用，只是插件贡献尚未装配；
 * 其余三种都算已落定（ready 正常、safe 上次启动中断而跳过插件、failed 会话整体失败）。
 */
export type MobilePluginPhase = "starting" | "ready" | "safe" | "failed";
export interface MobilePluginState {
  phase: MobilePluginPhase;
  /** safe / failed 的说明文案 */
  message: string;
}

let state: MobilePluginState = { phase: "starting", message: "" };
const listeners = new Set<() => void>();

/** 插件会话阶段的唯一来源：编辑器 kit 等非 React 层与界面共用。 */
export const mobilePluginState = {
  get: () => state,
  set(next: MobilePluginState) {
    if (next.phase === state.phase && next.message === state.message) return;
    state = next;
    for (const listener of listeners) listener();
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export const isMobilePluginSettled = () => state.phase !== "starting";

/** 下载替换资料库后，资源同步须等插件会话重新就绪。 */
export function waitForMobilePluginReady(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      unsubscribe();
      signal?.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      reject(new DOMException("资源同步已停止", "AbortError"));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("SYNC_PROVIDER_UNAVAILABLE:同步插件准备超时，请稍后重试"));
    }, 30000);
    const check = () => {
      const current = mobilePluginState.get();
      if (current.phase === "starting") return;
      cleanup();
      if (current.phase === "ready") resolve();
      else reject(new Error("SYNC_PROVIDER_UNAVAILABLE:同步插件不可用，请到插件中心检查"));
    };
    const unsubscribe = mobilePluginState.subscribe(check);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    else check();
  });
}
