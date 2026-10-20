import fs from "node:fs";
import path from "node:path";
import { app, screen, type BrowserWindow, type Rectangle } from "electron";
import log from "electron-log";

/**
 * 窗口尺寸 / 位置记忆：按 key（如 "editor:card"）存最近一次关闭时的常规态 bounds。
 * 新窗口若与同类窗口重叠，按级联偏移错开。
 */

const CASCADE_OFFSET = 28;

type BoundsStore = Record<string, Rectangle>;

let cache: BoundsStore | null = null;

const storeFile = () => path.join(app.getPath("userData"), "window-state.json");

function readStore(): BoundsStore {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(storeFile(), "utf-8")) as BoundsStore;
  } catch {
    cache = {};
  }
  return cache;
}

function writeStore(store: BoundsStore) {
  cache = store;
  fs.promises
    .writeFile(storeFile(), JSON.stringify(store, null, 2))
    .catch(error => log.warn("保存窗口位置失败:", error));
}

/** bounds 至少一半落在某块屏幕的工作区内才可复用（外接屏拔掉后不把窗口开到屏外） */
function isOnScreen(bounds: Rectangle) {
  const area = screen.getDisplayMatching(bounds).workArea;
  const overlapW =
    Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x);
  const overlapH =
    Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y);
  return overlapW >= bounds.width / 2 && overlapH >= bounds.height / 2;
}

/** 从 anchor 位置起按级联偏移找一个不与 occupied 左上角重合的位置，越出工作区回绕到左上 */
function cascade(anchor: Rectangle, occupied: Rectangle[]): Rectangle {
  const area = screen.getDisplayMatching(anchor).workArea;
  const next = { ...anchor };
  const taken = (b: Rectangle) => occupied.some(o => o.x === b.x && o.y === b.y);
  for (let i = 0; i < 50 && taken(next); i++) {
    next.x += CASCADE_OFFSET;
    next.y += CASCADE_OFFSET;
    if (next.x + next.width > area.x + area.width || next.y + next.height > area.y + area.height) {
      next.x = area.x + CASCADE_OFFSET;
      next.y = area.y + CASCADE_OFFSET;
    }
  }
  return next;
}

/**
 * 计算新窗口的初始 bounds：
 * 优先沿用 key 的记忆尺寸与位置；无记忆则在光标所在屏居中；再与已开的同类窗口错开。
 */
export function initialBounds(
  key: string,
  defaults: { width: number; height: number },
  siblings: BrowserWindow[]
): Rectangle {
  const saved = readStore()[key];
  let bounds: Rectangle;
  if (saved && isOnScreen(saved)) {
    bounds = saved;
  } else {
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    const width = Math.min(saved?.width ?? defaults.width, area.width);
    const height = Math.min(saved?.height ?? defaults.height, area.height);
    bounds = {
      width,
      height,
      x: Math.round(area.x + (area.width - width) / 2),
      y: Math.round(area.y + (area.height - height) / 2),
    };
  }
  return cascade(
    bounds,
    siblings.filter(win => !win.isDestroyed()).map(win => win.getBounds())
  );
}

export function hasRememberedBounds(key: string) {
  return Boolean(readStore()[key]);
}

/** 关闭时记下常规态 bounds（最大化 / 全屏时取还原后的尺寸） */
export function rememberBounds(key: string, win: BrowserWindow) {
  win.on("close", () => {
    if (win.isDestroyed()) return;
    writeStore({ ...readStore(), [key]: win.getNormalBounds() });
  });
}
