import type { Descendant } from "slate";
import { mobileContentMetrics } from "../../app/plugins/content";
import { isContentEmpty } from "@tau/db-schema/content-metrics";

export type EditorDocument = Descendant[];

export const EMPTY_EDITOR_CONTENT: EditorDocument = [
  {
    type: "paragraph",
    children: [{ type: "formatted", text: "" }],
  } as Descendant,
];

/** 每次返回独立副本：slate-react 的节点→路径映射是模块级 WeakMap，
    同屏两个编辑器共享同一份初始节点对象会互相覆盖映射，渲染时 findPath 崩溃 */
export function createEmptyEditorContent(): EditorDocument {
  return JSON.parse(JSON.stringify(EMPTY_EDITOR_CONTENT)) as EditorDocument;
}

export function normalizeEditorContent(content: unknown): EditorDocument {
  if (!Array.isArray(content) || content.length === 0) {
    return EMPTY_EDITOR_CONTENT;
  }
  return content as EditorDocument;
}

// 与保存及协作投影共用当前插件快照。
export function getContentLength(value: readonly unknown[]): number {
  return mobileContentMetrics.count(value);
}

export function dfs(nodes: Descendant[], visit: (node: Descendant) => void) {
  for (const node of nodes) {
    visit(node);
    if ("children" in node && Array.isArray(node.children)) {
      dfs(node.children as Descendant[], visit);
    }
  }
}

export function isEditorContentEmpty(content: unknown): boolean {
  return isContentEmpty(content);
}
