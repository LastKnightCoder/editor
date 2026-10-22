import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { createMemoryStorage } from "@tau/plugins/host";
import { createPluginEnvironmentStore } from "@tau/plugins/environment-host";
import { MobilePluginRuntime } from "../../app/plugins/runtime";
import { setMobilePluginEnabled } from "../../services/plugins";
import { PluginManager } from "./PluginManager";

let runtime: MobilePluginRuntime;
vi.mock("../../app/plugins/context", () => ({ useMobilePlugins: () => runtime }));
vi.mock("../../router", () => ({ useNavigator: () => ({ push: vi.fn() }) }));
vi.mock("./PluginPageView", () => ({
  PluginPageShell: ({ children }: { children: import("react").ReactNode }) => <div>{children}</div>,
}));
vi.mock("../../services/plugins", async importOriginal => ({
  ...(await importOriginal<typeof import("../../services/plugins")>()),
  readMobilePlugins: vi.fn(async () => ({
    platform: "ios",
    appVersion: "0.2.0",
    development: true,
    packages: [{ id: "test.disabled", enabled: false }],
  })),
  setMobilePluginEnabled: vi.fn(async () => undefined),
}));
it("未启用包不需要进入运行时，也能打开管理并保存启用意图", async () => {
  const environment = createPluginEnvironmentStore({
    platform: "ios",
    layout: "compact",
    input: { touch: true, finePointer: false },
    capabilities: [],
  });
  runtime = new MobilePluginRuntime(
    environment,
    createMemoryStorage(),
    "A.db",
    { push: vi.fn() },
    "0.2.0"
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <PluginManager />
        </QueryClientProvider>
      )
    );
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 30));
    });
    const enable = [...container.querySelectorAll("button")].find(
      button => button.textContent === "启用"
    );
    expect(enable).toBeDefined();
    expect(runtime.host.listPlugins()).toHaveLength(0);
    await act(async () => enable?.click());
    expect(setMobilePluginEnabled).toHaveBeenCalledWith("test.disabled", true);
    expect(runtime.host.listPlugins()).toHaveLength(0);
  } finally {
    await act(async () => root.unmount());
    await runtime.dispose();
    client.clear();
    container.remove();
  }
});
