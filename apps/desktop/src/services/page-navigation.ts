import type { Navigator } from "@/page/PageProvider";
import type { StackMachineState } from "@/page/core/stackMachine";
import { getPageMeta } from "@/page/core/pageMeta";
import { sanitizeParams } from "@/page/core/paramsSchema";

export interface PageNavigationRuntime {
  navigator: Navigator;
  state: StackMachineState;
}

let readRuntime: (() => PageNavigationRuntime) | undefined;

export function bindPageNavigation(read: () => PageNavigationRuntime) {
  readRuntime = read;
  return () => {
    if (readRuntime === read) readRuntime = undefined;
  };
}

export function getPageNavigation(): PageNavigationRuntime {
  if (!readRuntime) throw new Error("主窗口页面尚未就绪，请稍后重试");
  return readRuntime();
}

export function openPage(key: string, params?: Record<string, unknown>) {
  const runtime = getPageNavigation();
  const meta = getPageMeta(key);
  if (!meta || meta.status === "legacy") throw new Error("该页面尚未实现");
  const clean = sanitizeParams(meta.fields, params);
  if (!clean) throw new Error("页面参数无效");
  runtime.navigator.push(key, clean);
}

/* ---------- 辅助窗口 → 主窗口：请求打开页面 ---------- */

const OPEN_PAGE_CHANNEL = "tau-open-page";

/** 小窗等辅助窗口请求主窗口打开页面（调用方先经 platform.window.showAndFocus 把主窗口带到前台） */
export function requestOpenPageInMainWindow(key: string) {
  const channel = new BroadcastChannel(OPEN_PAGE_CHANNEL);
  channel.postMessage({ key });
  channel.close();
}

/**
 * 主窗口监听打开请求。多个主窗口同时在时只由获得焦点的那个响应：
 * 聚焦可能晚于消息到达，未聚焦时等一次 focus（1.5s 内）。
 */
export function listenOpenPageRequests(): () => void {
  const channel = new BroadcastChannel(OPEN_PAGE_CHANNEL);
  let pending: (() => void) | null = null;
  const open = (key: string) => {
    try {
      openPage(key);
    } catch (error) {
      console.warn("辅助窗口请求打开页面失败:", error);
    }
  };
  channel.onmessage = event => {
    const key = (event.data as { key?: unknown } | null)?.key;
    if (typeof key !== "string") return;
    pending?.();
    if (document.hasFocus()) return open(key);
    const onFocus = () => {
      pending?.();
      open(key);
    };
    const timer = window.setTimeout(() => pending?.(), 1500);
    window.addEventListener("focus", onFocus, { once: true });
    pending = () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
      pending = null;
    };
  };
  return () => {
    pending?.();
    channel.close();
  };
}
