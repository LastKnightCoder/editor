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
  installed: [] as Record<string, unknown>[],
  runtime: null as unknown,
  manage: true,
  run: vi.fn(),
  pageParams: {} as Record<string, string>,
  install: vi.fn(),
  cancel: vi.fn(),
  /** 模拟应用级任务表：替换即通知，供 useSyncExternalStore 订阅。 */
  tasks: { map: new Map<string, unknown>(), listeners: new Set<() => void>() },
}));
function setTask(pluginId: string, task: Record<string, unknown> | null) {
  const next = new Map(state.tasks.map);
  if (task) next.set(pluginId, { pluginId, ...task });
  else next.delete(pluginId);
  state.tasks.map = next;
  for (const listener of state.tasks.listeners) listener();
}
const ok = <T,>(data: T) => ({
  data,
  isPending: false,
  isError: false,
  error: null,
  isRefetching: false,
  refetch: vi.fn(),
});
vi.mock("./data/center-queries", async () => {
  const { useSyncExternalStore } = await import("react");
  const subscribe = (listener: () => void) => {
    state.tasks.listeners.add(listener);
    return () => void state.tasks.listeners.delete(listener);
  };
  return {
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
    useMobileCenterInstall: () => {
      const tasks = useSyncExternalStore(subscribe, () => state.tasks.map);
      return {
        tasks,
        task: (pluginId: string) => tasks.get(pluginId) ?? null,
        install: state.install,
        cancel: state.cancel,
        retry: vi.fn(),
        refreshStatuses: vi.fn(),
      };
    },
  };
});
vi.mock("./data/usePluginManager", () => ({
  usePluginManager: () => ({
    items: state.installed,
    managementEnabled: state.manage,
    loading: false,
    actions: { run: state.run },
  }),
}));
vi.mock("../../app/plugins/context", () => ({
  useMobilePlugins: () => state.runtime,
  useMobilePluginStatus: () => ({ phase: "ready", message: "", reload: vi.fn() }),
}));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn(async () => undefined) }));
vi.mock("./components/PluginMarkdown", () => ({
  PluginMarkdown: ({ source }: { source: string }) => <pre>{source}</pre>,
}));
vi.mock("../../router", () => ({
  useNavigator: () => navigator,
  usePage: () => ({ params: state.pageParams }),
}));
vi.mock("./PluginPageView", () => ({
  PluginPageShell: (props: {
    title?: string;
    actions?: ReactNode;
    header?: ReactNode;
    children: ReactNode;
  }) => (
    <div>
      <header>{props.header ?? <h1>{props.title}</h1>}</header>
      {props.header ? null : props.actions}
      {props.children}
    </div>
  ),
}));
vi.mock("./InstalledPluginsPanel", () => ({ InstalledPluginsPanel: () => <p>已安装列表</p> }));

const { PluginStorePanel } = await import("./PluginStorePanel");
const { PluginDetail } = await import("./PluginDetail");
const { PluginManager } = await import("./PluginManager");

const host = {
  platform: "android",
  appVersion: "1.0.0",
  apiVersions: [1],
  formatVersions: [3],
  profiles: ["web-v1"],
  capabilities: ["pages"],
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
      ? { status: "compatible", reasons: [] }
      : {
          status: "incompatible",
          reasons: [{ code: "APP_VERSION_TOO_LOW", minAppVersion: "2.0.0" }],
        },
  };
}
const resolution = (release: CenterRelease | null): CenterResolution => ({
  release,
  compatibility: release
    ? { status: "compatible", reasons: [] }
    : { status: "incompatible", reasons: [{ code: "NO_RELEASE" }] },
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
    runtime: null,
    manage: true,
    pageParams: {},
  });
  state.run.mockReset().mockResolvedValue(undefined);
  state.install.mockReset();
  state.cancel.mockReset().mockResolvedValue(undefined);
  state.tasks.map = new Map();
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
      installed: null,
      installationEnabled: true,
    })
  ).toEqual({ kind: "unavailable" });
  expect(
    storePrimaryAction({
      compatibleVersion: "1.0.0",
      installed: { version: "1.0.0" },
      installationEnabled: true,
    })
  ).toEqual({ kind: "installed", version: "1.0.0" });
  expect(
    storePrimaryAction({
      compatibleVersion: null,
      installed: { version: "1.0.0" },
      installationEnabled: true,
    })
  ).toEqual({ kind: "installed", version: "1.0.0" });
  expect(
    storePrimaryAction({
      compatibleVersion: "1.2.0",
      installed: { version: "1.0.0" },
      installationEnabled: true,
    })
  ).toEqual({ kind: "update", version: "1.2.0", allowed: true });
  expect(
    storePrimaryAction({
      compatibleVersion: "1.2.0",
      installed: null,
      installationEnabled: false,
    })
  ).toMatchObject({ kind: "install", allowed: false, reason: "当前版本的 Tau 暂未开放插件安装" });
});

