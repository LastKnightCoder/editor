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
import { DOC_ENTRIES, docPageTitle, findDoc, type DocEntry } from "./src/docs/manifest.ts";

const root = fileURLToPath(new URL(".", import.meta.url));
const HOME_HTML = "/index.html";
const DOCS_HTML = "/docs/index.html";

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

const fillDocMeta = (html: string, entry: DocEntry) =>
  html
    .replace("<!--tau:doc-title-->", escapeHtml(docPageTitle(entry)))
    .replace("<!--tau:doc-summary-->", escapeHtml(entry.summary));

/**
 * 使用文档是 /docs/ 下的单页应用：构建时按目录给每篇文档各出一份入口页（标题与描述各自填好），
 * 静态托管直接命中 /docs/<slug>/index.html；开发服务器把 /docs/<slug>/ 改写到同一个模板。
 */
function docsPagesPlugin(): Plugin {
  return {
    name: "tau-docs-pages",
    config: () => ({
      build: {
        rolldownOptions: {
          input: { main: `${root}index.html`, docs: `${root}docs/index.html` },
        },
      },
    }),
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (url.pathname === "/docs") {
          res.writeHead(301, { Location: `/docs/${url.search}` }).end();
          return;
        }
        if (url.pathname.startsWith("/docs/") && !url.pathname.includes(".")) {
          req.url = DOCS_HTML + url.search;
        }
        next();
      });
    },
    transformIndexHtml(html, ctx) {
      // 构建时留着占位，generateBundle 里逐篇填
      if (ctx.path !== DOCS_HTML || !ctx.originalUrl) return html;
      const entry = findDoc(new URL(ctx.originalUrl, "http://localhost").pathname);
      return fillDocMeta(html, entry ?? DOC_ENTRIES[0]);
    },
    generateBundle: {
      // HTML 产物由 Vite 自己的 generateBundle 输出，要排在它之后
      order: "post",
      handler(_options, bundle) {
        const template = bundle[DOCS_HTML.slice(1)];
        if (template?.type !== "asset") throw new Error("[website] 构建产物里缺少 docs/index.html");
        const html = String(template.source);
        for (const entry of DOC_ENTRIES) {
          const source = fillDocMeta(html, entry);
          if (entry.slug)
            this.emitFile({ type: "asset", fileName: `docs/${entry.slug}/index.html`, source });
          else template.source = source;
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
