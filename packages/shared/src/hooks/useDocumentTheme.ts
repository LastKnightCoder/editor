import { useSyncExternalStore } from "react";

/**
 * 订阅 <html> 上的主题属性（data-theme / data-mode / .dark）。
 * 取色型渲染器（mermaid 等）在属性变化后读 --tau-*，此时 DOM 已更新，取到的必是新值。
 */
const readSignature = () => {
  if (typeof document === "undefined") return "";
  const root = document.documentElement;
  return `${root.dataset.theme ?? ""}|${root.dataset.mode ?? ""}|${root.classList.contains("dark")}`;
};

const noop = () => undefined;

const subscribe = (listener: () => void) => {
  if (typeof MutationObserver === "undefined") return noop;
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "data-mode", "data-theme"],
  });
  return () => observer.disconnect();
};

/** 返回当前文档主题签名，主题族或明暗变化时更新 */
export const useDocumentTheme = (): string =>
  useSyncExternalStore(subscribe, readSignature, () => "");
