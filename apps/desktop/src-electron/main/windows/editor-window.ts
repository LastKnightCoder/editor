import type { EditorWindowKind, EditorWindowTarget } from "@tau/platform";
import log from "electron-log";
import { createWindow } from "./create-window";
import { findWindow, focusExisting, registerWindow, windowsWithPrefix } from "./window-registry";
import { initialBounds, rememberBounds } from "./window-state";

/** 内容编辑窗口：卡片 / 文章 / 项目文档共用一个渲染页（/editor-window），按 kind 适配 */

const DEFAULT_SIZE: Record<EditorWindowKind, { width: number; height: number }> = {
  card: { width: 560, height: 680 },
  article: { width: 1040, height: 720 },
  "project-item": { width: 1040, height: 720 },
};

const PREFIX = "editor:";
const windowKey = ({ kind, databaseName, id }: EditorWindowTarget) =>
  `${PREFIX}${kind}:${databaseName}:${id}`;

export function openEditorWindow(target: EditorWindowTarget) {
  const key = windowKey(target);
  if (focusExisting(key)) return;

  const stateKey = `${PREFIX}${target.kind}`;
  const bounds = initialBounds(stateKey, DEFAULT_SIZE[target.kind], windowsWithPrefix(PREFIX));
  const query = new URLSearchParams({
    kind: target.kind,
    db: target.databaseName,
    id: String(target.id),
  });
  const win = createWindow({
    route: `/editor-window?${query}`,
    ...bounds,
    minWidth: 480,
    minHeight: 400,
  });
  registerWindow(key, win);
  rememberBounds(stateKey, win);
  log.info(`打开编辑窗口: ${key}`);
}

export function closeEditorWindow(target: EditorWindowTarget) {
  findWindow(windowKey(target))?.close();
}
