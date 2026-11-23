import {
  ExternalHyperlink,
  TextRun,
  type ImageRun,
  type IRunOptions,
  type ParagraphChild,
} from "docx";
import { wordHighlight } from "./layout";

export type ImageLoader = (element: Element, maxWidth: number) => Promise<ImageRun>;
export const blockSelector =
  "p,div,section,article,figure,figcaption,main,aside,blockquote,pre,table,ol,ul,h1,h2,h3,h4,h5,h6,hr,footer,details,summary,.detail-label";
const excluded =
  "script,style,noscript,template,input,.callout-title[data-default-title],.callout-icon,.detail-arrow";
function colorOf(element: Element) {
  const style = element.getAttribute("style") || "";
  return /(?:^|;)\s*color:\s*#([a-f\d]{6})(?:\s*;|\s*$)/i.exec(style)?.[1];
}

function highlightColor(mark: Element) {
  return (
    Array.from(mark.classList)
      .find(name => name.startsWith("highlight-"))
      ?.slice("highlight-".length) ?? "yellow"
  );
}

/** 在连续高亮两端写入带底纹的不换行空格；加粗、字色或链接拆分的同色文字仍属同一段。 */
function padInlineHighlights(root: DocumentFragment) {
  if (!root.querySelector("mark")) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let last: Text | undefined;
  let previousColor: string | undefined;
  let previousBlock: Element | null = null;
  function finish() {
    if (last) last.appendData("\u00a0");
    last = undefined;
  }
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      if ((node as Element).matches("br,img,svg," + blockSelector)) finish();
      continue;
    }
    const text = node as Text;
    if (!text.length) continue;
    const parent = text.parentElement;
    const mark = parent?.closest("mark");
    if (!mark || parent?.closest("pre,svg")) {
      finish();
      continue;
    }
    const color = highlightColor(mark);
    const block = mark.closest(blockSelector);
    if (!last || color !== previousColor || block !== previousBlock) {
      finish();
      text.insertData(0, "\u00a0");
    }
    last = text;
    previousColor = color;
    previousBlock = block;
  }
  finish();
}

export function prepareStaticHtml(html: string) {
  // 在惰性模板中读取插件标记，避免挂载交互组件或加载页面资源。
  const template = document.createElement("template");
  template.innerHTML = html;
  template.content.querySelectorAll(excluded).forEach(el => el.remove());
  for (const element of template.content.querySelectorAll(
    "iframe,object,embed,canvas,video,audio"
  )) {
    const url =
      element.getAttribute("src") ||
      element.getAttribute("data") ||
      element.querySelector("source")?.getAttribute("src");
    const label = element.getAttribute("title") || element.textContent?.trim();
    if (url && /^https?:\/\//i.test(url)) {
      const link = document.createElement("a");
      link.href = url;
      link.textContent = label || url;
      element.replaceWith(link);
    } else if (label) {
      element.replaceWith(label);
    } else {
      throw new Error(`嵌入内容 ${element.localName} 缺少可导出的图片、文字或链接`);
    }
  }
  padInlineHighlights(template.content);
  return template.content;
}

export function createInlineWriter(
  loadImage: ImageLoader,
  mono: string,
  size: number,
  warnings: string[]
) {
  async function inline(node: Node, style: IRunOptions, width: number): Promise<ParagraphChild[]> {
    if (node.nodeType === 3) {
      return (node.textContent || "")
        .split(/\r?\n/)
        .map((text, i) => new TextRun({ ...style, text, ...(i ? { break: 1 } : {}) }));
    }
    if (node.nodeType !== 1) return [];
    const el = node as Element;
    const tag = el.localName;
    if (tag === "br") return [new TextRun({ break: 1 })];
    if (tag === "img" || tag === "svg") {
      try {
        return [await loadImage(el, width / 15)];
      } catch {
        const label = el.getAttribute("alt") || "图片";
        warnings.push(label);
        return [new TextRun({ text: `〔${label}未能嵌入〕`, italics: true })];
      }
    }
    const next = { ...style };
    if (tag === "strong" || tag === "b") next.bold = true;
    if (tag === "em" || tag === "i") next.italics = true;
    if (tag === "del" || tag === "s") next.strike = true;
    if (tag === "mark") {
      Object.assign(next, wordHighlight(highlightColor(el)));
    }
    if (tag === "sup") next.superScript = true;
    if (tag === "sub") next.subScript = true;
    if (tag === "u" || el.classList.contains("underline")) next.underline = {};
    if (tag === "code" || tag === "kbd") {
      next.font = mono;
      next.size = style.size ?? Math.round(size * 1.8);
    }
    if (el.matches(".callout-title,.detail-title-text")) next.bold = true;
    const color = colorOf(el);
    if (color) next.color = color;
    const href = el.getAttribute("href");
    const link = tag === "a" && href && /^(https?:\/\/|mailto:)/i.test(href);
    if (link) {
      next.color = "315C86";
      next.underline = {};
    }
    if (el.classList.contains("annotation") && el.getAttribute("title"))
      return [new TextRun({ ...style, text: `〔注：${el.getAttribute("title")}〕` })];
    const children = await inlineNodes(el.childNodes, next, width);
    return link ? [new ExternalHyperlink({ link: href, children })] : children;
  }

  async function inlineNodes(nodes: ArrayLike<Node>, style: IRunOptions, width: number) {
    const out: ParagraphChild[] = [];
    for (const node of Array.from(nodes)) out.push(...(await inline(node, style, width)));
    return out;
  }

  return inlineNodes;
}
