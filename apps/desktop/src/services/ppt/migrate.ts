import type { Descendant } from "slate";
import { compilePPT, type PPTFiles, type PPTManifest } from "./document";
import { pageSlot, originalShellPath } from "./original-shell";
import { elements, ORIGINAL_TEMPLATE, splitSlides } from "./template";
import type { DefaultTreeAdapterTypes as HTML } from "parse5";

function textContent(node: HTML.Element): string {
  return node.childNodes
    .map(n => ("value" in n ? n.value : "tagName" in n ? textContent(n) : ""))
    .join("");
}

// 从代码块直接读原始 HTML；Markdown 清洗会剥去正文里合法的代码围栏。
export function originalPPTSource(nodes: Descendant[]) {
  if (nodes.length !== 1) return;
  const block = nodes[0];
  if (!("type" in block) || block.type !== "code-block" || block.language !== "html") return;
  const step = block.children[0];
  if (block.children.length === 1 && step && "code" in step && typeof step.code === "string")
    return step.code;
  if ("code" in block && typeof block.code === "string") return block.code;
}

export function migratePPT(source: string, fallbackTitle: string): PPTFiles {
  if (
    !/^\s*<!doctype html\s*>/i.test(source) ||
    !/<\/html>\s*$/i.test(source) ||
    source.includes(pageSlot)
  )
    throw new Error("旧稿缺少完整的 HTML 文档");
  const { nodes, pages, tail } = splitSlides(source);
  const title = nodes.find(n => n.tagName === "title");
  const manifest: PPTManifest = {
    format: "tau-ppt",
    version: 1,
    template: ORIGINAL_TEMPLATE,
    title: (title && textContent(title).trim()) || fallbackTitle,
    slides: [],
  };
  const shell = pages[0].before + pageSlot + tail;
  const files: PPTFiles = { [originalShellPath]: shell };
  for (const [i, { node, before, html }] of pages.entries()) {
    if (i && node.attrs.some(a => a.name === "class" && a.value.split(/\s+/).includes("active")))
      throw new Error("旧稿从非首页开始播放");
    const id = node.attrs.find(a => a.name === "data-slide-id")?.value ?? `page-${i + 1}`;
    const heading = elements(node).find(n => /^h[1-6]$/.test(n.tagName));
    manifest.slides.push({
      id,
      intent: (heading && textContent(heading).trim()) || `第 ${i + 1} 页`,
    });
    files[`slides/${id}.html`] = (i ? before : "") + html;
  }
  const restored = shell.replace(pageSlot, () =>
    manifest.slides.map(({ id }) => files[`slides/${id}.html`]).join("")
  );
  if (restored !== source) throw new Error("旧稿无法无损重组");
  files["deck.json"] = JSON.stringify(manifest, null, 2);
  compilePPT(files);
  return files;
}
