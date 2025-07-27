import { TextSelectionRange, Rect } from "@/types";

export function addDataIdxToTextLayer(pageElement: HTMLElement) {
  const textLayerElement = pageElement.querySelector(
    ".textLayer",
  ) as HTMLElement;
  if (!textLayerElement) return;

  const textSpans = textLayerElement.querySelectorAll<HTMLElement>("span");
  let currentIndex = 0;

  textSpans.forEach((span) => {
    if (span.textContent && span.textContent.trim()) {
      span.setAttribute("data-idx", String(currentIndex));
      currentIndex++;
    }
  });
}

export function getTextLayerNode(
  pageEl: HTMLElement,
  node: Node,
): HTMLElement | null {
  if (!pageEl.contains(node)) return null;

  if (node instanceof HTMLElement && node.tagName === "SPAN") {
    const textLayer = pageEl.querySelector(".textLayer") as HTMLElement | null;
    if (textLayer && textLayer.contains(node)) {
      return node;
    }
  }

  let n: Node | null = node;
  while ((n = n.parentNode)) {
    if (n === pageEl) return null;
    if (n instanceof HTMLElement && n.tagName === "SPAN") {
      const textLayer = pageEl.querySelector(
        ".textLayer",
      ) as HTMLElement | null;
      if (textLayer && textLayer.contains(n)) {
        return n;
      }
    }
  }

  return null;
}

export function getOffsetInTextLayerNode(
  textSpan: HTMLElement,
  node: Node,
  offsetInNode: number,
): number | null {
  if (!textSpan.contains(node)) return null;

  const document = textSpan.ownerDocument;
  const iterator = document.createNodeIterator(textSpan, NodeFilter.SHOW_TEXT);

  let textNode;
  let offset = offsetInNode;

  while ((textNode = iterator.nextNode()) && node !== textNode) {
    offset += textNode.textContent?.length || 0;
  }

  return offset;
}

export function getTextSelectionRangeFromSelection(
  pageEl: HTMLElement,
  range: Range,
): TextSelectionRange | null {
  if (!range || range.collapsed) return null;

  const startTextSpan = getTextLayerNode(pageEl, range.startContainer);
  const endTextSpan = getTextLayerNode(pageEl, range.endContainer);

  if (!startTextSpan || !endTextSpan) {
    console.warn("Could not find text spans for selection:", {
      startContainer: range.startContainer,
      endContainer: range.endContainer,
      startTextSpan,
      endTextSpan,
    });
    return null;
  }

  const beginIndex = startTextSpan.getAttribute("data-idx");
  const endIndex = endTextSpan.getAttribute("data-idx");

  if (beginIndex === null || endIndex === null) {
    console.warn("Text spans missing data-idx attributes:", {
      startTextSpan,
      endTextSpan,
      beginIndex,
      endIndex,
    });
    return null;
  }

  const beginOffset = getOffsetInTextLayerNode(
    startTextSpan,
    range.startContainer,
    range.startOffset,
  );
  const endOffset = getOffsetInTextLayerNode(
    endTextSpan,
    range.endContainer,
    range.endOffset,
  );

  if (beginOffset === null || endOffset === null) {
    console.warn("Could not calculate offsets:", {
      beginOffset,
      endOffset,
    });
    return null;
  }

  const result = {
    beginIndex: parseInt(beginIndex),
    beginOffset,
    endIndex: parseInt(endIndex),
    endOffset,
  };

  return result;
}

export function restoreSelectionFromTextRange(
  pageEl: HTMLElement,
  textSelection: TextSelectionRange,
): Range | null {
  const { beginIndex, beginOffset, endIndex, endOffset } = textSelection;

  // 找到对应的文本 span
  const startTextSpan = pageEl.querySelector<HTMLElement>(
    `span[data-idx="${beginIndex}"]`,
  );
  const endTextSpan = pageEl.querySelector<HTMLElement>(
    `span[data-idx="${endIndex}"]`,
  );

  if (!startTextSpan || !endTextSpan) return null;

  // 获取文本节点和偏移量
  const startNodeAndOffset = getNodeAndOffsetOfTextPos(
    startTextSpan,
    beginOffset,
  );
  const endNodeAndOffset = getNodeAndOffsetOfTextPos(endTextSpan, endOffset);

  if (!startNodeAndOffset || !endNodeAndOffset) return null;

  // 创建 Range
  const document = pageEl.ownerDocument;
  const range = document.createRange();

  try {
    range.setStart(startNodeAndOffset.node, startNodeAndOffset.offset);
    range.setEnd(endNodeAndOffset.node, endNodeAndOffset.offset);
    return range;
  } catch (error) {
    console.error("Failed to restore text selection:", error);
    return null;
  }
}

