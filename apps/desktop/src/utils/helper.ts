import type { Descendant } from "slate";
import type { ContentNode } from "@tau/collaboration/src/protocol";
import { getContentLength as sharedGetContentLength } from "@tau/collaboration/src/content-length";

export const dfs = (editor: Descendant[], visit: (node: Descendant) => any) => {
  for (const node of editor) {
    visit(node);
    // @ts-ignore
    if (node.children && node.children.length > 0) {
      // @ts-ignore
      dfs(node.children, visit);
    }
  }
};

// 字数统计已下沉共享包（与移动端同一口径，此前两端手抄实现靠注释对齐）
export const getContentLength = (value: Descendant[]): number =>
  sharedGetContentLength(value as ContentNode[]);
