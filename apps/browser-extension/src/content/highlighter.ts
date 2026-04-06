import type { Highlight } from "./types";
import {
  HIGHLIGHT_BG_COLORS,
  HIGHLIGHT_BG_COLORS_DARK,
  HIGHLIGHT_COLORS,
  HIGHLIGHT_COLORS_DARK,
} from "./types";
import { deserializeRange } from "./serialization";

const MARK_ATTR = "data-tau-highlight-id";

/**
 * 检测指定节点所在位置的背景是否为暗色。
 * 从节点向上遍历 DOM 树，找到第一个具有非透明背景色的元素，
 * 根据加权亮度公式判断是否为暗色背景。
 */
function isDarkBackground(node: Node): boolean {
  let el = node instanceof Element ? node : node.parentElement;
  while (el) {
    const bg = getComputedStyle(el).backgroundColor;
    const match = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (match) {
      const alpha = match[4] !== undefined ? parseFloat(match[4]) : 1;
      if (alpha > 0.1) {
        const r = parseInt(match[1]);
        const g = parseInt(match[2]);
        const b = parseInt(match[3]);
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance < 0.5;
      }
    }
    el = el.parentElement;
  }
  return false;
}

/**
 * Get all text nodes within a Range.
 */
function getTextNodesInRange(range: Range): Text[] {
  const textNodes: Text[] = [];

  // 当 commonAncestorContainer 是文本节点时，TreeWalker.nextNode()
  // 不会访问根节点本身，需要使用其父元素作为遍历起点
  let root: Node = range.commonAncestorContainer;
  if (root.nodeType === Node.TEXT_NODE) {
    root = root.parentNode!;
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const nodeRange = document.createRange();
      nodeRange.selectNodeContents(node);
      if (
        range.compareBoundaryPoints(Range.END_TO_START, nodeRange) < 0 &&
        range.compareBoundaryPoints(Range.START_TO_END, nodeRange) > 0
      ) {
        return NodeFilter.FILTER_ACCEPT;
      }
      return NodeFilter.FILTER_REJECT;
    },
  });

  let node: Node | null;
  while ((node = walker.nextNode())) {
    textNodes.push(node as Text);
  }
  return textNodes;
}

/**
 * Apply a highlight to the page DOM by wrapping text nodes with <mark>.
 */
export function applyHighlight(
  highlight: Highlight,
  range: Range,
): HTMLElement[] {
  const { id, style, color } = highlight;
  const marks: HTMLElement[] = [];
  const textNodes = getTextNodesInRange(range);

  for (const textNode of textNodes) {
    const parent = textNode.parentNode;
    if (!parent) continue;

    // Skip if already inside a tau highlight mark
    if ((parent as Element).closest?.(`mark[${MARK_ATTR}]`)) continue;

    let targetNode: Text = textNode;
    const isStartNode = textNode === range.startContainer;
    const isEndNode = textNode === range.endContainer;
    const startOffset = isStartNode ? range.startOffset : 0;
    const endOffset = isEndNode ? range.endOffset : textNode.length;

    // 先切右边界，再切左边界，避免同一 text node 上 start split 之后
    // Range 的 endContainer 漂移，导致把选区右侧文本一并包进高亮。
    if (isEndNode && endOffset < textNode.length) {
      textNode.splitText(endOffset);
    }

    if (isStartNode && startOffset > 0) {
      targetNode = textNode.splitText(startOffset);
    }

    const dark = isDarkBackground(textNode);
    const mark = document.createElement("mark");
    mark.setAttribute(MARK_ATTR, id);
    mark.className = getStyleClass(style);
    applyInlineStyle(mark, style, color, dark);

    parent.insertBefore(mark, targetNode);
    mark.appendChild(targetNode);
    marks.push(mark);
  }

  return marks;
}

function getStyleClass(style: Highlight["style"]): string {
  switch (style) {
    case "marker":
      return "tau-marker";
    case "wavy":
      return "tau-wavy";
    case "straight":
      return "tau-straight";
    case "dashed":
      return "tau-dashed";
  }
}

function applyInlineStyle(
  mark: HTMLElement,
  style: Highlight["style"],
  color: Highlight["color"],
  isDark: boolean,
): void {
  if (style === "marker") {
    const bgColors = isDark ? HIGHLIGHT_BG_COLORS_DARK : HIGHLIGHT_BG_COLORS;
    mark.style.backgroundColor = bgColors[color];
  } else {
    mark.style.backgroundColor = "transparent";
    const lineColors = isDark ? HIGHLIGHT_COLORS_DARK : HIGHLIGHT_COLORS;
    mark.style.textDecorationColor = lineColors[color];
  }
}

/**
 * 更新已有高亮的外观（样式/颜色），先移除旧 mark 再重新应用。
 */
export function updateHighlightAppearance(highlight: Highlight): boolean {
  removeHighlight(highlight.id);
  const range = deserializeRange(highlight.range);
  if (!range) return false;
  applyHighlight(highlight, range);
  return true;
}

/**
 * Remove a highlight from the page DOM, restoring original text nodes.
 */
export function removeHighlight(id: string): void {
  const marks = document.querySelectorAll(`mark[${MARK_ATTR}="${id}"]`);
  marks.forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) {
      parent.insertBefore(mark.firstChild, mark);
    }
    parent.removeChild(mark);
    parent.normalize();
  });
}

/**
 * Restore all highlights from stored data on page load.
 */
export function restoreAllHighlights(highlights: Highlight[]): void {
  for (const highlight of highlights) {
    const range = deserializeRange(highlight.range);
    if (!range) continue;
    applyHighlight(highlight, range);
  }
}

/**
 * Inject highlight CSS styles into the page <head>.
 */
export function injectHighlightStyles(): void {
  if (document.getElementById("tau-highlight-styles")) return;

  const style = document.createElement("style");
  style.id = "tau-highlight-styles";
  style.textContent = `
mark[${MARK_ATTR}] {
  cursor: pointer;
  border-radius: 2px;
  padding: 0;
  margin: 0;
  color: inherit;
}
mark[${MARK_ATTR}].tau-wavy {
  background: transparent;
  text-decoration-style: wavy;
  text-decoration-line: underline;
  text-underline-offset: 3px;
  text-decoration-thickness: 2px;
}
mark[${MARK_ATTR}].tau-straight {
  background: transparent;
  text-decoration-style: solid;
  text-decoration-line: underline;
  text-underline-offset: 3px;
  text-decoration-thickness: 2px;
}
mark[${MARK_ATTR}].tau-dashed {
  background: transparent;
  text-decoration-style: dashed;
  text-decoration-line: underline;
  text-underline-offset: 3px;
  text-decoration-thickness: 1.5px;
}
`;
  document.head.appendChild(style);
}
