import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { definePlugin } from "@tau/plugins";
import { createMemoryStorage } from "@tau/plugins/host";
import { createPluginEnvironmentStore } from "@tau/plugins/environment-host";
import { MobilePluginRuntime } from "../../app/plugins/runtime";
import { PluginPageView } from "./PluginPageView";

let runtime: MobilePluginRuntime | null;
let phase = "ready";
let serialized = "invalid-json";
const navigator = { push: vi.fn(), goBack: vi.fn(), registerBackHandler: () => () => undefined };
vi.mock("../../app/plugins/context", () => ({
  useMobilePlugins: () => runtime,
  useMobilePluginStatus: () => ({ phase, message: "", reload: () => undefined }),
}));
vi.mock("../../router", () => ({
  usePage: () => ({
    params: { id: "test.params:main", params: serialized },
    navigator,
    entryId: "page-1",
  }),
}));
vi.mock("../../router/pageLifecycle", () => ({
  usePageInstanceContext: () => ({ phase: "active" }),
  usePageGuard: () => undefined,
}));

it("损坏的历史页面参数只显示页内错误，参数恢复后可以重新渲染", async () => {
  const environment = createPluginEnvironmentStore({
    platform: "ios",
    input: { coarsePointer: true, finePointer: false },
  });
  const created = new MobilePluginRuntime(
    environment,
    createMemoryStorage(),
    "A",
    navigator,
    "0.2.0"
  );
  runtime = created;
  created.host.registerTrusted(
    definePlugin({
      id: "test.params",
      name: "参数",
      version: "1",
      create: () => ({
        activate(context) {
          context.pages.register({ id: "main", title: "参数页", component: () => <p>正常页面</p> });
        },
      }),
    })
  );
  await created.host.enable("test.params");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<PluginPageView />));
    expect(container.textContent).toContain("页面参数无效");
    serialized = "{}";
    await act(async () => root.render(<PluginPageView />));
    expect(container.textContent).toContain("正常页面");
  } finally {
    await act(async () => root.unmount());
    await created.dispose();
    container.remove();
  }
});

it("插件会话启动中打开插件页显示加载态，落定后仍不可用才提示停用", async () => {
  runtime = null;
  phase = "starting";
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<PluginPageView />));
    expect(container.textContent).toContain("插件加载中");
    expect(container.textContent).not.toContain("插件已停用");
    phase = "ready";
    await act(async () => root.render(<PluginPageView />));
    expect(container.textContent).toContain("插件已停用或无法加载");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    phase = "ready";
  }
});
