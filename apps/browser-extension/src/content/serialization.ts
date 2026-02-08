import type { SerializedRange } from "./types";

/**
 * Generate an XPath for a given node relative to document.body.
 */
function getXPath(node: Node): string {
  if (node === document.body) return "/html/body";

  const parent = node.parentNode;
  if (!parent) return "";

  const parentPath = getXPath(parent);

  if (node.nodeType === Node.TEXT_NODE) {
    // Count text node index among siblings
    let textIndex = 0;
    for (const child of Array.from(parent.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        textIndex++;
        if (child === node) break;
      }
    }
    return `${parentPath}/text()[${textIndex}]`;
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as Element;
    const tagName = el.tagName.toLowerCase();
    let sameTagIndex = 0;
    let totalSameTag = 0;

    for (const child of Array.from(parent.childNodes)) {
      if (
        child.nodeType === Node.ELEMENT_NODE &&
        (child as Element).tagName.toLowerCase() === tagName
      ) {
        totalSameTag++;
        if (child === node) sameTagIndex = totalSameTag;
      }
    }

    if (totalSameTag === 1) {
      return `${parentPath}/${tagName}`;
    }
    return `${parentPath}/${tagName}[${sameTagIndex}]`;
  }

  return parentPath;
}

/**
 * Resolve an XPath string back to a DOM node.
 */
function resolveXPath(xpath: string): Node | null {
  // 兼容旧数据：将 /body 开头的路径补全为 /html/body
  let normalizedXPath = xpath;
  if (normalizedXPath.startsWith("/body")) {
    normalizedXPath = "/html" + normalizedXPath;
  }
  try {
    const result = document.evaluate(
      normalizedXPath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    );
    return result.singleNodeValue;
  } catch {
    return null;
  }
}

/**
 * Serialize a browser Range into a storable format.
 */
export function serializeRange(range: Range): SerializedRange {
  return {
    startXPath: getXPath(range.startContainer),
    startOffset: range.startOffset,
    endXPath: getXPath(range.endContainer),
    endOffset: range.endOffset,
    text: range.toString(),
  };
}

/**
 * Deserialize a stored range back into a browser Range.
 * Returns null if the nodes can't be found or text doesn't match.
 */
export function deserializeRange(sr: SerializedRange): Range | null {
  const startNode = resolveXPath(sr.startXPath);
  const endNode = resolveXPath(sr.endXPath);

  if (!startNode || !endNode) return null;

  try {
    const range = document.createRange();
    range.setStart(startNode, sr.startOffset);
    range.setEnd(endNode, sr.endOffset);

    // Validate text content matches
    const currentText = range.toString();
    if (currentText !== sr.text) {
      console.warn("[tau-highlight] Text mismatch, skipping restore:", {
        expected: sr.text,
        got: currentText,
      });
      return null;
    }

    return range;
  } catch (e) {
    console.warn("[tau-highlight] Failed to deserialize range:", e);
    return null;
  }
}
