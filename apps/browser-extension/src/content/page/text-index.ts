/**
 * 页面纯文本索引：把正文里的文本节点按文档顺序拼成一条字符串，在 Range ↔ 字符偏移之间互转。
 * 标注锚点（TextQuote + TextPosition）与重新定位都基于它。
 */

const SKIP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "TEXTAREA",
  "INPUT",
  "SELECT",
  "TEMPLATE",
]);

export interface TextIndex {
  text: string;
  nodes: Text[];
  /** nodes[i] 在 text 中的起始偏移 */
  starts: number[];
}

export function buildTextIndex(root: Node, exclude?: Element | null): TextIndex {
  const nodes: Text[] = [];
  const starts: number[] = [];
  let text = "";
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
      if (exclude && exclude.contains(parent)) return NodeFilter.FILTER_REJECT;
      return (node as Text).data ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    nodes.push(node as Text);
    starts.push(text.length);
    text += (node as Text).data;
  }
  return { text, nodes, starts };
}

/** 下标都在界内（调用方已判空），取值不会是 undefined */
const startOf = (index: TextIndex, i: number) => index.starts[i] as number;
const nodeOf = (index: TextIndex, i: number) => index.nodes[i] as Text;

/** 二分找包含偏移的文本节点下标 */
function nodeAt(index: TextIndex, offset: number): number {
  let low = 0;
  let high = index.nodes.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (startOf(index, mid) <= offset) low = mid;
    else high = mid - 1;
  }
  return low;
}

/** Range 的一端 → 字符偏移；端点落在元素上时取该位置之后的第一个文本节点 */
function boundaryOffset(index: TextIndex, container: Node, offset: number, isEnd: boolean): number {
  if (container.nodeType === Node.TEXT_NODE) {
    const position = index.nodes.indexOf(container as Text);
    if (position >= 0) return startOf(index, position) + offset;
  }
  const probe = document.createRange();
  probe.setStart(container, offset);
  probe.collapse(true);
  for (let i = 0; i < index.nodes.length; i += 1) {
    if (probe.comparePoint(nodeOf(index, i), 0) >= 0) {
      // 节点在端点之后：起点取它的开头，终点取前一个节点的末尾
      if (!isEnd || i === 0) return startOf(index, i);
      return startOf(index, i - 1) + nodeOf(index, i - 1).data.length;
    }
  }
  return index.text.length;
}

export function rangeToOffsets(
  index: TextIndex,
  range: Range
): { start: number; end: number } | null {
  if (!index.nodes.length) return null;
  const start = boundaryOffset(index, range.startContainer, range.startOffset, false);
  const end = boundaryOffset(index, range.endContainer, range.endOffset, true);
  return end > start ? { start, end } : null;
}

export function offsetsToRange(index: TextIndex, start: number, end: number): Range | null {
  if (!index.nodes.length || start < 0 || end > index.text.length || end <= start) return null;
  const range = document.createRange();
  const a = nodeAt(index, start);
  // 终点落在节点边界上时归到前一个节点末尾，避免高亮多出一个空节点
  const b = nodeAt(index, Math.max(start, end - 1));
  range.setStart(nodeOf(index, a), start - startOf(index, a));
  range.setEnd(nodeOf(index, b), end - startOf(index, b));
  return range;
}
