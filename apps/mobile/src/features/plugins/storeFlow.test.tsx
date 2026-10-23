import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CenterCatalogEntry, CenterRelease, CenterResolution } from "@tau/plugins/center";
import { centerRelease } from "../../../../../tests/fixtures/plugins/center";
import { storePrimaryAction } from "./components/storeActions";

const navigator = { push: vi.fn() };
const state = vi.hoisted(() => ({
  config: { host: null as unknown, installationEnabled: true },
  catalog: [] as unknown[],
  resolution: null as unknown,
  versions: [] as unknown[],
  installed: [] as { id: string; version: string | null }[],
  pageParams: {} as Record<string, string>,
  install: vi.fn(),
  cancel: vi.fn(),
}));
const ok = <T,>(data: T) => ({
  data,
  isPending: false,
  isError: false,
  error: null,
  isRefetching: false,
  refetch: vi.fn(),
});
vi.mock("./data/center-queries", () => ({
  useMobileCenterConfig: () => ok({ origin: "https://center.test", ...state.config }),
  useMobileCenterCatalog: () => ({
    config: ok({ origin: "https://center.test", ...state.config }),
    query: {
      ...ok({ pages: [{ items: state.catalog, nextCursor: null, categoryCounts: { page: 1 } }] }),
      hasNextPage: false,
      isFetchingNextPage: false,
      isFetchNextPageError: false,
      fetchNextPage: vi.fn(),
    },
  }),
  useMobileCenterResolution: () => ({
    config: ok({ origin: "https://center.test", ...state.config }),
    query: ok(state.resolution),
  }),
  useMobileCenterVersions: () => ({
    ...ok({ pages: [{ items: state.versions, nextCursor: null }] }),
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  }),
  useMobileCenterRelease: (id: string | null) =>
    ok((state.versions as CenterRelease[]).find(item => item.releaseId === id) ?? null),
  useMobileCenterInstall: () => ({
    phase: "idle",
    mutation: { isPending: false },
    install: state.install,
    cancel: state.cancel,
    refreshStatuses: vi.fn(),
  }),
}));
vi.mock("./data/usePluginManager", () => ({
  usePluginManager: () => ({ items: state.installed }),
}));
vi.mock("../../router", () => ({
  useNavigator: () => navigator,
  usePage: () => ({ params: state.pageParams }),
}));
vi.mock("./PluginPageView", () => ({
  PluginPageShell: ({ title, children }: { title: string; children: ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));
vi.mock("./InstalledPluginsPanel", () => ({ InstalledPluginsPanel: () => <p>已安装列表</p> }));

const { PluginStorePanel } = await import("./PluginStorePanel");
const { PluginStoreDetail } = await import("./PluginStoreDetail");
const { PluginManager } = await import("./PluginManager");

const host = {
  platform: "android",
  appVersion: "1.0.0",
  apiVersions: [1],
  formatVersions: [3],
  profiles: ["web-v1"],
  capabilities: ["pages.v1"],
};
function entry(release: CenterRelease, compatible: CenterRelease | null): CenterCatalogEntry {
  return {
    pluginId: release.pluginId,
    name: "计数器",
    description: "跨端计数器",
    categories: ["page"],
    keywords: [],
    publisher: release.publisher,
    repository: release.repository,
    downloadsTotal: 0,
    downloads7d: 0,
    likes: 0,
    latest: release,
    compatible,
    compatibility: compatible
      ? { status: "compatible", reasons: [], missingOptional: [] }
      : {
          status: "incompatible",
          reasons: [{ code: "APP_VERSION_TOO_LOW", minAppVersion: "2.0.0" }],
          missingOptional: [],
        },
  };
}
const resolution = (release: CenterRelease | null): CenterResolution => ({
  release,
  compatibility: release
    ? { status: "compatible", reasons: [], missingOptional: [] }
    : { status: "incompatible", reasons: [{ code: "NO_RELEASE" }], missingOptional: [] },
});

let root: Root | null = null;
async function mount(node: ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(node));
  return container;
}
const button = (text: string) =>
  [...document.body.querySelectorAll("button")].find(item => item.textContent?.trim() === text);
const click = async (element: Element | undefined) => {
  expect(element).toBeDefined();
  await act(async () => (element as HTMLElement).click());
};
beforeEach(() => {
  Object.assign(state, {
    config: { host, installationEnabled: true },
    catalog: [],
    resolution: null,
    versions: [],
    installed: [],
    pageParams: {},
  });
  state.install.mockReset();
  state.cancel.mockReset().mockResolvedValue(undefined);
  navigator.push.mockReset();
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

it("主动作：无兼容版不可装，已装不低于候选只显示已安装，开关关闭时禁用并说明", () => {
  expect(
    storePrimaryAction({
      compatibleVersion: null,
      installedVersion: null,
      installationEnabled: true,
    })
  ).toEqual({ kind: "unavailable" });
  expect(
    storePrimaryAction({
      compatibleVersion: "1.0.0",
      installedVersion: "1.0.0",
      installationEnabled: true,
    })
  ).toEqual({ kind: "installed", version: "1.0.0" });
  expect(
    storePrimaryAction({
      compatibleVersion: null,
      installedVersion: "1.0.0",
      installationEnabled: true,
    })
  ).toEqual({ kind: "installed", version: "1.0.0" });
  expect(
    storePrimaryAction({
      compatibleVersion: "1.2.0",
      installedVersion: "1.0.0",
      installationEnabled: true,
    })
  ).toEqual({ kind: "update", version: "1.2.0", allowed: true });
  expect(
    storePrimaryAction({
      compatibleVersion: "1.2.0",
      installedVersion: null,
      installationEnabled: false,
    })
  ).toMatchObject({ kind: "install", allowed: false, reason: "当前版本的 Tau 暂未开放插件安装" });
});

it("商店列表：安装按钮用可安装版本，确认后按 releaseId 安装，详情经导航打开", async () => {
  const latest = centerRelease("2.0.0", "r2");
  const compatible = centerRelease("1.4.0", "r1");
  state.catalog = [entry(latest, compatible)];
  state.resolution = resolution(compatible);
  state.install.mockResolvedValue(undefined);
  const install = (await import("./data/center-queries")).useMobileCenterInstall();
  await mount(<PluginStorePanel install={install} />);
  expect(document.body.textContent).toContain("最新 v2.0.0");
  expect(document.body.textContent).toContain("此设备可安装 v1.4.0");
  await click(
    [...document.body.querySelectorAll("button")].find(item => item.textContent?.includes("计数器"))
  );
  expect(navigator.push).toHaveBeenCalledWith("pluginStoreDetail", { pluginId: "example.counter" });
  await click(button("安装 v1.4.0"));
  expect(document.body.textContent).toContain("从插件中心下载");
  await click(
    [...document.body.querySelectorAll("button")]
      .filter(item => item.textContent?.trim() === "安装 v1.4.0")
      .at(-1)
  );
  expect(state.install).toHaveBeenCalledWith("example.counter", "r1");
  await act(async () => {
    await Promise.resolve();
  });
  expect(document.body.textContent).toContain("已安装 v1.4.0，将在下次打开应用时生效");
});

it("开关关闭时可浏览但不能安装；没有宿主时说明当前平台不能安装", async () => {
  state.catalog = [entry(centerRelease("1.0.0", "r1"), centerRelease("1.0.0", "r1"))];
  state.config = { host, installationEnabled: false };
  const install = (await import("./data/center-queries")).useMobileCenterInstall();
  await mount(<PluginStorePanel install={install} />);
  expect(document.body.textContent).toContain("当前版本的 Tau 暂未开放插件安装，可先浏览");
  expect((button("安装 v1.0.0") as HTMLButtonElement).disabled).toBe(true);
  await act(async () => root?.unmount());
  state.config = { host: null, installationEnabled: false };
  await mount(<PluginStorePanel install={install} />);
  expect(document.body.textContent).toContain("当前平台不能安装移动插件");
});

it("安装中取消回到确认步骤，不显示失败", async () => {
  const compatible = centerRelease("1.0.0", "r1");
  state.catalog = [entry(compatible, compatible)];
  state.resolution = resolution(compatible);
  let reject: (error: Error) => void = () => undefined;
  state.install.mockReturnValue(new Promise((_resolve, fail) => (reject = fail)));
  const install = (await import("./data/center-queries")).useMobileCenterInstall();
  await mount(<PluginStorePanel install={install} />);
  await click(button("安装 v1.0.0"));
  await click(
    [...document.body.querySelectorAll("button")]
      .filter(item => item.textContent?.trim() === "安装 v1.0.0")
      .at(-1)
  );
  await click(button("取消下载"));
  expect(state.cancel).toHaveBeenCalled();
  await act(async () => {
    reject(new Error("aborted"));
    await Promise.resolve();
  });
  expect(document.body.textContent).not.toContain("失败");
  expect(document.body.textContent).toContain("从插件中心下载");
});

it("详情：资料取本平台最高声明版本，历史标记最新、可安装、已安装与未声明", async () => {
  const ios = centerRelease("2.0.0", "r3");
  const target = ios.targets.android;
  if (!target) throw new Error("样本缺少 Android 目标");
  const iosOnly: CenterRelease = { ...ios, targets: { ios: target } };
  const v14 = centerRelease("1.4.0", "r2");
  const v10 = centerRelease("1.0.0", "r1");
  state.versions = [iosOnly, v14, v10];
  state.resolution = resolution(v14);
  state.installed = [{ id: "example.counter", version: "1.0.0" }];
  state.pageParams = { pluginId: "example.counter" };
  await mount(<PluginStoreDetail />);
  expect(document.body.textContent).toContain("最新 v1.4.0");
  expect(document.body.textContent).toContain("已安装 v1.0.0");
  expect(button("更新到 v1.4.0")).toBeDefined();
  expect(document.body.querySelector('[aria-label="平台声明"]')?.textContent).toContain(
    "Tau 0.2.0"
  );
  const rows = [...document.body.querySelectorAll('[aria-label="版本历史"] li')].map(
    item => item.textContent
  );
  expect(rows[0]).toContain("最新");
  expect(rows[0]).toContain("未声明Android");
  expect(rows[1]).toContain("可安装");
  expect(rows[2]).toContain("已安装");
});

it("详情：无兼容版本时列出原因且不提供安装", async () => {
  state.versions = [centerRelease("1.0.0", "r1")];
  state.resolution = resolution(null);
  state.pageParams = { pluginId: "example.counter" };
  await mount(<PluginStoreDetail />);
  expect(document.body.querySelector('[aria-label="不可安装原因"]')?.textContent).toContain(
    "没有已发布的版本"
  );
  expect(document.body.textContent).toContain("暂不可安装");
});

it("插件中心默认商店，可切到已安装，参数可直达已安装", async () => {
  await mount(<PluginManager />);
  expect(document.body.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe(
    "商店"
  );
  await click(button("已安装"));
  expect(document.body.textContent).toContain("已安装列表");
  await act(async () => root?.unmount());
  state.pageParams = { tab: "installed" };
  await mount(<PluginManager />);
  expect(document.body.textContent).toContain("已安装列表");
});