it("主动作：首装待生效（无当前版本）与更新待生效都显示待生效，不再提示安装", () => {
  expect(
    storePrimaryAction({
      compatibleVersion: "1.2.0",
      installed: { version: null, pending: true, pendingVersion: "1.2.0" },
      installationEnabled: true,
    })
  ).toEqual({ kind: "pending", version: "1.2.0" });
  expect(
    storePrimaryAction({
      compatibleVersion: "1.2.0",
      installed: { version: "1.0.0", pending: true, pendingVersion: null },
      installationEnabled: true,
    })
  ).toEqual({ kind: "pending", version: null });
});

const installedItem = (overrides: Record<string, unknown> = {}) => {
  const allowed = { allowed: true, reason: null };
  return {
    id: "example.counter",
    name: "计数器",
    version: "1.0.0",
    enabled: true,
    active: true,
    pending: false,
    editor: false,
    error: null,
    hasBackup: false,
    settings: [],
    permissions: [],
    actions: {
      enable: allowed,
      disable: allowed,
      uninstall: allowed,
      restore: allowed,
      clearData: allowed,
      cancelPending: allowed,
    },
    ...overrides,
  };
};

it("商店列表：获取按钮确认后按 releaseId 安装，整行经导航打开详情", async () => {
  const latest = centerRelease("2.0.0", "r2");
  const compatible = centerRelease("1.4.0", "r1");
  state.catalog = [entry(latest, compatible)];
  state.resolution = resolution(compatible);
  state.install.mockResolvedValue(undefined);
  await mount(<PluginStorePanel q="" />);
  await click(
    [...document.body.querySelectorAll("button")].find(item => item.textContent?.includes("计数器"))
  );
  expect(navigator.push).toHaveBeenCalledWith("pluginDetail", { pluginId: "example.counter" });
  await click(button("获取"));
  expect(document.body.textContent).toContain("从插件中心下载");
  expect(document.body.textContent).toContain("校验通过后自动启用");
  await click(button("安装 v1.4.0"));
  expect(state.install).toHaveBeenCalledWith("example.counter", "r1");
  await act(async () => {
    await Promise.resolve();
  });
  expect(document.body.textContent).toContain("已安装 v1.4.0，正在启用");
});

it("首装待生效（尚无当前版本）在商店显示待生效，不再提示获取", async () => {
  const compatible = centerRelease("1.4.0", "r1");
  state.catalog = [entry(compatible, compatible)];
  state.installed = [
    installedItem({ version: null, pending: true, pendingVersion: "1.4.0", active: false }),
  ];
  await mount(<PluginStorePanel q="" />);
  expect(document.body.textContent).toContain("待生效");
  expect(button("获取")).toBeUndefined();
});

it("开关关闭时可浏览但不能安装；没有宿主时说明当前平台不能安装", async () => {
  state.catalog = [entry(centerRelease("1.0.0", "r1"), centerRelease("1.0.0", "r1"))];
  state.config = { host, installationEnabled: false };
  await mount(<PluginStorePanel q="" />);
  expect(document.body.textContent).toContain("当前版本的 Tau 暂未开放插件安装，可先浏览");
  expect((button("获取") as HTMLButtonElement).disabled).toBe(true);
  await act(async () => root?.unmount());
  state.config = { host: null, installationEnabled: false };
  await mount(<PluginStorePanel q="" />);
  expect(document.body.textContent).toContain("当前平台不能安装移动插件");
});

it("安装中取消回到确认步骤，不显示失败", async () => {
  const compatible = centerRelease("1.0.0", "r1");
  state.catalog = [entry(compatible, compatible)];
  state.resolution = resolution(compatible);
  let reject: (error: Error) => void = () => undefined;
  state.install.mockImplementation((pluginId: string, releaseId: string) => {
    setTask(pluginId, { releaseId, phase: "downloading", status: "pending", error: null });
    return new Promise((_resolve, fail) => (reject = fail));
  });
  await mount(<PluginStorePanel q="" />);
  await click(button("获取"));
  await click(button("安装 v1.0.0"));
  expect(document.body.textContent).toContain("关闭面板不影响下载");
  await click(button("取消下载"));
  expect(state.cancel).toHaveBeenCalledWith("example.counter");
  await act(async () => {
    setTask("example.counter", null);
    reject(new Error("aborted"));
    await Promise.resolve();
  });
  expect(document.body.textContent).not.toContain("失败");
  expect(document.body.textContent).toContain("从插件中心下载");
});

it("安装中可关闭面板转后台，其他插件仍可并行发起安装", async () => {
  const compatible = centerRelease("1.0.0", "r1");
  state.catalog = [
    entry(compatible, compatible),
    { ...entry(compatible, compatible), pluginId: "example.other", name: "另一个" },
  ];
  state.resolution = resolution(compatible);
  state.install.mockImplementation((pluginId: string, releaseId: string) => {
    setTask(pluginId, { releaseId, phase: "downloading", status: "pending", error: null });
    return new Promise(() => undefined);
  });
  await mount(<PluginStorePanel q="" />);
  const [first] = [...document.body.querySelectorAll("button")].filter(
    item => item.textContent?.trim() === "获取"
  );
  await click(first);
  await click(button("安装 v1.0.0"));
  await click(button("后台下载"));
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 400));
  });
  expect(document.body.textContent).not.toContain("关闭面板不影响下载");
  expect(document.body.querySelector('[aria-label="取消下载"]')).not.toBeNull();
  await click(button("获取"));
  expect(document.body.textContent).toContain("从插件中心下载");
  await click(button("安装 v1.0.0"));
  expect(state.install).toHaveBeenLastCalledWith("example.other", "r1");
});

