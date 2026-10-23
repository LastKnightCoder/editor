import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { createMemoryStorage } from "@tau/plugins/host";
import { createPluginEnvironmentStore } from "@tau/plugins/environment-host";
import { MobilePluginRuntime } from "../../app/plugins/runtime";
import {
  readMobilePlugins,
  removeMobilePlugin,
  setMobilePluginEnabled,
} from "../../services/plugins";
import { InstalledPluginsPanel } from "./InstalledPluginsPanel";

let runtime: MobilePluginRuntime;
vi.mock("../../app/plugins/context", () => ({ useMobilePlugins: () => runtime }));
vi.mock("../../router", () => ({ useNavigator: () => ({ push: vi.fn() }) }));
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

async function renderManager(check: (container: HTMLElement) => Promise<void>) {
  runtime = createRuntime();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <InstalledPluginsPanel />
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

it("未启用包不需要进入运行时，也能打开管理并保存启用意图", async () => {
  await renderManager(async container => {
    const enable = findButton(container, "启用");
    expect(enable).toBeDefined();
    expect(container.textContent).toContain("已停用");
    expect(runtime.host.listPlugins()).toHaveLength(0);
    await act(async () => enable?.click());
    expect(setMobilePluginEnabled).toHaveBeenCalledWith("test.disabled", true);
    expect(runtime.host.listPlugins()).toHaveLength(0);
  });
});

it("待生效版本号未知时不冒充当前版本，启用意图与运行状态分开展示", async () => {
  vi.mocked(readMobilePlugins).mockResolvedValueOnce({
    platform: "ios",
    appVersion: "0.2.0",
    development: true,
    packages: [{ id: "test.pending", enabled: true, pending: true }],
  });
  await renderManager(async container => {
    expect(container.textContent).toContain("待生效");
    expect(container.textContent).toContain("有新版本等待生效");
    expect(container.textContent).not.toContain("运行中");
    expect(container.textContent).toContain("下次打开应用时启用");
    expect(findButton(container, "取消待生效更新")).toBeDefined();
  });
});

it("卸载需要确认，说明保留数据后才调用控制器", async () => {
  await renderManager(async container => {
    await act(async () => findButton(container, "卸载")?.click());
    expect(removeMobilePlugin).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("插件数据都会保留");
    const confirm = [...document.body.querySelectorAll("button")].filter(
      button => button.textContent?.trim() === "卸载"
    );
    await act(async () => confirm.at(-1)?.click());
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 30));
    });
    expect(removeMobilePlugin).toHaveBeenCalledWith("test.disabled");
  });
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
    expect(update?.textContent).toContain("· v1.0.0");
    expect(update?.textContent).toContain("v1.1.0 将在下次打开应用时生效");
    const revoked = container.querySelector('[data-plugin-id="test.revoked"]');
    expect(revoked?.textContent).toContain("已撤回");
    expect(revoked?.textContent).toContain("审核撤回");
    expect(revoked?.textContent).toContain("发布状态未刷新");
    expect(revoked?.textContent).not.toContain("失败");
  });
});

it("生产原生清单关闭管理操作，即使前端处于开发模式", async () => {
  vi.mocked(readMobilePlugins).mockResolvedValueOnce({
    platform: "android",
    appVersion: "0.2.0",
    development: false,
    packages: [{ id: "test.production", enabled: false }],
  });
  await renderManager(async container => {
    expect(findButton(container, "启用")).toBeUndefined();
    expect(findButton(container, "卸载")).toBeUndefined();
    expect(container.textContent).toContain("当前构建未开放插件管理操作");
  });
});
