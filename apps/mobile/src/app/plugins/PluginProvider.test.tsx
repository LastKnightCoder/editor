vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => vi.fn()) }));
vi.mock("./transport", () => ({ connectMobilePluginTransport: vi.fn(async () => vi.fn()) }));
vi.mock("./shared-modules", () => ({ mobileSharedPluginModules: {} }));
vi.mock("@tau/plugins/source-editor-host", () => ({}));
vi.mock("../../services/editorKit", () => ({
  getMobileContentKit: () => ({ extend: vi.fn() }),
}));
vi.mock("../../services/editorMarkdown", () => ({ mobileCodecComposition: [] }));
vi.mock("../../features/plugins/PluginEntityPicker", () => ({
  PluginEntityPicker: ({
    request,
  }: {
    request: import("./app-types").MobileEntityPickRequest | null;
  }) => (request ? <button onClick={request.cancel}>选择窗口已挂载</button> : null),
}));
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { definePlugin, type PluginContext } from "@tau/plugins";
import { MobilePluginProvider } from "./PluginProvider";
import { MobilePluginRuntime } from "./runtime";
import { mobilePluginState } from "./content";
import { useMobilePluginStatus } from "./context";
import { getMobileCenterInstallStore } from "./center-install";
import { createMobileApp } from "./app";
import { connectMobilePluginTransport } from "./transport";

vi.mock("../../router", () => ({ useNavigator: () => navigator }));
const navigator = { push: vi.fn() };
vi.mock("../../services/plugins", async importOriginal => ({
  ...(await importOriginal<typeof import("../../services/plugins")>()),
  applyPendingMobilePlugins: vi.fn(async () => undefined),
  readMobilePlugins: vi.fn(async () => ({
    platform: "ios",
    appVersion: "0.2.0",
    packages: [],
    development: true,
  })),
}));
it("激活等待选择时先挂选择器，取消后启动继续完成", async () => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.stubGlobal("navigator", { userActivation: { isActive: true } });
  vi.mocked(connectMobilePluginTransport).mockImplementationOnce(async runtime => {
    runtime.app = createMobileApp(runtime.workspaceId, "startup", navigator, async () => false);
    return () => runtime.app?.dispose();
  });
  const start = vi.spyOn(MobilePluginRuntime.prototype, "start").mockImplementation(async function (
    this: MobilePluginRuntime
  ) {
    this.host.registerTrusted(
      definePlugin({
        id: "test.pick-startup",
        name: "启动选择",
        version: "1",
        create: () => ({
          activate: async context => {
            await context.app.pick({ kinds: ["card"] });
          },
        }),
      })
    );
    await this.host.enable("test.pick-startup");
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const settle = async (predicate: () => boolean) => {
    for (let index = 0; index < 60 && !predicate(); index++)
      await act(async () => {
        await vi.dynamicImportSettled();
        await new Promise(resolve => setTimeout(resolve, 10));
      });
  };
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <MobilePluginProvider database="A.db">
            <p>工作区</p>
          </MobilePluginProvider>
        </QueryClientProvider>
      )
    );
    await settle(() => !!container.querySelector("button"));
    expect(container.textContent).toContain("选择窗口已挂载");
    expect(mobilePluginState.get().phase).toBe("starting");
    await act(async () => container.querySelector("button")!.click());
    await settle(() => mobilePluginState.get().phase === "ready");
    expect(mobilePluginState.get().phase).toBe("ready");
  } finally {
    await act(async () => root.unmount());
    client.clear();
    container.remove();
    start.mockRestore();
    vi.unstubAllGlobals();
    localStorage.clear();
  }
});
it("切库立即失活旧 context，等待未完成启动收尾后才创建新会话", async () => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  const contexts: PluginContext[] = [];
  const release: (() => void)[] = [];
  const start = vi.spyOn(MobilePluginRuntime.prototype, "start").mockImplementation(async function (
    this: MobilePluginRuntime
  ) {
    this.host.registerTrusted(
      definePlugin({
        id: "test.session",
        name: "会话",
        version: "1",
        create: () => ({
          activate(context) {
            contexts.push(context);
          },
        }),
      })
    );
    await this.host.enable("test.session");
    await new Promise<void>(resolve => release.push(resolve));
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const render = (database: string) =>
    act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <MobilePluginProvider key={database} database={database}>
            <p>工作区</p>
          </MobilePluginProvider>
        </QueryClientProvider>
      )
    );
  const settle = async (count: number) => {
    for (let index = 0; index < 60 && contexts.length < count; index++)
      await act(async () => {
        await vi.dynamicImportSettled();
        await new Promise(resolve => setTimeout(resolve, 10));
      });
  };
  try {
    await render("A.db");
    await settle(1);
    expect(contexts).toHaveLength(1);
    await render("B.db");
    expect(contexts[0].signal.aborted).toBe(true);
    expect(contexts).toHaveLength(1);
    await act(async () => release[0]());
    await settle(2);
    expect(contexts).toHaveLength(2);
    expect(contexts[1].workspaceId).toBe("B.db");
    expect(contexts[1].signal.aborted).toBe(false);
  } finally {
    await act(async () => {
      release.forEach(resolve => resolve());
      root.unmount();
    });
    client.clear();
    container.remove();
    start.mockRestore();
    vi.unstubAllGlobals();
    localStorage.clear();
  }
});

