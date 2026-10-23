// 「打开文档时」偏好：读 setting.json 的 editor.openMode（经设置桥快照，无需 AppContext）。
import { useSyncExternalStore } from "react";
import type { SettingCompat } from "../types";
import {
  getMobileSettingByPath,
  subscribeMobileSettingSnapshot,
} from "../services/mobileSettingsBridge";

export type EditorOpenMode = NonNullable<NonNullable<SettingCompat["editor"]>["openMode"]>;

export const EDITOR_OPEN_MODE_PATH = "editor.openMode";

/** 只有显式的 edit 才直接编辑，缺省与非法值一律为 read */
export function normalizeEditorOpenMode(value: unknown): EditorOpenMode {
  return value === "edit" ? "edit" : "read";
}

function readEditorOpenMode(): EditorOpenMode {
  return normalizeEditorOpenMode(getMobileSettingByPath(EDITOR_OPEN_MODE_PATH));
}

/** 返回新设置对象，其余字段保持不变 */
export function withEditorOpenMode(
  setting: SettingCompat,
  openMode: EditorOpenMode
): SettingCompat {
  return { ...setting, editor: { ...setting.editor, openMode } };
}

export function useEditorOpenMode(): EditorOpenMode {
  return useSyncExternalStore(
    subscribeMobileSettingSnapshot,
    readEditorOpenMode,
    readEditorOpenMode
  );
}

export default useEditorOpenMode;
