import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { createMemoryStorage } from "@tau/plugins/host";
import { createPluginEnvironmentStore } from "@tau/plugins/environment-host";
import { MobilePluginRuntime } from "../../app/plugins/runtime";
import { readMobilePlugins, setMobilePluginEnabled } from "../../services/plugins";
import { InstalledPluginsPanel } from "./InstalledPluginsPanel";

let runtime: MobilePluginRuntime;
const session = vi.hoisted(() => ({ phase: "ready", reload: vi.fn() }));
const push = vi.hoisted(() => vi.fn());
vi.mock("../../app/plugins/context", () => ({
  useMobilePlugins: () => runtime,
  useMobilePluginStatus: () => ({ phase: session.phase, message: "", reload: session.reload }),
}));
vi.mock("../../router", () => ({ useNavigator: () => ({ push }) }));
vi.mock("../../services/plugins", async importOriginal => ({
  ...(await importOriginal<typeof import("../../services/plugins")>()),
  readMobilePlugins: vi.fn(async () => ({
    platform: "ios",
    appVersion: "0.2.0",
    development: true,
    packages: [{ id: "test.disabled", enabled: false }],
  })),
  setMobilePluginEnabled: vi.fn(async () => undefined),
  removeMobilePlugin: vi.fn(async () => undefined),
}));
function createRuntime() {
  const environment = createPluginEnvironmentStore({
    platform: "ios",
    input: { coarsePointer: true, finePointer: false },
  });
  return new MobilePluginRuntime(
    environment,
    createMemoryStorage(),
    "A.db",
    { push: vi.fn() },
    "0.2.0"
  );
}

async function renderManager(check: (container: HTMLElement) => Promise<void>, q = "") {
  runtime = createRuntime();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <InstalledPluginsPanel q={q} />
        </QueryClientProvider>
      )
    );
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 30));
    });
    await check(container);
  } finally {
    await act(async () => root.unmount());
    await runtime.dispose();
    client.clear();
    container.remove();
    document.body.innerHTML = "";
  }
}
const findButton = (scope: ParentNode, text: string) =>
  [...scope.querySelectorAll("button")].find(button => button.textContent?.trim() === text);

const toggle = (scope: ParentNode, label: string) =>
  scope.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);

it("未启用包不需要进入运行时，开关保存启用意图，整行进入详情", async () => {
  await renderManager(async container => {
    expect(container.textContent).toContain("已停用");
    expect(runtime.host.listPlugins()).toHaveLength(0);
    await act(async () => toggle(container, "启用 test.disabled")?.click());
    expect(setMobilePluginEnabled).toHaveBeenCalledWith("test.disabled", true);
    expect(runtime.host.listPlugins()).toHaveLength(0);
    const row = [...container.querySelectorAll("button:not([role=switch])")].find(button =>
      button.textContent?.includes("test.disabled")
    ) as HTMLButtonElement | undefined;
    await act(async () => row?.click());
    expect(push).toHaveBeenCalledWith("pluginDetail", { pluginId: "test.disabled" });
  });
});

it("待生效与启用意图未体现时提示变更，「立即生效」重建插件会话", async () => {
  vi.mocked(readMobilePlugins).mockResolvedValueOnce({
    platform: "ios",
    appVersion: "0.2.0",
    development: true,
    packages: [{ id: "test.pending", enabled: true, pending: true }],
  });
  await renderManager(async container => {
    expect(container.textContent).toContain("待生效");
    expect(container.textContent).not.toContain("运行中");
    expect(container.textContent).toContain("1 个插件变更等待生效");
    await act(async () => findButton(container, "立即生效")?.click());
    expect(session.reload).toHaveBeenCalled();
  });
});

it("插件会话启动中显示加载横幅，不误报变更", async () => {
  session.phase = "starting";
  vi.mocked(readMobilePlugins).mockResolvedValueOnce({
    platform: "ios",
    appVersion: "0.2.0",
    development: true,
    packages: [{ id: "test.on", enabled: true }],
  });
  try {
    await renderManager(async container => {
      expect(container.textContent).toContain("插件加载中");
      expect(container.textContent).not.toContain("等待生效");
    });
  } finally {
    session.phase = "ready";
  }
});

it("清单读取失败显示重试，不展示空态", async () => {
  vi.mocked(readMobilePlugins).mockRejectedValueOnce(new Error("原生清单不可用"));
  await renderManager(async container => {
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("原生清单不可用");
    expect(container.textContent).not.toContain("还没有安装插件");
    expect(findButton(container, "重试")).toBeDefined();
  });
});

it("当前版本与待生效版本分开展示，撤回状态优先于普通错误", async () => {
  vi.mocked(readMobilePlugins).mockResolvedValueOnce({
    platform: "ios",
    appVersion: "0.2.0",
    development: true,
    packages: [
      {
        id: "test.update",
        enabled: true,
        currentVersion: "1.0.0",
        pendingVersion: "1.1.0",
        pending: true,
      },
      {
        id: "test.revoked",
        enabled: false,
        currentVersion: "2.0.0",
        blocked: true,
        revoked: { kind: "revoked", reason: "审核撤回" },
        error: "中心版本不可用",
        statusStale: true,
      },
    ],
  });
  await renderManager(async container => {
    const update = container.querySelector('[data-plugin-id="test.update"]');
    expect(update?.textContent).toContain("待生效 v1.1.0");
    expect(update?.textContent).toContain("v1.0.0");
    const revoked = container.querySelector('[data-plugin-id="test.revoked"]');
    expect(revoked?.textContent).toContain("已撤回");
    expect(revoked?.textContent).not.toContain("失败");
    expect(container.textContent).toContain("发布状态未刷新");
  });
});

it("生产原生清单关闭管理操作：不显示开关并说明原因", async () => {
  vi.mocked(readMobilePlugins).mockResolvedValueOnce({
    platform: "android",
    appVersion: "0.2.0",
    development: false,
    packages: [{ id: "test.production", enabled: false }],
  });
  await renderManager(async container => {
    expect(container.querySelector('[role="switch"]')).toBeNull();
    expect(container.textContent).toContain("当前构建未开放插件管理操作");
  });
});

it("顶栏关键词按名称或 ID 过滤已安装列表", async () => {
  await renderManager(async container => {
    expect(container.textContent).toContain("没有找到匹配的插件");
  }, "不存在");
});
