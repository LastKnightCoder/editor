import type { Descendant } from "slate";
import { getContentLength } from "@/utils/helper";

/** 只缓存 Slate 不可变节点；未修改的块复用已有统计。 */
export function createContentLengthCounter() {
  const cache = new WeakMap<Descendant, number>();
  return (content: readonly Descendant[]): number =>
    content.reduce((total, node) => {
      let length = cache.get(node);
      if (length === undefined) {
        length = getContentLength([node]);
        cache.set(node, length);
      }
      return total + length;
    }, 0);
}
