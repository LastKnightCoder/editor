import { useEffect, useMemo } from "react";
import { isElectron } from "@/electron";

/**
 * HTML 预览 URL 的环境适配：
 * Electron webview 支持 data URL（避免 Blob 跨 session 丢失），
 * 浏览器侧 data URL 会被部分浏览器拦截顶层导航，使用 Blob URL。
 */

/** 按环境生成预览 URL；配套 disposeHtmlPreviewUrl 释放 */
export function createHtmlPreviewUrl(html: string): string {
  if (!html) {
    return "";
  }
  if (isElectron) {
    return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  }
  return URL.createObjectURL(new Blob([html], { type: "text/html" }));
}

/** 释放预览 URL（data URL 无需清理，Blob URL 必须 revoke 防泄漏） */
export function disposeHtmlPreviewUrl(url: string): void {
  if (!isElectron && url.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}

/** 组件内使用：html 变化重建 URL，卸载/替换时自动释放 Blob URL */
export function useHtmlPreviewUrl(html: string): string {
  const url = useMemo(() => createHtmlPreviewUrl(html), [html]);
  useEffect(() => {
    return () => {
      disposeHtmlPreviewUrl(url);
    };
  }, [url]);
  return url;
}
