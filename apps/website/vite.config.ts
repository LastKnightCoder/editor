import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import {
  fetchReleaseInfo,
  renderDownloadButtons,
  renderReleaseMeta,
  type ReleaseInfo,
} from "./build/release.ts";

const root = fileURLToPath(new URL(".", import.meta.url));

/** 构建时保留下载快照，发布源暂时不可用时由 Pages 回退展示。 */
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
    async transformIndexHtml(html) {
      const info = await load();
      return html
        .replaceAll("<!--tau:download-buttons-->", renderDownloadButtons(info))
        .replaceAll("<!--tau:release-meta-->", renderReleaseMeta(info))
        .replaceAll("<!--tau:version-->", info?.version ?? "—");
    },
  };
}

export default defineConfig({
  root,
  plugins: [releaseInfoPlugin()],
  server: { port: 5180, strictPort: true },
  preview: { port: 5180, strictPort: true },
  build: { outDir: "dist", emptyOutDir: true },
});
