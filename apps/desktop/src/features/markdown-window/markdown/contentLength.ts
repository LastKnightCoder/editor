import type { Descendant } from "slate";
import { getContentLength } from "@/utils/helper";
import { desktopContentMetrics } from "../../../../shared/content-metrics";

/** 只缓存 Slate 不可变节点；未修改的块复用已有统计。 */
export function createContentLengthCounter() {
  let cache = new WeakMap<Descendant, number>();
  let revision = desktopContentMetrics.revision;
  return (content: readonly Descendant[]): number => {
    if (revision !== desktopContentMetrics.revision) {
      cache = new WeakMap();
      revision = desktopContentMetrics.revision;
    }
    return content.reduce((total, node) => {
      let length = cache.get(node);
      if (length === undefined) {
        length = getContentLength([node]);
        cache.set(node, length);
      }
      return total + length;
    }, 0);
  };
}
