/**
 * 上下文提取工具
 * 从 DOM Range 和页面全文中提取与选中文字相关的上下文信息，
 * 供 AI 问书功能构建 System Prompt 使用。
 */

const BLOCK_TAGS = new Set([
  "P",
  "DIV",
  "SECTION",
  "ARTICLE",
  "LI",
  "BLOCKQUOTE",
  "TD",
  "TH",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "MAIN",
  "ASIDE",
  "DETAILS",
  "FIGCAPTION",
]);

/**
 * 从 DOM Range 提取选中文字的段落上下文。
 * 策略：向上找到最近的块级祖先元素，取其完整文本，
 * 再在选中文字前后各扩展 windowSize 字符作为上下文窗口。
 */
export function extractSelectionContext(
  range: Range,
  windowSize = 500,
): string {
  // 找到包含选区的最近块级元素
  let node: Node | null = range.commonAncestorContainer;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;

  let block = node as HTMLElement;
  while (block.parentElement && !BLOCK_TAGS.has(block.tagName)) {
    block = block.parentElement;
  }

  // 提取块元素文本，定位选中文字
  const fullText = block.innerText;
  const selectedText = range.toString().trim();
  const idx = fullText.indexOf(selectedText);

  if (idx === -1) {
    return fullText.slice(0, windowSize * 2);
  }

  const start = Math.max(0, idx - windowSize);
  const end = Math.min(fullText.length, idx + selectedText.length + windowSize);

  const prefix = start > 0 ? "..." : "";
  const suffix = end < fullText.length ? "..." : "";
  return prefix + fullText.slice(start, end) + suffix;
}

/**
 * 以选中文字在页面全文中的位置为锚点截取页面内容。
 * 向上取 beforeSize 字符（保留更多前文背景），
 * 向下取 afterSize 字符（适当包含后文）。
 */
export function extractPageContent(
  selectedText: string,
  beforeSize = 6000,
  afterSize = 2000,
): string {
  const fullText = document.body.innerText;
  const idx = fullText.indexOf(selectedText);

  if (idx === -1) {
    return fullText.slice(0, beforeSize + afterSize);
  }

  const start = Math.max(0, idx - beforeSize);
  const end = Math.min(fullText.length, idx + selectedText.length + afterSize);

  const prefix = start > 0 ? "...\n" : "";
  const suffix = end < fullText.length ? "\n..." : "";
  return prefix + fullText.slice(start, end) + suffix;
}
