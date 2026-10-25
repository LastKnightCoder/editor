/**
 * 正文提取：找到页面的正文容器，按文档顺序收集段落级块并编号（1 起）。
 * 编号是对话里 [n] 引用的依据：回答引用 [n]，点击即滚到第 n 段。
 */

export interface PageBlock {
  index: number;
  element: Element;
  text: string;
}

export interface PageContent {
  title: string;
  url: string;
  blocks: PageBlock[];
  /** 正文总字数 */
  length: number;
}

const BLOCK_SELECTOR = "p, li, h1, h2, h3, h4, h5, h6, blockquote, pre, figcaption, dd, td, th";
const NOISE_SELECTOR =
  "nav, footer, aside, form, [role='navigation'], [role='contentinfo'], [aria-hidden='true'], tau-companion";
/** 全页兜底时站点页头也算噪声；正文容器里的 header 通常是文章标题，保留 */
const PAGE_NOISE_SELECTOR = `${NOISE_SELECTOR}, header, [role='banner']`;
const MIN_BLOCK_CHARS = 2;

const textOf = (element: Element) => (element.textContent ?? "").replace(/\s+/g, " ").trim();

/** 正文容器：article / main 里文字最多的那个，没有就用 body */
export function findContentRoot(doc: Document): Element {
  const candidates = [...doc.querySelectorAll("article, main, [role='main']")];
  let best: Element | null = null;
  let bestLength = 0;
  for (const candidate of candidates) {
    const length = textOf(candidate).length;
    if (length > bestLength) {
      best = candidate;
      bestLength = length;
    }
  }
  return best && bestLength > 200 ? best : doc.body;
}

const isVisible = (element: Element) => {
  const html = element as HTMLElement;
  if (html.hidden) return false;
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  return !style || (style.display !== "none" && style.visibility !== "hidden");
};

export function extractPage(doc: Document = document): PageContent {
  const root = findContentRoot(doc);
  const noise = root === doc.body ? PAGE_NOISE_SELECTOR : NOISE_SELECTOR;
  const blocks: PageBlock[] = [];
  const taken: Element[] = [];
  for (const element of root.querySelectorAll(BLOCK_SELECTOR)) {
    const noisy = element.closest(noise);
    if (noisy && root.contains(noisy) && noisy !== root) continue;
    // 只取最内层的块：li 里套 p 时取 p，避免同一段文字出现两次
    if (element.querySelector(BLOCK_SELECTOR)) continue;
    if (taken.some(parent => parent.contains(element))) continue;
    if (!isVisible(element)) continue;
    const text = textOf(element);
    if (text.length < MIN_BLOCK_CHARS) continue;
    taken.push(element);
    blocks.push({ index: blocks.length + 1, element, text });
  }
  return {
    title: doc.title,
    url: doc.location?.href ?? "",
    blocks,
    length: blocks.reduce((sum, block) => sum + block.text.length, 0),
  };
}

/** 给模型看的正文：每段以 [n] 开头；超长时截断并说明 */
export function pageAsPrompt(content: PageContent, maxChars = 60_000): string {
  const lines: string[] = [];
  let used = 0;
  for (const block of content.blocks) {
    const line = `[${block.index}] ${block.text}`;
    if (used + line.length > maxChars) {
      lines.push(
        `（正文较长，以上为前 ${block.index - 1} 段；需要后文时调用 read_page 按段号读取）`
      );
      break;
    }
    lines.push(line);
    used += line.length + 2;
  }
  return lines.join("\n\n");
}

/** 按段号区间读正文（read_page 工具） */
export function readBlocks(content: PageContent, from = 1, to = from + 40): string {
  const start = Math.max(1, Math.floor(from));
  const end = Math.min(content.blocks.length, Math.floor(to));
  if (start > end) return "没有这些段落";
  return content.blocks
    .slice(start - 1, end)
    .map(block => `[${block.index}] ${block.text}`)
    .join("\n\n");
}
