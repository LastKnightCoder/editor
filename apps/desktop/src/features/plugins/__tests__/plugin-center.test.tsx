import { act, StrictMode, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createBrowserStorage, type DevelopmentPluginPackage } from "@tau/plugins/host";
import { PluginRuntimeContext } from "@/app/plugins/context";
import { DesktopPluginRuntime, PLUGIN_DETAIL_KEY } from "@/app/plugins/runtime";
import { PageProvider, usePage, type Navigator } from "@/page/PageProvider";
import { PageHost } from "@/page/PageHost";
import type { LocalPluginScan } from "@/types/plugin-local";
import type { PluginCatalog } from "@/types/plugin-center";
import "../pages/plugins.page";
import "../pages/plugin-detail.page";

const mock = vi.hoisted(() => ({
  scan: vi.fn<() => Promise<LocalPluginScan>>(),
  catalog: vi.fn<() => Promise<PluginCatalog>>(),
  release: vi.fn(),
  stage: vi.fn<(id: string) => Promise<{ id: string; version: string }>>(),
  uninstall: vi.fn<(id: string) => Promise<void>>(),
  relaunch: vi.fn(async () => undefined),
}));
vi.mock("@/commands/plugin-local", () => ({
  scanLocalPlugins: mock.scan,
  fetchPluginCatalog: mock.catalog,
  fetchPluginRelease: mock.release,
  fetchPluginVersions: vi.fn(async () => []),
  stagePluginRelease: mock.stage,
  uninstallLocalPlugin: mock.uninstall,
  relaunchForPlugins: mock.relaunch,
  stagePluginZip: vi.fn(),
  openPluginDirectory: vi.fn(),
  restoreLocalPlugin: vi.fn(),
  cancelLocalPluginUpdate: vi.fn(),
}));
vi.mock("@/commands/extra", () => ({ openExternal: vi.fn() }));
// 详情资料走只读编辑器；这里只核对过滤后的文档文本，节点过滤规则由 pluginDocument 测试覆盖
vi.mock("@/services/editorKit", () => ({ getPluginDocumentKit: () => ({}) }));
vi.mock("@tau/editor", async () => {
  const { Node } = await import("slate");
  return {
    Editor: ({ initValue }: { initValue: import("slate").Descendant[] }) => (
      <div data-testid="plugin-document">{initValue.map(node => Node.string(node)).join("\n")}</div>
    ),
  };
});

const ID = "test.center";
const center = {
  kind: "center" as const,
  releaseId: "r1",
  pluginId: ID,
  version: "1.0.0",
  sha256: "s",
};
function artifact(): DevelopmentPluginPackage {
  return {
    manifest: {
      formatVersion: 1,
      apiVersion: 1,
      platform: "desktop",
      format: "cjs",
      id: ID,
      name: "中心插件",
      version: "1.0.0",
      main: "main.js",
      integrity: { "main.js": "a".repeat(64) },
    },
    code: `module.exports.default=require('@tau/plugins').definePlugin({id:'${ID}',name:'中心插件',version:'1.0.0',create:()=>({activate(){}})});`,
  };
}
const catalog: PluginCatalog = {
  windowStart: "2026-10-12",
  items: [
    {
      pluginId: ID,
      downloadsTotal: 0,
      downloads7d: 0,
      name: "中心插件",
      description: "从插件中心安装的样本",
      publisher: { login: "author", avatarUrl: "" },
      repository: "https://github.com/author/center",
      latest: {
        releaseId: "r1",
        version: "1.0.0",
        minAppVersion: "0.58.0",
        publishedAt: "2026-10-17T00:00:00.000Z",
        size: 2048,
        sha256: "s".repeat(64),
        downloadUrl: "",
      },
      compatible: null,
    },
  ],
};
catalog.items[0].compatible = catalog.items[0].latest;
let scan: LocalPluginScan;
let root: Root;
let container: HTMLDivElement;
let runtime: DesktopPluginRuntime;
let navigator: Navigator | undefined;

function Host() {
  const page = usePage();
  useEffect(() => {
    navigator = page.navigator;
  }, [page.navigator]);
  return <PageHost state={page.state} />;
}
const page = () => container.querySelector('[data-page-active=""]') ?? container;
async function settle() {
  await act(async () => {
    await vi.dynamicImportSettled();
    await new Promise(resolve => setTimeout(resolve, 10));
  });
}
async function click(text: string, scope: ParentNode = page()) {
  const button = [...scope.querySelectorAll<HTMLButtonElement>("button")].find(
    item => item.textContent === text
  );
  if (!button) throw new Error(`按钮不存在：${text}`);
  await act(async () => button.click());
  await settle();
}
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]') ?? document.body;

