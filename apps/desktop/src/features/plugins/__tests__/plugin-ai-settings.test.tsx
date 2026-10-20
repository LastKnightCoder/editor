import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { useSettingsStore } from "@/app/settingsStore";
const api = vi.hoisted(() => ({
  hostOnly: false,
  configure: vi.fn(async () => {}),
  revoke: vi.fn(async () => {}),
  cancel: vi.fn(async () => {}),
}));
vi.mock("@/commands/plugin-ai", () => ({
  getPluginAIInfo: async () => ({
    id: "test.ai",
    name: "测试",
    features: api.hostOnly ? [] : [{ id: "summary", name: "摘要" }],
    hostFeatures: api.hostOnly ? ["flashcardGeneration"] : [],
    config: {
      enabled: true,
      dailyRequests: 10,
      dailyTokens: 10000,
      concurrency: 1,
      assignments: { summary: { providerId: "p", modelId: "m" } },
    },
  }),
  pluginAIModels: async () => [{ providerId: "p", modelId: "m", label: "我的模型" }],
  configurePluginAI: api.configure,
  revokePluginAI: api.revoke,
  cancelPluginAI: api.cancel,
  runningPluginAI: async () => [
    {
      requestId: "request",
      pluginId: "test.ai",
      pluginName: "测试",
      featureName: "摘要",
      startedAt: 1,
    },
  ],
}));
import { PluginAISettings } from "../components/PluginAISettings";
import { PluginAIActivity } from "@/features/settings/sections/PluginAIActivity";

const cleanups: (() => void)[] = [];
function render(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<QueryClientProvider client={client}>{node}</QueryClientProvider>));
  cleanups.push(() => {
    act(() => root.unmount());
    client.clear();
    container.remove();
  });
  return container;
}
afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup());
  vi.clearAllMocks();
  api.hostOnly = false;
});

it("只使用宿主闪卡能力时显示继承模型说明和额度，不要求再分配模型或开启自定义 AI", async () => {
  api.hostOnly = true;
  const container = render(<PluginAISettings pluginId="test.ai" />);
  await vi.waitFor(() => expect(container.textContent).toContain("无需在此另选模型"));
  expect(container.textContent).toContain("每日请求次数");
  expect(container.querySelector('[role="combobox"]')).toBeNull();
  expect(container.querySelector('[role="switch"]')).toBeNull();
});

it("插件详情跳转到已有大模型用量页并带插件筛选，关闭授权调用宿主配置", async () => {
  const container = render(<PluginAISettings pluginId="test.ai" />);
  await vi.waitFor(() => expect(container.textContent).toContain("查看用量"));
  act(() =>
    [...container.querySelectorAll("button")]
      .find(button => button.textContent === "查看用量")!
      .click()
  );
  expect(useSettingsStore.getState()).toMatchObject({
    open: true,
    section: "llm",
    llmTab: "usage",
    usagePluginId: "test.ai",
  });
  act(() => (container.querySelector('[role="switch"]') as HTMLButtonElement).click());
  await vi.waitFor(() =>
    expect(api.configure).toHaveBeenCalledWith(
      "test.ai",
      expect.objectContaining({ enabled: false })
    )
  );
});

it("统一统计的运行控制支持单次取消与撤销插件授权", async () => {
  const container = render(<PluginAIActivity pluginId="test.ai" />);
  await vi.waitFor(() => expect(container.textContent).toContain("摘要"));
  act(() =>
    [...container.querySelectorAll("button")].find(button => button.textContent === "取消")!.click()
  );
  await vi.waitFor(() => expect(api.cancel).toHaveBeenCalledWith("request"));
  await vi.waitFor(() =>
    expect(
      [...container.querySelectorAll("button")].find(
        button => button.textContent === "停止调用并关闭自定义 AI"
      )!.disabled
    ).toBe(false)
  );
  act(() =>
    [...container.querySelectorAll("button")]
      .find(button => button.textContent === "停止调用并关闭自定义 AI")!
      .click()
  );
  await vi.waitFor(() => expect(api.revoke).toHaveBeenCalledWith("test.ai"));
});
