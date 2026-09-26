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
