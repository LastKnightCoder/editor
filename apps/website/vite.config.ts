import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import {
  fetchReleaseInfo,
  renderDownloadButtons,
  renderReleaseMeta,
  type ReleaseInfo,
} from "./build/release.ts";
import { renderSiteNav } from "./build/siteNav.ts";
import type { DocCollection, DocEntry } from "./src/docs/collection.ts";
import { developerDocs } from "./src/docs/developers/manifest.ts";
import { userDocs } from "./src/docs/manifest.ts";

const root = fileURLToPath(new URL(".", import.meta.url));
const HOME_HTML = "/index.html";
/** 每个文档集一个单页应用，入口页是 <前缀>index.html */
const DOC_COLLECTIONS: DocCollection[] = [userDocs, developerDocs];
const collectionHtml = (collection: DocCollection) => `${collection.basePath}index.html`;
const CHANGELOG_HTML = "/changelog/index.html";

/** 首页占位：站点导航入口，以及构建时的下载快照（发布源暂时不可用时由 Pages 回退展示）。 */
function releaseInfoPlugin(): Plugin {
  let isBuild = false;
  let pending: Promise<ReleaseInfo | null> | null = null;
  const load = () =>
    (pending ??= fetchReleaseInfo().catch(error => {
      // 线上产物不能带着空的下载按钮发布；本地开发断网时只降级展示
      if (isBuild) throw error;
      console.warn(`[website] 读取发布信息失败，下载区显示占位：${error.message}`);
      return null;
    }));
  return {
    name: "tau-release-info",
    configResolved(config) {
      isBuild = config.command === "build";
    },
    async transformIndexHtml(html, ctx) {
      if (ctx.path !== HOME_HTML) return html;
      const info = await load();
      return renderSiteNav(html)
        .replaceAll("<!--tau:download-buttons-->", renderDownloadButtons(info))
        .replaceAll("<!--tau:release-meta-->", renderReleaseMeta(info))
        .replaceAll("<!--tau:version-->", info?.version ?? "—");
    },
  };
}

const escapeHtml = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");

const fillDocMeta = (html: string, collection: DocCollection, entry: DocEntry) =>
  html
    .replace("<!--tau:doc-title-->", escapeHtml(collection.pageTitle(entry)))
    .replace("<!--tau:doc-summary-->", escapeHtml(entry.summary));

/**
 * 使用文档 /docs/ 与插件开发文档 /developers/ 各是一个单页应用：构建时按目录给每篇文档各出一份入口页
 * （标题与描述各自填好），静态托管直接命中 <前缀><slug>/index.html；开发服务器把 <前缀><slug>/ 改写到同一个模板。
 * 更新日志 /changelog/ 只有一页，各版本用锚点定位，和文档共用编辑器与样式。
 */
function docsPagesPlugin(): Plugin {
  const prefixes = [...DOC_COLLECTIONS.map(collection => collection.basePath), "/changelog/"];
  return {
    name: "tau-docs-pages",
    config: () => ({
      build: {
        rolldownOptions: {
          input: {
            main: `${root}index.html`,
            docs: `${root}docs/index.html`,
            developers: `${root}developers/index.html`,
            changelog: `${root}changelog/index.html`,
          },
        },
      },
    }),
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (prefixes.some(prefix => url.pathname === prefix.slice(0, -1))) {
          res.writeHead(301, { Location: `${url.pathname}/${url.search}` }).end();
          return;
        }
        if (url.pathname === "/changelog/") {
          req.url = CHANGELOG_HTML + url.search;
          next();
          return;
        }
        const collection = DOC_COLLECTIONS.find(item => url.pathname.startsWith(item.basePath));
        if (collection && !url.pathname.includes(".")) {
          req.url = collectionHtml(collection) + url.search;
        }
        next();
      });
    },
    transformIndexHtml(html, ctx) {
      // 构建时留着占位，generateBundle 里逐篇填
      const collection = DOC_COLLECTIONS.find(item => ctx.path === collectionHtml(item));
      if (!collection || !ctx.originalUrl) return html;
      const entry = collection.find(new URL(ctx.originalUrl, "http://localhost").pathname);
      return fillDocMeta(html, collection, entry ?? collection.all[0]);
    },
    generateBundle: {
      // HTML 产物由 Vite 自己的 generateBundle 输出，要排在它之后
      order: "post",
      handler(_options, bundle) {
        for (const collection of DOC_COLLECTIONS) {
          const fileName = collectionHtml(collection).slice(1);
          const template = bundle[fileName];
          if (template?.type !== "asset") throw new Error(`[website] 构建产物里缺少 ${fileName}`);
          const html = String(template.source);
          for (const entry of collection.all) {
            const source = fillDocMeta(html, collection, entry);
            if (entry.slug)
              this.emitFile({
                type: "asset",
                fileName: `${collection.basePath.slice(1)}${entry.slug}/index.html`,
                source,
              });
            else template.source = source;
          }
        }
      },
    },
  };
}

export default defineConfig({
  root,
  plugins: [react(), tailwindcss(), releaseInfoPlugin(), docsPagesPlugin()],
  resolve: {
    // 编辑器各包自带的开发依赖里也有 React / Slate，必须收敛到同一份
    dedupe: [
      "react",
      "react-dom",
      "slate",
      "slate-dom",
      "slate-react",
      "slate-history",
      "react-dnd",
      "react-dnd-html5-backend",
    ],
  },
  server: { port: 5180, strictPort: true },
  preview: { port: 5180, strictPort: true },
  build: {
    target: ["chrome107", "edge107", "firefox104", "safari16"],
    outDir: "dist",
    emptyOutDir: true,
  },
});
