vi.mock("./transport", () => ({ connectMobilePluginTransport: vi.fn(async () => vi.fn()) }));
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { definePlugin, type PluginContext } from "@tau/plugins";
import { MobilePluginProvider } from "./PluginProvider";
import { MobilePluginRuntime } from "./runtime";

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
