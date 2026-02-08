import type { Highlight } from "./types";
import { HIGHLIGHT_BG_COLORS, HIGHLIGHT_COLORS } from "./types";
import { deserializeRange } from "./serialization";

const MARK_ATTR = "data-tau-highlight-id";

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

    // Handle partial selection at start
    if (textNode === range.startContainer && range.startOffset > 0) {
      targetNode = textNode.splitText(range.startOffset);
    }

    // Handle partial selection at end
    if (textNode === range.endContainer && range.endOffset < textNode.length) {
      targetNode.splitText(
        range.endOffset -
          (textNode === range.startContainer ? range.startOffset : 0),
      );
    } else if (targetNode !== textNode && range.endContainer === textNode) {
      // If we split at start and end container is same node
      targetNode.splitText(range.endOffset - range.startOffset);
    }

    const mark = document.createElement("mark");
    mark.setAttribute(MARK_ATTR, id);
    mark.className = getStyleClass(style);
    applyInlineStyle(mark, style, color);

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
  }
}

function applyInlineStyle(
  mark: HTMLElement,
  style: Highlight["style"],
  color: Highlight["color"],
): void {
  if (style === "marker") {
    mark.style.backgroundColor = HIGHLIGHT_BG_COLORS[color];
  } else {
    mark.style.backgroundColor = "transparent";
    mark.style.textDecorationColor = HIGHLIGHT_COLORS[color];
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
`;
  document.head.appendChild(style);
}
