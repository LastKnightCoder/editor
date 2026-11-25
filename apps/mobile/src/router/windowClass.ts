import { useSyncExternalStore } from "react";

/**
 * 窗口档位：只看当前窗口宽度，不看设备型号（iPad 分屏 1/3 比手机还窄）。
 * 断点与 styles.css 的 medium / wide 断点是同一组值。
 */
export type WindowClass = "compact" | "medium" | "wide";

export const MEDIUM_MIN_WIDTH = 600;
export const WIDE_MIN_WIDTH = 840;

const MEDIUM_QUERY = `(min-width: ${MEDIUM_MIN_WIDTH}px)`;
const WIDE_QUERY = `(min-width: ${WIDE_MIN_WIDTH}px)`;

function matches(query: string): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(query).matches
    : false;
}

export function readWindowClass(): WindowClass {
  if (matches(WIDE_QUERY)) return "wide";
  if (matches(MEDIUM_QUERY)) return "medium";
  return "compact";
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => undefined;
  }
  const lists = [window.matchMedia(MEDIUM_QUERY), window.matchMedia(WIDE_QUERY)];
  lists.forEach(list => list.addEventListener("change", onChange));
  return () => lists.forEach(list => list.removeEventListener("change", onChange));
}

/** 壳层与浮层组件用：页面与插件排版用容器查询，不读档位 */
export function useWindowClass(): WindowClass {
  return useSyncExternalStore(subscribe, readWindowClass, () => "compact");
}
