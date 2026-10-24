import type { Descendant } from "slate";
import { desktopContentMetrics } from "../../shared/content-metrics";
export { isContentEmpty, countTextWords } from "@tau/db-schema/content-metrics";

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

// 统计与持久化共用宿主的扩展声明快照。
export const getContentLength = (value: Descendant[]): number => desktopContentMetrics.count(value);
