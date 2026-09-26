/**
 * 辅助窗口 → 主窗口：请求打开页面 / 内容（BroadcastChannel，同源窗口共享）。
 * 调用方先经 platform.window.showAndFocus 把主窗口带到前台。
 */

import { openContent } from "./open-content";
import { openPage } from "./page-navigation";

const CHANNEL = "tau-open-page";

type OpenRequest = { key: string } | { content: { type: string; id: number } };

function post(request: OpenRequest) {
  const channel = new BroadcastChannel(CHANNEL);
  channel.postMessage(request);
  channel.close();
}

/** 打开页面（如番茄小窗回到专注页） */
export function requestOpenPageInMainWindow(key: string) {
  post({ key });
}

/** 打开内容详情（卡片 / 文章 / 项目文档，口径同 openContent） */
export function requestOpenContentInMainWindow(type: string, id: number) {
  post({ content: { type, id } });
}

async function handle(request: OpenRequest) {
  try {
    if ("key" in request) openPage(request.key);
    else await openContent(request.content.type, request.content.id);
  } catch (error) {
    console.warn("辅助窗口请求打开失败:", error);
  }
}

function isOpenRequest(data: unknown): data is OpenRequest {
  if (!data || typeof data !== "object") return false;
  const value = data as Record<string, unknown>;
  if (typeof value.key === "string") return true;
  const content = value.content as Record<string, unknown> | undefined;
  return typeof content?.type === "string" && typeof content.id === "number";
}

/**
 * 主窗口监听打开请求。多个主窗口同时在时只由获得焦点的那个响应：
 * 聚焦可能晚于消息到达，未聚焦时等一次 focus（1.5s 内）。
 */
export function listenMainWindowRequests(): () => void {
  const channel = new BroadcastChannel(CHANNEL);
  let pending: (() => void) | null = null;
  channel.onmessage = event => {
    const request: unknown = event.data;
    if (!isOpenRequest(request)) return;
    pending?.();
    if (document.hasFocus()) return void handle(request);
    const onFocus = () => {
      pending?.();
      void handle(request);
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
