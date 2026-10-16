import { shell, type WindowOpenHandlerResponse } from "electron";

/**
 * 渲染端 window.open / target="_blank"：http(s) 交给系统浏览器，其余一律拒绝。
 * 不创建子窗口——子窗口会继承主窗口的 preload 与 IPC 能力。
 */
export function routeWindowOpen({ url }: { url: string }): WindowOpenHandlerResponse {
  if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
  return { action: "deny" };
}
