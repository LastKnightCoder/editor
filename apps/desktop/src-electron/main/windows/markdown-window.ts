import { screen } from "electron";
import log from "electron-log";
import { createWindow } from "./create-window";
import { focusExisting, registerWindow } from "./window-registry";

/** Markdown 文件编辑窗口（磁盘文件 / 文件夹，与数据库文档的编辑窗口无关） */

export interface MarkdownWindowParams {
  filePath?: string;
  rootPath?: string;
  showTitlebar?: boolean;
  isDefaultTop?: boolean;
}

export function openMarkdownWindow({
  filePath,
  rootPath,
  showTitlebar = false,
  isDefaultTop = false,
}: MarkdownWindowParams) {
  const target = filePath || rootPath || "";
  const key = `markdown:${target}`;
  if (focusExisting(key)) return;

  const query = new URLSearchParams({
    showTitlebar: String(showTitlebar),
    isDefaultTop: String(isDefaultTop),
  });
  if (filePath) query.set("filePath", filePath);
  else if (rootPath) query.set("rootPath", rootPath);

  // 占满光标所在屏：文件树 + 编辑区需要大画布
  const { bounds } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const win = createWindow({
    route: `/single-markdown-editor?${query}`,
    // Windows 下该页面依赖系统标题栏（页面内未自绘三键）
    chrome: process.platform === "win32" ? "native" : "custom",
    ...bounds,
  });
  win.setAlwaysOnTop(isDefaultTop);
  registerWindow(key, win);
  log.info(`打开 Markdown 窗口: ${target || "(空)"}`);
}
