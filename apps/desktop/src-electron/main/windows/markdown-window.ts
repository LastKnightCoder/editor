import { statSync } from "node:fs";
import log from "electron-log";
import { createWindow } from "./create-window";
import { focusExisting, registerWindow, windowsWithPrefix } from "./window-registry";
import { initialBounds, rememberBounds } from "./window-state";
import recentProjectsModule from "../modules/recent-projects";

/**
 * Markdown 文件窗口（磁盘上的文件 / 文件夹，与数据库文档的编辑窗口无关）。
 * path 为文件 → 单文件模式（侧栏显示所在目录）；为文件夹 → 文件夹模式；不传 → 欢迎页。
 */

const PREFIX = "markdown:";

function isDirectoryPath(path: string) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function openMarkdownWindow(path?: string) {
  // 欢迎页每次新开：打开后可能已切到别的文件夹，按空 key 聚焦会找错窗口
  const key = path ? `${PREFIX}${path}` : `${PREFIX}welcome:${Date.now()}`;
  if (focusExisting(key)) return;

  const query = new URLSearchParams();
  if (path) {
    query.set(isDirectoryPath(path) ? "rootPath" : "filePath", path);
    recentProjectsModule.addRecentProject(path);
  }

  const bounds = initialBounds(PREFIX, { width: 1200, height: 800 }, windowsWithPrefix(PREFIX));
  const win = createWindow({
    route: `/markdown-window?${query}`,
    ...bounds,
    minWidth: 640,
    minHeight: 420,
  });
  registerWindow(key, win);
  rememberBounds(PREFIX, win);
  log.info(`打开 Markdown 窗口: ${path || "(欢迎页)"}`);
}
