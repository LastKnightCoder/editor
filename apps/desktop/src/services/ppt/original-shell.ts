import { parse } from "parse5";
import { elements } from "./template";

export const originalShellPath = "original-shell.html";
export const pageSlot = "<!--tau-ppt-pages-->";
const shellTags = new Set(
  "html head title meta style body div section header footer main aside nav span p strong b em i small".split(
    " "
  )
);

// 壳随笔记同步，重开时也检查。只有应用内置的运行时和模板装饰可以执行。
export function renderOriginalShell(
  shell: string,
  pages: string,
  title: string,
  overrides: string
) {
  if (typeof shell !== "string" || shell.split(pageSlot).length !== 2)
    throw new Error("旧稿页面插槽无效");
  const tree = parse(shell, {
    sourceCodeLocationInfo: true,
    onParseError: e => {
      throw new Error(e.code);
    },
  });
  const nodes = elements(tree);
  const body = nodes.find(n => n.tagName === "body")?.sourceCodeLocation;
  const head = nodes.find(n => n.tagName === "head")?.sourceCodeLocation;
  const slot = shell.indexOf(pageSlot);
  const slotIsComment = nodes.some(node =>
    node.childNodes.some(
      child => child.nodeName === "#comment" && child.sourceCodeLocation?.startOffset === slot
    )
  );
  if (
    !slotIsComment ||
    !body?.startTag ||
    !body.endTag ||
    !head?.startTag ||
    !head.endTag ||
    slot < body.startTag.endOffset ||
    slot >= body.endTag.startOffset
  )
    throw new Error("旧稿缺少完整的文档外壳");
  for (const el of nodes) {
    if (
      !shellTags.has(el.tagName) ||
      el.attrs.some(a => /^on|^(?:src|href|is|nonce|http-equiv|srcdoc|background)$/i.test(a.name))
    )
      throw new Error("旧稿含独立脚本、外部依赖或不支持的壳层元素");
    if (el.tagName === "style" && el.parentNode?.nodeName !== "head")
      throw new Error("旧稿样式不在文档头部");
  }
  const escapedTitle = title
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  const titleNode = nodes.find(n => n.tagName === "title")?.sourceCodeLocation;
  const patches = [
    { from: slot, to: slot + pageSlot.length, text: pages },
    {
      from: head.endTag.startOffset,
      to: head.endTag.startOffset,
      text:
        (titleNode ? "" : `<title>${escapedTitle}</title>`) +
        (overrides ? `<style>${overrides}</style>` : ""),
    },
  ];
  if (titleNode?.startTag && titleNode.endTag)
    patches.push({
      from: titleNode.startTag.endOffset,
      to: titleNode.endTag.startOffset,
      text: escapedTitle,
    });
  for (const { from, to, text } of patches.sort((a, b) => b.from - a.from))
    shell = shell.slice(0, from) + text + shell.slice(to);
  return shell;
}