function areRectanglesMergeableHorizontally(rect1: Rect, rect2: Rect): boolean {
  const y1 = rect1.top + rect1.height / 2; // 矩形1的垂直中心
  const y2 = rect2.top + rect2.height / 2; // 矩形2的垂直中心
  const threshold = Math.max(rect1.height, rect2.height) * 0.5;
  return Math.abs(y1 - y2) < threshold;
}

function areRectanglesMergeableVertically(rect1: Rect, rect2: Rect): boolean {
  const width1 = rect1.width;
  const width2 = rect2.width;
  const height1 = rect1.height;
  const height2 = rect2.height;
  const threshold = Math.max(width1, width2) * 0.1;

  // 检查左右边界是否接近
  const leftAligned = Math.abs(rect1.left - rect2.left) < threshold;
  const rightAligned =
    Math.abs(rect1.left + rect1.width - (rect2.left + rect2.width)) < threshold;

  // 检查高宽比是否满足条件（近似为字符/单词）
  const aspectRatio1 = height1 / width1;
  const aspectRatio2 = height2 / width2;

  return (
    leftAligned && rightAligned && aspectRatio1 > 0.85 && aspectRatio2 > 0.85
  );
}

function areRectanglesMergeable(rect1: Rect, rect2: Rect): boolean {
  return (
    areRectanglesMergeableHorizontally(rect1, rect2) ||
    areRectanglesMergeableVertically(rect1, rect2)
  );
}

function mergeRectangles(...rects: Rect[]): Rect {
  if (rects.length === 0)
    throw new Error("Cannot merge empty array of rectangles");
  if (rects.length === 1) return rects[0];

  const lefts = rects.map((rect) => rect.left);
  const tops = rects.map((rect) => rect.top);
  const rights = rects.map((rect) => rect.left + rect.width);
  const bottoms = rects.map((rect) => rect.top + rect.height);

  const left = Math.min(...lefts);
  const top = Math.min(...tops);
  const right = Math.max(...rights);
  const bottom = Math.max(...bottoms);

  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
}

function optimizeRects(rects: Rect[]): Rect[] {
  if (rects.length <= 1) return rects;

  const results: Rect[] = [];
  let mergedRect: Rect | null = null;

  for (const rect of rects) {
    // 过滤掉无效的矩形
    if (rect.width <= 0 || rect.height <= 0) continue;

    if (!mergedRect) {
      mergedRect = rect;
    } else {
      const mergeable = areRectanglesMergeable(mergedRect, rect);
      if (mergeable) {
        mergedRect = mergeRectangles(mergedRect, rect);
      } else {
        results.push(mergedRect);
        mergedRect = rect;
      }
    }
  }

  if (mergedRect) results.push(mergedRect);

  return results;
}

export function getHighlightRectsFromTextSelection(
  pageEl: HTMLElement,
  textSelection: TextSelectionRange,
): Rect[] {
  const range = restoreSelectionFromTextRange(pageEl, textSelection);
  if (!range) return [];

  try {
    const clientRects = range.getClientRects();
    const pageRect = pageEl.getBoundingClientRect();

    const rects: Rect[] = [];

    for (let i = 0; i < clientRects.length; i++) {
      const rect = clientRects[i];
      if (rect.width > 0 && rect.height > 0) {
        // 转换为相对于页面的坐标
        rects.push({
          left: rect.left - pageRect.left,
          top: rect.top - pageRect.top,
          width: rect.width,
          height: rect.height,
        });
      }
    }

    return optimizeRects(rects);
  } catch (error) {
    console.error("Failed to get highlight rects:", error);
    return [];
  }
}

function getNodeAndOffsetOfTextPos(
  node: Node,
  offset: number,
): { node: Text; offset: number } | null {
  const iter = document.createNodeIterator(node, NodeFilter.SHOW_TEXT);

  let textNode;
  while (
    (textNode = iter.nextNode()) &&
    offset >= (textNode.textContent?.length || 0)
  ) {
    offset -= textNode.textContent?.length || 0;
    if (offset <= 0) {
      break;
    }
  }

  return textNode ? { node: textNode as Text, offset } : null;
}