it("children 不等待插件立即渲染；启动中为 starting，完成后 ready，reload 重建会话", async () => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  const release: (() => void)[] = [];
  const start = vi
    .spyOn(MobilePluginRuntime.prototype, "start")
    .mockImplementation(() => new Promise<void>(resolve => release.push(resolve)));
  let reload: () => void = () => undefined;
  function Probe() {
    const status = useMobilePluginStatus();
    reload = status.reload;
    return <p>工作区·{status.phase}</p>;
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const settle = async (predicate: () => boolean) => {
    for (let index = 0; index < 60 && !predicate(); index++)
      await act(async () => {
        await vi.dynamicImportSettled();
        await new Promise(resolve => setTimeout(resolve, 10));
      });
  };
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <MobilePluginProvider database="A.db">
            <Probe />
          </MobilePluginProvider>
        </QueryClientProvider>
      )
    );
    expect(container.textContent).toBe("工作区·starting");
    await settle(() => release.length === 1);
    await act(async () => release[0]());
    await settle(() => mobilePluginState.get().phase === "ready");
    expect(container.textContent).toBe("工作区·ready");
    await act(async () => reload());
    expect(container.textContent).toBe("工作区·starting");
    await settle(() => release.length === 2);
    expect(start).toHaveBeenCalledTimes(2);
    await act(async () => release[1]());
    await settle(() => mobilePluginState.get().phase === "ready");
    expect(container.textContent).toBe("工作区·ready");
  } finally {
    await act(async () => {
      release.forEach(resolve => resolve());
      root.unmount();
    });
    client.clear();
    container.remove();
    start.mockRestore();
    vi.unstubAllGlobals();
    localStorage.clear();
  }
});

