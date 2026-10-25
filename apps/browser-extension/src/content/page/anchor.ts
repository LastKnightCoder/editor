/**
 * 标注锚点：创建时记下原文、前后文与字符偏移；重新定位时先按偏移精确核对，
 * 对不上再在全文里找原文，用前后文相似度与离原位置的距离挑最可能的一处。
 */
import type { WebAnchor } from "@tau/shared/browser-companion";
import { offsetsToRange, rangeToOffsets, type TextIndex } from "./text-index";

export const CONTEXT_CHARS = 32;

export function createAnchor(index: TextIndex, range: Range): WebAnchor | null {
  const offsets = rangeToOffsets(index, range);
  if (!offsets) return null;
  const { start, end } = offsets;
  return {
    quote: {
      exact: index.text.slice(start, end),
      prefix: index.text.slice(Math.max(0, start - CONTEXT_CHARS), start),
      suffix: index.text.slice(end, end + CONTEXT_CHARS),
    },
    position: { start, end },
  };
}

/** 两段文字从相邻一侧开始的公共字符数（前文从尾部比，后文从头部比） */
const commonFromEnd = (a: string, b: string) => {
  let count = 0;
  while (
    count < a.length &&
    count < b.length &&
    a[a.length - 1 - count] === b[b.length - 1 - count]
  )
    count += 1;
  return count;
};
const commonFromStart = (a: string, b: string) => {
  let count = 0;
  while (count < a.length && count < b.length && a[count] === b[count]) count += 1;
  return count;
};

const MAX_CANDIDATES = 200;

export function locateAnchor(
  index: TextIndex,
  anchor: WebAnchor
): { start: number; end: number } | null {
  const { exact, prefix, suffix } = anchor.quote;
  if (!exact) return null;
  const { start, end } = anchor.position;
  if (index.text.slice(start, end) === exact) return { start, end };

  let best: { start: number; score: number } | null = null;
  let from = 0;
  for (let found = 0; found < MAX_CANDIDATES; found += 1) {
    const at = index.text.indexOf(exact, from);
    if (at < 0) break;
    const context =
      commonFromEnd(index.text.slice(Math.max(0, at - prefix.length), at), prefix) +
      commonFromStart(
        index.text.slice(at + exact.length, at + exact.length + suffix.length),
        suffix
      );
    // 前后文每个字符权重远高于距离，距离只用来在同分时挑近的
    const score = context * 1000 - Math.min(999, Math.abs(at - start) / 100);
    if (!best || score > best.score) best = { start: at, score };
    from = at + 1;
  }
  return best ? { start: best.start, end: best.start + exact.length } : null;
}

export function anchorToRange(index: TextIndex, anchor: WebAnchor): Range | null {
  const located = locateAnchor(index, anchor);
  return located ? offsetsToRange(index, located.start, located.end) : null;
}
