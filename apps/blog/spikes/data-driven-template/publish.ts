import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Descendant } from "slate";
import type { PluginManifest } from "@tau/plugins/package";
import type { PublishedPluginRender } from "@tau/plugins/rendering";
import type { ArticleDataFile, DataSiteManifest } from "./contracts";

/**
 * 最小数据打包发布器：把内容输出为 data/ 下的 JSON 文件，并按清单机械展开模板入口 HTML。
 * 不向模板 JS 注入任何内容数据；模板资产原样复制。
 */

export interface CatalogPlugin {
  manifest: PluginManifest;
  nodeTypes: string[];
  mainFile: string;
  cssFile?: string;
}

export interface PublishArticleInput {
  id: number;
  title: string;
  author: string;
  content: Descendant[];
}

export interface PublishDataDrivenOptions {
  entryTemplate: string;
  site: { title: string; description: string; basePath: string };
  articles: PublishArticleInput[];
  plugins: CatalogPlugin[];
}

const ENTRY_DATA_TOKEN = "__TAU_DATA__";
const ENTRY_SHELL_TOKEN = "__TAU_SHELL__";
const SHELL_ASSET = "assets/shell.js";
/** 与正式发布器一致：宿主内置节点不需要插件归属 */
const BUILTIN_NODE_TYPES = new Set(["paragraph", "formatted"]);

function relativeUrl(fromFile: string, targetFile: string): string {
  return path.relative(path.dirname(fromFile), targetFile).split(path.sep).join("/");
}

function serializeForInline(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e");
}

function walkNodeTypes(nodes: unknown[], visit: (type: string) => void) {
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const value = node as { type?: string; children?: unknown[] };
    if (value.type) visit(value.type);
    if (value.children) walkNodeTypes(value.children, visit);
  }
}

export async function publishDataDrivenSite(
  siteDir: string,
  options: PublishDataDrivenOptions
): Promise<DataSiteManifest> {
  const entryTemplate = await readFile(options.entryTemplate, "utf-8");
  const owners = new Map<string, CatalogPlugin>();
  for (const plugin of options.plugins) {
    for (const type of plugin.nodeTypes) {
      if (owners.has(type)) throw new Error(`节点类型归属冲突：${type}`);
      owners.set(type, plugin);
    }
  }

  // 复制用到的插件资产（C23 语义不变：固定版本 + manifest 完整性摘要）
  const usedByArticle = options.articles.map(article => {
    const used = new Set<CatalogPlugin>();
    walkNodeTypes(article.content, type => {
      if (BUILTIN_NODE_TYPES.has(type)) return;
      const owner = owners.get(type);
      if (!owner) throw new Error(`缺少节点 ${type} 的发布扩展，拒绝生成该页数据`);
      used.add(owner);
    });
    return used;
  });
  for (const plugin of new Set(usedByArticle.flatMap(used => [...used]))) {
    const directory = path.join(siteDir, "plugin-assets", plugin.manifest.id, plugin.manifest.version);
    await mkdir(directory, { recursive: true });
    await copyFile(plugin.mainFile, path.join(directory, plugin.manifest.main));
    if (plugin.cssFile && plugin.manifest.styles) {
      await copyFile(plugin.cssFile, path.join(directory, plugin.manifest.styles));
    }
  }

  const pages: DataSiteManifest["pages"] = [];
  for (const [index, article] of options.articles.entries()) {
    const dataFile = `data/articles/${article.id}.json`;
    const pageFile = `articles/${article.id}/index.html`;
    const inlineFile = `inline/${article.id}/index.html`;

    const buildRenderers = (baseFile: string): PublishedPluginRender[] =>
      [...usedByArticle[index]].map(plugin => ({
        runtimeVersion: 1 as const,
        manifest: plugin.manifest,
        nodeTypes: plugin.nodeTypes,
        entry: relativeUrl(baseFile, `plugin-assets/${plugin.manifest.id}/${plugin.manifest.version}/${plugin.manifest.main}`),
        ...(plugin.cssFile && plugin.manifest.styles
          ? {
              styles: relativeUrl(
                baseFile,
                `plugin-assets/${plugin.manifest.id}/${plugin.manifest.version}/${plugin.manifest.styles}`
              ),
            }
          : {}),
      }));

    const initData: ArticleDataFile = {
      site: options.site,
      navigation: [],
      content: {
        id: article.id,
        title: article.title,
        author: article.author,
        tags: [],
        createTime: 0,
        updateTime: 0,
        content: article.content,
      },
      meta: { type: "article", publishTime: 0 },
      // fetch 版资源路径相对数据文件自身（数据包自包含）
      pluginRenderers: buildRenderers(dataFile),
    };

    await mkdir(path.dirname(path.join(siteDir, dataFile)), { recursive: true });
    await writeFile(path.join(siteDir, dataFile), JSON.stringify(initData, null, 2));

    const expandEntry = (dataHref: string, shellHref: string) =>
      entryTemplate
        .replace(ENTRY_DATA_TOKEN, dataHref)
        .replace(ENTRY_SHELL_TOKEN, shellHref);

    await mkdir(path.dirname(path.join(siteDir, pageFile)), { recursive: true });
    await writeFile(
      path.join(siteDir, pageFile),
      expandEntry(relativeUrl(pageFile, dataFile), relativeUrl(pageFile, SHELL_ASSET))
    );

    // 内联对照版：同一份数据内联进 HTML（资源路径相对页面），验证迁移前后渲染一致
    const inlineData: ArticleDataFile = {
      ...initData,
      pluginRenderers: buildRenderers(inlineFile),
    };
    const inlineHtml = expandEntry(relativeUrl(inlineFile, dataFile), relativeUrl(inlineFile, SHELL_ASSET))
      .replace(
        "<script src=",
        `<script>window._INIT_DATA_=${serializeForInline(inlineData)};</script><script src=`
      );
    await mkdir(path.dirname(path.join(siteDir, inlineFile)), { recursive: true });
    await writeFile(path.join(siteDir, inlineFile), inlineHtml);

    pages.push({ type: "article", id: article.id, title: article.title, href: `articles/${article.id}/`, data: `articles/${article.id}.json` });
  }

  const manifest: DataSiteManifest = { version: 1, site: options.site, pages };
  await writeFile(path.join(siteDir, "data/site.json"), JSON.stringify(manifest, null, 2));
  await writeFile(
    path.join(siteDir, "index.html"),
    entryTemplate
      .replace(ENTRY_DATA_TOKEN, relativeUrl("index.html", "data/site.json"))
      .replace(ENTRY_SHELL_TOKEN, relativeUrl("index.html", SHELL_ASSET))
  );
  return manifest;
}