beforeEach(async () => {
  localStorage.clear();
  scan = { directory: "/test/plugins", entries: [], updates: [] };
  mock.scan.mockImplementation(async () => scan);
  mock.catalog.mockResolvedValue(catalog);
  mock.release.mockResolvedValue({
    id: "r1",
    pluginId: ID,
    version: "1.0.0",
    state: "published",
    sha256: "s".repeat(64),
    size: 2048,
    publishedAt: "2026-10-17T00:00:00.000Z",
    repository: "https://github.com/author/center",
    commit: "c".repeat(40),
    publisher: { login: "author", avatarUrl: "" },
    content: {
      manifest: { name: "中心插件", description: "", minAppVersion: "0.58.0" },
      readme: "# 中心插件\n\n使用说明正文 ![截图](https://example.com/a.png)",
      changelog: null,
    },
  });
  mock.stage.mockImplementation(async () => {
    scan = { ...scan, updates: [{ id: ID, pending: true, pendingVersion: "1.0.0" }] };
    return { id: ID, version: "1.0.0" };
  });
  mock.uninstall.mockImplementation(async () => {
    scan = { ...scan, entries: [] };
  });
  runtime = new DesktopPluginRuntime({
    workspaceId: "A",
    storage: createBrowserStorage(localStorage),
    plugins: [],
    navigator: { push: (...args) => navigator?.push(...args) },
  });
  runtime.attachLocal(localStorage);
  await runtime.local?.refresh();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      <StrictMode>
        <QueryClientProvider client={new QueryClient()}>
          <PageProvider initialKey="plugins">
            <PluginRuntimeContext.Provider value={runtime}>
              <Host />
            </PluginRuntimeContext.Provider>
          </PageProvider>
        </QueryClientProvider>
      </StrictMode>
    )
  );
  await settle();
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
    await runtime.dispose();
  });
  container.remove();
  vi.clearAllMocks();
});

it("发现页安装需确认，暂存后显示重启生效，重启后中心来源自动启用", async () => {
  expect(page().textContent).toContain("中心插件");
  expect(page().textContent).toContain("@author");
  await click("安装");
  expect(mock.stage).not.toHaveBeenCalled();
  expect(dialog().textContent).toContain("可以读取和修改你的笔记数据");
  await click("安装", dialog());
  expect(mock.stage).toHaveBeenCalledWith("r1");
  expect(page().textContent).toContain("1.0.0 重启后生效");
  expect(page().textContent).toContain("1 项变更");
  await click("立即重启");
  expect(mock.relaunch).toHaveBeenCalledOnce();
  // 模拟重启后的扫描：包已就位，来源为插件中心
  scan = {
    directory: "/test/plugins",
    entries: [{ id: ID, directory: "/x", artifact: artifact(), source: center }],
    updates: [],
  };
  await act(async () => runtime.local?.refresh());
  await settle();
  expect(runtime.host.getState(ID)).toBe("active");
  expect(page().textContent).toContain("已安装");
});

it("详情页读取 README 安全子集，卸载默认保留私有数据", async () => {
  scan = {
    directory: "/test/plugins",
    entries: [{ id: ID, directory: "/x", artifact: artifact(), source: center }],
    updates: [],
  };
  await act(async () => runtime.local?.refresh());
  const data = `tau-plugin-prefs:${JSON.stringify(["A", ID, "count"])}`;
  localStorage.setItem(data, "1");
  await act(async () => navigator?.push(PLUGIN_DETAIL_KEY, { pluginId: ID }));
  await settle();
  expect(page().textContent).toContain("使用说明正文");
  expect(page().textContent).toContain("图片不在应用内加载");
  expect(page().querySelector("img")).toBeNull();
  expect(page().textContent).toContain("author/center");
  expect(page().textContent).toContain("插件中心");
  const more = page().querySelector<HTMLButtonElement>('[aria-label="中心插件 的更多操作"]');
  await act(async () => more?.click());
  const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    element => element.textContent === "卸载…"
  );
  await act(async () => item?.click());
  await settle();
  await click("卸载", dialog());
  expect(mock.uninstall).toHaveBeenCalledWith(ID);
  expect(localStorage.getItem(data)).toBe("1");
  expect(runtime.host.listPlugins().some(plugin => plugin.id === ID)).toBe(false);
});

it("插件中心离线时发现页给出重试，已安装标签照常可用", async () => {
  mock.catalog.mockRejectedValue(new Error("暂时连不上插件中心，请检查网络后重试"));
  await act(async () => navigator?.push("plugins", { tab: "discover" }));
  await act(async () => {
    root.unmount();
    root = createRoot(container);
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <PageProvider initialKey="plugins">
          <PluginRuntimeContext.Provider value={runtime}>
            <Host />
          </PluginRuntimeContext.Provider>
        </PageProvider>
      </QueryClientProvider>
    );
  });
  await settle();
  expect(page().textContent).toContain("暂时连不上插件中心");
  mock.catalog.mockResolvedValue(catalog);
  await click("重试");
  expect(page().textContent).toContain("从插件中心安装的样本");
});
