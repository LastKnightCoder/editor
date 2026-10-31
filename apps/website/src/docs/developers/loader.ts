/**
 * 插件开发文档的正文：构建时读取模板子模块的 docs/。原文写给 GitHub 阅读，
 * 这里去掉生成注释与一级标题（页头已显示），并把相对链接改成站内地址。
 */
import type { Descendant } from "slate";
import type { DocLoader } from "../DocsApp.tsx";
import { docsMarkdown } from "../editorMarkdown.ts";
import { TEMPLATE_BLOB_URL, developerDocs, docSlugOfFile } from "./manifest.ts";
import { stripDocHeader } from "./source.ts";

export { stripDocHeader } from "./source.ts";

const sources = import.meta.glob<string>(
  "../../../../../plugins/tau-plugin-template/docs/**/*.md",
  {
    query: "?raw",
    import: "default",
  }
);
const SOURCE_ROOT = "../../../../../plugins/tau-plugin-template/docs/";

const ORIGIN = "https://template.invalid";

/**
 * 模板文档里的链接 → 站点地址。`file` 是当前文档在 docs/ 下的路径。
 * 相对路径按当前文件解析，以 / 开头的按模板仓库根解析；docs/ 下的 .md 进站内，其余文件指向 GitHub。
 */
export function rewriteDocLink(url: string, file: string): string {
  if (/^[a-z][a-z\d+.-]*:/i.test(url) || url.startsWith("#")) return url;
  const target = new URL(url, `${ORIGIN}/docs/${file}`);
  const path = decodeURIComponent(target.pathname.slice(1));
  const hash = decodeURIComponent(target.hash);
  if (path.startsWith("docs/") && path.endsWith(".md"))
    return developerDocs.href(docSlugOfFile(path.slice("docs/".length))) + hash;
  return TEMPLATE_BLOB_URL + path + hash;
}

type LinkLike = { type?: string; url?: string; children?: Descendant[] };

function rewriteLinks(nodes: Descendant[], file: string): Descendant[] {
  return nodes.map(node => {
    const element = node as LinkLike;
    if (!element.children) return node;
    const next: LinkLike = {
      ...element,
      children: rewriteLinks(element.children, file),
    };
    if (element.type === "link" && element.url) next.url = rewriteDocLink(element.url, file);
    return next as Descendant;
  });
}

export const loadDeveloperDoc: DocLoader = async entry => {
  // 目录型文档（如 providers）的正文是该目录的 README.md
  const file = [`${entry.slug}.md`, `${entry.slug}/README.md`.replace(/^\//, "")].find(
    name => sources[SOURCE_ROOT + name]
  );
  if (!file) throw new Error(`模板仓库缺少文档：docs/${entry.slug || "README"}.md`);
  const markdown = stripDocHeader(await sources[SOURCE_ROOT + file]());
  return [
    {
      kind: "markdown",
      value: rewriteLinks(docsMarkdown.importFromMarkdown(markdown), file),
    },
  ];
};
