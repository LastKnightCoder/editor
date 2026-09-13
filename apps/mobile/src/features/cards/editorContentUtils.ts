import type { Descendant } from "slate";
// 仅引入纯函数子模块，避免把协作包入口的 yjs 拖进移动端产物
import { migrateTabsToPanes } from "@tau/collaboration/src/tabs-normalize";
import type { ContentNode } from "@tau/collaboration/src/protocol";
import { getContentLength as sharedGetContentLength } from "@tau/collaboration/src/content-length";

export type EditorDocument = Descendant[];

export const EMPTY_EDITOR_CONTENT: EditorDocument = [
  {
    type: "paragraph",
    children: [{ type: "formatted", text: "" }],
  } as Descendant,
];

export function normalizeEditorContent(content: unknown): EditorDocument {
  if (!Array.isArray(content) || content.length === 0) {
    return EMPTY_EDITOR_CONTENT;
  }
  // 存量 tabs 旧形态（tabsContent）懒迁移为 tab-pane 子节点形态，幂等
  const { content: migrated } = migrateTabsToPanes(content as ContentNode[]);
  return migrated as EditorDocument;
}

// 字数统计已下沉共享包（与桌面端同一口径）
export function getContentLength(value: Descendant[]): number {
  return sharedGetContentLength(value as ContentNode[]);
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
  const normalized = normalizeEditorContent(content);
  if (getContentLength(normalized) > 0) {
    return false;
  }

  let hasStructuredContent = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dfs(normalized, (node: any) => {
    if (typeof node?.type === "string" && node.type !== "paragraph" && node.type !== "formatted") {
      hasStructuredContent = true;
    }
  });
  if (hasStructuredContent) {
    return false;
  }

  if (normalized.length !== 1) {
    return false;
  }
  const first = normalized[0] as {
    type?: string;
    children?: Array<{ type?: string; text?: string }>;
  };
  if (first.type !== "paragraph" || !Array.isArray(first.children)) {
    return false;
  }
  if (first.children.length !== 1) {
    return false;
  }
  const child = first.children[0];
  return child.type === "formatted" && (child.text ?? "").trim() === "";
}
