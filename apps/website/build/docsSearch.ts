import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Fuse from "fuse.js";
import { Node, type Descendant } from "slate";
import type { Plugin } from "vite";
import type { DocCollection, DocEntry } from "../src/docs/collection.ts";
import { developerDocs, docSlugOfFile } from "../src/docs/developers/manifest.ts";
import { stripDocHeader } from "../src/docs/developers/source.ts";
import { docsMarkdown } from "../src/docs/editorMarkdown.ts";
import { userDocs } from "../src/docs/manifest.ts";
import { headingAnchors } from "../src/docs/outline.ts";
import { DOC_SEARCH_KEYS, type DocSearchDocument, type DocSearchPayload } from "../src/docs/searchIndex.ts";
import { splitDocSegments } from "../src/docs/segments.ts";

const USER_ROOT = fileURLToPath(new URL("../content/docs/", import.meta.url));
const DEVELOPER_ROOT = fileURLToPath(new URL("../../../plugins/tau-plugin-template/docs/", import.meta.url));
const COLLECTIONS: Record<string, DocCollection> = { docs: userDocs, developers: developerDocs };
const MODULE_PREFIX = "virtual:tau-docs-search/";
const DEV_PREFIX = "/@tau-docs-search/";

function nodeText(node: Descendant): string {
  if ("text" in node) return node.text;
  if (node.type === "front-matter") return "";
  const own = ["title", "code", "alt", "tex"].flatMap(key => {
    const value = (node as unknown as Record<string, unknown>)[key];
    return typeof value === "string" ? [value] : [];
  });
  const children = node.children.map(nodeText).join(
    node.type === "paragraph" || node.type === "header" ? "" : " "
  );
  return [...own, children].join(" ");
}

export function buildDocSearchPayload(
  collection: DocCollection,
  read: (entry: DocEntry) => string
): DocSearchPayload {
  const documents = collection.entries.flatMap(entry => {
    const group = collection.groups.find(item => item.items.includes(entry))?.title ?? collection.name;
    let current: { section: string; text: string[] } = { section: "", text: [] };
    const sections = [current];
    for (const segment of splitDocSegments(read(entry))) {
      if (segment.kind === "demo") {
        if (segment.caption) current.text.push(segment.caption);
        continue;
      }
      for (const node of docsMarkdown.importFromMarkdown(segment.markdown)) {
        if ("type" in node && node.type === "header") {
          current = { section: Node.string(node), text: [] };
          sections.push(current);
        } else current.text.push(nodeText(node));
      }
    }
    const anchors = headingAnchors(sections.slice(1).map(item => item.section));
    return sections.map<DocSearchDocument>((item, index) => ({
      href: collection.href(entry.slug) + (index ? `#${encodeURIComponent(anchors[index - 1])}` : ""),
      title: entry.title,
      section: item.section,
      group,
      summary: index ? "" : entry.summary,
      content: item.text.join(" ").replace(/\s+/g, " ").trim(),
    }));
  });
  return {
    version: 1,
    basePath: collection.basePath,
    documents,
    index: Fuse.createIndex(DOC_SEARCH_KEYS, documents).toJSON(),
  };
}

export function readDocSearchPayload(name: string, watch: (path: string) => void = () => {}) {
  const collection = COLLECTIONS[name];
  if (!collection) throw new Error(`未知文档集：${name}`);
  const developerFiles = name === "developers"
    ? readdirSync(DEVELOPER_ROOT, { recursive: true, encoding: "utf8" }).filter(file => file.endsWith(".md"))
    : [];
  return buildDocSearchPayload(collection, entry => {
    const developerFile = developerFiles.find(file => docSlugOfFile(file) === entry.slug);
    if (name === "developers" && !developerFile)
      throw new Error(`模板仓库缺少文档：${entry.slug || "README"}`);
    const file = name === "docs"
      ? `${USER_ROOT}${entry.slug || "index"}.md`
      : DEVELOPER_ROOT + developerFile;
    watch(file);
    const markdown = readFileSync(file, "utf8");
    return name === "developers" ? stripDocHeader(markdown) : markdown;
  });
}

/** 索引与页面一起构建，哈希地址随文档变化；开发时按请求读取当前正文。 */
export function docsSearchPlugin(): Plugin {
  let isBuild = false;
  return {
    name: "tau-docs-search",
    configResolved(config) {
      isBuild = config.command === "build";
    },
    resolveId(id) {
      if (id.startsWith(MODULE_PREFIX)) return `\0${id}`;
    },
    load(id) {
      if (!id.startsWith(`\0${MODULE_PREFIX}`)) return;
      const name = id.slice(MODULE_PREFIX.length + 1);
      if (!COLLECTIONS[name]) throw new Error(`未知文档集：${name}`);
      if (!isBuild) return `export default ${JSON.stringify(`${DEV_PREFIX}${name}.json`)};`;
      const reference = this.emitFile({
        type: "asset",
        name: `${name}-search.json`,
        source: JSON.stringify(readDocSearchPayload(name, path => this.addWatchFile(path))),
      });
      return `export default import.meta.ROLLUP_FILE_URL_${reference};`;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = new URL(req.url ?? "/", "http://localhost").pathname;
        if (!path.startsWith(DEV_PREFIX)) return next();
        const name = path.slice(DEV_PREFIX.length).replace(/\.json$/, "");
        if (!COLLECTIONS[name]) return next();
        try {
          const payload = readDocSearchPayload(name);
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          res.end(JSON.stringify(payload));
        } catch (error) {
          next(error);
        }
      });
    },
  };
}
