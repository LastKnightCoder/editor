import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import useSettingStore, { mergeSettingWithDefaults } from "@/stores/useSettingStore";
import { useSettingsStore } from "@/app/settingsStore";
import { LLMSection } from "../sections/LLMSection";

vi.mock("@/commands/piAi", () => ({
  piCatalogProviders: async () => ({ ok: true, providers: [] }),
  piCatalogModels: async () => ({ ok: true, models: [] }),
  piThinkingLevels: async () => ({ ok: true, levels: [], fromCatalog: false }),
}));

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;
const originalSetting = structuredClone(useSettingStore.getState().setting);

const loadModels = (models: unknown[]) => {
  // 用户报告：设置页读取缺少 input 的模型时整窗崩溃；保留真实加载与渲染链路。
  const setting = JSON.parse(
    JSON.stringify({
      llmProviders: [
        {
          id: "custom",
          name: "Custom",
          baseUrl: "https://example.com/v1",
          apiKey: "",
          api: "openai-completions",
          models,
        },
      ],
    })
  );
  useSettingStore.setState({ setting: mergeSettingWithDefaults(setting) });
};

const render = () =>
  act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <LLMSection />
      </QueryClientProvider>
    );
  });

const clickButton = async (name: string) => {
  const button = [...document.querySelectorAll("button")].find(
    item =>
      item.textContent?.trim() === name ||
      item.getAttribute("aria-label")?.startsWith(name) ||
      item.dataset.tab === name
  );
  if (!button) throw new Error(`找不到按钮：${name}`);
  await act(async () => button.click());
};

beforeEach(() => {
  useSettingsStore.setState({ llmTab: "providers" });
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  queryClient.clear();
  container.remove();
  useSettingStore.setState({ setting: structuredClone(originalSetting) });
});

it("手动添加只填写模型 ID，仍能保存、切换功能分配并再次编辑", async () => {
  loadModels([]);
  await render();
  await clickButton("手动添加");
  const input = document.querySelector<HTMLInputElement>('input[placeholder^="如 deepseek-chat"]');
  if (!input) throw new Error("找不到模型 ID 输入框");
  const setInputValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (!setInputValue) throw new Error("输入框不支持设置值");
  await act(async () => {
    setInputValue.call(input, "custom-model");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await clickButton("保存");
  expect(useSettingStore.getState().setting.llmProviders[0].models[0]).toEqual({
    id: "custom-model",
    reasoning: false,
    input: ["text"],
  });
  await clickButton("assignment");
  await clickButton("providers");
  await clickButton("编辑模型");
  await clickButton("保存");
  expect(useSettingStore.getState().setting.llmProviders[0].models).toEqual([
    { id: "custom-model", reasoning: false, input: ["text"] },
  ]);
});

it("加载缺少能力字段的模型后仍能进入设置、编辑并保存", async () => {
  loadModels([{ id: "incomplete-model" }]);
  await render();
  await clickButton("编辑模型");
  await clickButton("保存");
  expect(useSettingStore.getState().setting.llmProviders[0].models[0]).toEqual({
    id: "incomplete-model",
    reasoning: false,
    input: ["text"],
  });
});
