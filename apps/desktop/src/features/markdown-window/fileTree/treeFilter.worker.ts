/// <reference lib="webworker" />
import {
  buildTreeIndex,
  filterTree,
  type FilterResult,
  type TreeEntry,
  type TreeIndex,
} from "./treeFilter";

/** 文件树筛选 worker：扫描结果只传一次（load），之后每次按键只传 query + 展开状态 */
export type TreeFilterRequest =
  | { type: "load"; rootPath: string; entries: TreeEntry[] }
  | { type: "filter"; id: number; query: string; expanded: string[]; limit: number };

export type TreeFilterResponse = FilterResult & { id: number };

let index: TreeIndex | null = null;

self.onmessage = (event: MessageEvent<TreeFilterRequest>) => {
  const message = event.data;
  if (message.type === "load") {
    index = buildTreeIndex(message.rootPath, message.entries);
    return;
  }
  if (!index) return;
  const result = filterTree(index, message.query, new Set(message.expanded), message.limit);
  self.postMessage({ id: message.id, ...result } satisfies TreeFilterResponse);
};
