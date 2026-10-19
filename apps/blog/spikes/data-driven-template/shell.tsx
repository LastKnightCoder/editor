import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { UiProvider } from "@tau/ui";
import ArticlePage from "../../src/templates/article/ArticlePage";
import { getBlogKit } from "../../src/services/editorKit";
import { blogMarkdown } from "../../src/services/editorMarkdown";
import { loadPublishedPluginDefinitions } from "../../src/services/plugin-runtime";
import { setPublishedPlugins } from "../../src/services/plugin-registry";
import { initTheme } from "../../src/utils";
import type { ArticleDataFile, DataSiteManifest } from "./contracts";

/**
 * 预编译数据驱动壳：不包含任何站点数据，运行时按入口声明 fetch 数据后渲染。
 * 已内联 window._INIT_DATA_ 时跳过 fetch（现有模板向数据协议迁移的兼容路径）。
 */

// 模板作者自己的首页：宿主只提供 pages 清单，列表形态完全由模板决定。
function TemplateHome({ manifest }: { manifest: DataSiteManifest }) {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <h1>{manifest.site.title}</h1>
      <ul>
        {manifest.pages.map(page => (
          <li key={page.id}>
            <a href={page.href}>{page.title}</a>
          </li>
        ))}
      </ul>
    </main>
  );
}

interface DataDrivenState {
  ready: boolean;
  source?: "fetch" | "inline" | "manifest";
  dataHref?: string;
  title?: string;
  error?: string;
}
const globals = window as typeof window & { __dataDriven?: DataDrivenState };

function isSiteManifest(value: unknown): value is DataSiteManifest {
  const candidate = value as DataSiteManifest;
  return candidate?.version === 1 && Array.isArray(candidate.pages);
}

async function readData(): Promise<
  | { kind: "article"; data: ArticleDataFile; baseUrl: string; source: "fetch" | "inline"; dataHref: string }
  | { kind: "manifest"; manifest: DataSiteManifest; dataHref: string }
> {
  const meta = document.querySelector('meta[name="tau-data"]');
  const declared = meta?.getAttribute("content");
  if (window._INIT_DATA_) {
    if (!declared) throw new Error("入口缺少 tau-data 声明");
    return {
      kind: "article",
      data: window._INIT_DATA_,
      baseUrl: window.location.href,
      source: "inline",
      dataHref: new URL(declared, window.location.href).href,
    };
  }
  if (!declared) throw new Error("入口缺少 tau-data 声明");
  const dataHref = new URL(declared, window.location.href).href;
  const response = await fetch(dataHref, { cache: "no-store" });
  if (!response.ok) throw new Error(`数据加载失败（HTTP ${response.status}）：${declared}`);
  const payload: unknown = await response.json();
  if (isSiteManifest(payload)) return { kind: "manifest", manifest: payload, dataHref };
  return { kind: "article", data: payload as ArticleDataFile, baseUrl: dataHref, source: "fetch", dataHref };
}

async function bootstrap() {
  const root = document.getElementById("root");
  if (!root) throw new Error("页面缺少根节点");
  const payload = await readData();
  let page: ReactNode;
  let title: string;
  if (payload.kind === "manifest") {
    page = <TemplateHome manifest={payload.manifest} />;
    title = payload.manifest.site.title;
    globals.__dataDriven = { ready: true, source: "manifest", dataHref: payload.dataHref, title };
  } else {
    window._INIT_DATA_ = payload.data;
    if (payload.data.pluginRenderers?.length) {
      // 资源路径相对数据文件解析，数据包自包含；复用正式插件加载协议。
      const loaded = await loadPublishedPluginDefinitions(
        payload.data.pluginRenderers,
        payload.baseUrl
      );
      setPublishedPlugins(loaded.definitions);
      getBlogKit(payload.data.settings);
      blogMarkdown.importFromMarkdown("");
    }
    page = <ArticlePage />;
    title = String((payload.data.content as { title?: unknown }).title ?? "");
    globals.__dataDriven = { ready: true, source: payload.source, dataHref: payload.dataHref, title };
  }
  initTheme();
  createRoot(root).render(
    <StrictMode>
      <UiProvider>{page}</UiProvider>
    </StrictMode>
  );
}

void bootstrap().catch(error => {
  globals.__dataDriven = { ready: false, error: String(error) };
  const root = document.getElementById("root");
  if (root) {
    root.setAttribute("role", "alert");
    root.textContent = `页面加载失败：${error instanceof Error ? error.message : String(error)}`;
  }
});