it("详情：已安装可更新时头部有启停开关与更新按钮，版本标签标记最新、可安装、已安装与未声明", async () => {
  const ios = centerRelease("2.0.0", "r3");
  const target = ios.targets.android;
  if (!target) throw new Error("样本缺少 Android 目标");
  const iosOnly: CenterRelease = { ...ios, targets: { ios: target } };
  const v14 = centerRelease("1.4.0", "r2");
  const v10 = centerRelease("1.0.0", "r1");
  state.versions = [iosOnly, v14, v10];
  state.resolution = resolution(v14);
  state.installed = [installedItem()];
  state.pageParams = { pluginId: "example.counter" };
  await mount(<PluginDetail />);
  expect(document.body.textContent).toContain("@fixture");
  expect(document.body.textContent).toContain("运行中");
  expect(document.body.textContent).toContain("测试资料");
  expect(button("更新到 v1.4.0")).toBeDefined();
  await click(document.body.querySelector('[aria-label="停用 计数器"]') ?? undefined);
  expect(state.run).toHaveBeenCalledWith("disable", "example.counter");
  await click(button("版本"));
  const rows = [...document.body.querySelectorAll('[aria-label="版本历史"] li')].map(
    item => item.textContent
  );
  expect(rows[0]).toContain("最新");
  expect(rows[0]).toContain("未声明Android");
  expect(rows[1]).toContain("可安装");
  expect(rows[2]).toContain("已安装");
  expect(document.body.querySelector('[aria-label="平台声明"]')?.textContent).toContain(
    "Tau 0.2.0"
  );
});

it("详情：未安装时只有介绍/权限/版本，无兼容版本时列出原因且不提供安装", async () => {
  state.versions = [centerRelease("1.0.0", "r1")];
  state.resolution = resolution(null);
  state.pageParams = { pluginId: "example.counter" };
  await mount(<PluginDetail />);
  const tabs = [...document.body.querySelectorAll('[role="tab"]')].map(item => item.textContent);
  expect(tabs).toEqual(["介绍", "权限", "版本"]);
  expect(document.body.querySelector('[aria-label="不可安装原因"]')?.textContent).toContain(
    "没有已发布的版本"
  );
  expect(document.body.textContent).toContain("暂不可安装");
  await click(button("权限"));
  expect(document.body.textContent).toContain("不需要额外权限");
});

it("详情：插件中心没有记录时仍展示本机已安装插件，并可从 ⋯ 菜单卸载", async () => {
  state.installed = [installedItem({ id: "dev.local", name: "本地插件", active: false })];
  state.pageParams = { pluginId: "dev.local" };
  await mount(<PluginDetail />);
  expect(document.body.textContent).toContain("本地插件");
  expect(document.body.textContent).toContain("未连上插件中心");
  await click(document.body.querySelector('[aria-label="管理插件"]') ?? undefined);
  await click(
    [...document.body.querySelectorAll("button")].find(item => item.textContent?.startsWith("卸载"))
  );
  await click(button("卸载"));
  expect(state.run).toHaveBeenCalledWith("uninstall", "dev.local");
});

it.each([
  ["sync", "打开同步配置", "syncProvider", { providerId: "example.counter" }],
  ["upload", "打开上传配置", "uploadProvider", { providerId: "example.counter" }],
  ["tts", "打开语音配置", "settingsModule", { module: "voice" }],
])("详情：%s 设置进入宿主配置页", async (target, label, page, params) => {
  const component = vi.fn(() => <p>提供方表单</p>);
  const context = { pluginId: "example.counter" };
  state.runtime = {
    settings: new Map([
      [
        "provider",
        { context, definition: { id: "provider", title: "存储配置", target, component } },
      ],
    ]),
    active: () => true,
  };
  state.installed = [installedItem()];
  state.pageParams = { pluginId: context.pluginId };
  await mount(<PluginDetail />);
  await click(button("设置"));
  await click(button(label));
  expect(navigator.push).toHaveBeenCalledWith(page, params);
  expect(component).not.toHaveBeenCalled();
});

it("插件中心默认商店，可切到已安装；右上角搜索横向展开，取消后收起", async () => {
  await mount(<PluginManager />);
  expect(document.body.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe(
    "商店"
  );
  await click(document.body.querySelector('[aria-label="搜索插件"]') ?? undefined);
  expect(document.body.querySelector('input[type="search"]')).not.toBeNull();
  await click(button("取消"));
  expect(document.body.querySelector('input[type="search"]')).toBeNull();
  await click(button("已安装"));
  expect(document.body.textContent).toContain("已安装列表");
  await act(async () => root?.unmount());
  state.pageParams = { tab: "installed" };
  await mount(<PluginManager />);
  expect(document.body.textContent).toContain("已安装列表");
});
