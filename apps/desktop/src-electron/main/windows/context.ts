import path from "node:path";
import type { BrowserWindow } from "electron";
import log from "electron-log";

/** 所有窗口共用的加载上下文：开发服务器地址 / 生产 index.html / preload 脚本 */
interface WindowContext {
  devServerUrl: string;
  indexHtml: string;
  preload: string;
  icon: string;
}

let context: WindowContext | null = null;

export function configureWindowContext(options: {
  devServerUrl: string;
  rendererDist: string;
  preload: string;
}) {
  context = {
    devServerUrl: options.devServerUrl,
    indexHtml: path.join(options.rendererDist, "index.html"),
    preload: options.preload,
    icon: path.join(path.dirname(options.preload), "../../build/icon.png"),
  };
}

export function windowContext(): WindowContext {
  if (!context) throw new Error("窗口上下文未初始化：须先调用 configureWindowContext");
  return context;
}

export const isDev = () => Boolean(windowContext().devServerUrl);

/** 按 hash 路由加载渲染页；route 为空串即应用根（主窗口） */
export function loadRoute(win: BrowserWindow, route: string) {
  const { devServerUrl, indexHtml } = windowContext();
  const task = devServerUrl
    ? win.loadURL(route ? `${devServerUrl}#${route}` : devServerUrl)
    : win.loadFile(indexHtml, route ? { hash: route } : undefined);
  task.catch(error => log.error(`窗口加载失败 ${route || "/"}:`, error));
}

export function loadContentRuntime(win: BrowserWindow) {
  const { devServerUrl, indexHtml } = windowContext();
  const task = devServerUrl
    ? win.loadURL(new URL("content-runtime.html", devServerUrl).href)
    : win.loadFile(path.join(path.dirname(indexHtml), "content-runtime.html"));
  task.catch(error => log.error("内容转换进程加载失败", error));
}