it("中心更新下载完成且队列清空后自动重建会话，不需要点「立即生效」", async () => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  const center = await import("../../services/pluginCenter");
  const plugins = await import("../../services/plugins");
  const finish: (() => void)[] = [];
  const install = vi
    .spyOn(center, "installMobileCenterRelease")
    .mockImplementation(() => new Promise<void>(resolve => finish.push(resolve)));
  const start = vi.spyOn(MobilePluginRuntime.prototype, "start").mockResolvedValue(undefined);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const settle = async (predicate: () => boolean) => {
    for (let index = 0; index < 60 && !predicate(); index++)
      await act(async () => {
        await vi.dynamicImportSettled();
        await new Promise(resolve => setTimeout(resolve, 10));
      });
  };
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <MobilePluginProvider database="A.db">
            <p>工作区</p>
          </MobilePluginProvider>
        </QueryClientProvider>
      )
    );
    await settle(() => mobilePluginState.get().phase === "ready");
    expect(start).toHaveBeenCalledTimes(1);
    const store = getMobileCenterInstallStore(client);
    let first!: Promise<void>, second!: Promise<void>;
    await act(async () => {
      first = store.install("test.a", "rel-a");
      second = store.install("test.b", "rel-b");
    });
    await settle(() => finish.length === 2);
    vi.mocked(plugins.readMobilePlugins).mockResolvedValue({
      platform: "ios",
      appVersion: "0.2.0",
      development: true,
      packages: [
        { id: "test.a", enabled: true, pending: true, currentVersion: "1.0.0" },
        { id: "test.b", enabled: true, pending: true, currentVersion: "1.0.0" },
      ],
    });
    await act(async () => {
      finish[0]();
      await first;
    });
    await settle(() => false);
    // 还有任务在下载，不中途重建
    expect(start).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish[1]();
      await second;
    });
    await settle(() => start.mock.calls.length === 2);
    expect(start).toHaveBeenCalledTimes(2);
  } finally {
    await act(async () => root.unmount());
    client.clear();
    container.remove();
    install.mockRestore();
    start.mockRestore();
    vi.mocked(plugins.readMobilePlugins).mockResolvedValue({
      platform: "ios",
      appVersion: "0.2.0",
      packages: [],
      development: true,
    });
    vi.unstubAllGlobals();
    localStorage.clear();
  }
});

it("中心首次安装无需管理页消费者，队列清空后重建会话加载独立技能", async () => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  const center = await import("../../services/pluginCenter");
  const plugins = await import("../../services/plugins");
  const install = vi.spyOn(center, "installMobileCenterRelease").mockResolvedValue(undefined);
  const start = vi.spyOn(MobilePluginRuntime.prototype, "start").mockResolvedValue(undefined);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const settle = async (predicate: () => boolean) => {
    for (let index = 0; index < 60 && !predicate(); index++)
      await act(async () => {
        await vi.dynamicImportSettled();
        await new Promise(resolve => setTimeout(resolve, 10));
      });
  };
  const packages: import("../../services/plugins").MobilePluginPackage[] = [
    {
      id: "example.summary",
      enabled: true,
      pending: false,
      skillRevision: "new-install",
      artifact: {
        kind: "skills",
        manifest: {
          id: "example.summary",
          name: "独立技能",
          version: "1.0.0",
          formatVersion: 1,
          apiVersion: 1,
          platform: "portable",
          targets: { ios: { minAppVersion: "0.2.0" } },
          skills: ["summary"],
          integrity: { "skills/summary/SKILL.md": "a".repeat(64) },
        },
      },
    },
  ];
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <MobilePluginProvider database="A.db">
            <p>工作区</p>
          </MobilePluginProvider>
        </QueryClientProvider>
      )
    );
    await settle(() => mobilePluginState.get().phase === "ready");
    vi.mocked(plugins.readMobilePlugins).mockResolvedValue({
      platform: "ios",
      appVersion: "0.2.0",
      development: true,
      packages,
    });
    await act(async () => {
      await getMobileCenterInstallStore(client).install("example.summary", "rel-skill");
    });
    await settle(() => start.mock.calls.length === 2);
    expect(start).toHaveBeenCalledTimes(2);
    expect(start.mock.calls[1][0]).toEqual(packages);
    expect(start.mock.calls[1][4]).toEqual({ safeMode: false });
  } finally {
    await act(async () => root.unmount());
    client.clear();
    container.remove();
    install.mockRestore();
    start.mockRestore();
    vi.mocked(plugins.readMobilePlugins).mockResolvedValue({
      platform: "ios",
      appVersion: "0.2.0",
      development: true,
      packages: [],
    });
    vi.unstubAllGlobals();
    localStorage.clear();
  }
});
