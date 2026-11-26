import { desktopLocaleSource } from "@/app/i18n/runtime";
import { llmText } from "../sections/llm.i18n";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import useSettingStore, { mergeSettingWithDefaults } from "@/stores/useSettingStore";
import { useSettingsStore } from "@/app/settingsStore";
import { LLMSection } from "../sections/LLMSection";

const remote = vi.hoisted(() => ({ discover: vi.fn() }));
vi.mock("@/commands/piAi", () => ({
  piDiscoverModels: remote.discover,
  piCatalogProviders: async () => ({ ok: true, providers: [] }),
  piCatalogModels: async () => ({ ok: true, models: [] }),
  piThinkingLevels: async () => ({ ok: true, levels: [], fromCatalog: false }),
}));

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;
const originalLocale = desktopLocaleSource.getSnapshot();
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
  remote.discover.mockReset();
  useSettingsStore.setState({ llmTab: "providers" });
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  act(() => desktopLocaleSource.setLocale(originalLocale));
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
  const before = useSettingStore.getState().setting.llmProviders;
  input.focus();
  input.setSelectionRange(1, 3);
  for (const locale of ["zh-TW", "en-US"]) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(
      document.querySelector(
        `input[placeholder="${llmText("ui.forExampleDeepseekChatTheProviderS")}"]`
      )
    ).toBe(input);
    expect(input.value).toBe("custom-model");
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([1, 3]);
    expect(useSettingStore.getState().setting.llmProviders).toBe(before);
    expect(remote.discover).not.toHaveBeenCalled();
  }
  await act(async () => desktopLocaleSource.setLocale(originalLocale));
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

it("模型发现在途与勾选草稿跨语言保留，不重复请求或提前写入", async () => {
  loadModels([{ id: "existing", name: "原始模型", reasoning: false, input: ["text"] }]);
  let finish:
    | ((result: { ok: true; models: Array<{ id: string; name: string }> }) => void)
    | undefined;
  remote.discover.mockImplementation(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  await render();
  const before = useSettingStore.getState().setting.llmProviders;
  await clickButton(llmText("ui.chooseModels"));
  expect(remote.discover).toHaveBeenCalledExactlyOnceWith(before[0]);
  const search = document.querySelector<HTMLInputElement>(
    `input[placeholder="${llmText("ui.searchModels")}"]`
  );
  if (!search || !finish) throw new Error("模型发现未挂载");
  await act(async () => desktopLocaleSource.setLocale("en-US"));
  expect(remote.discover).toHaveBeenCalledTimes(1);
  await act(async () => finish?.({ ok: true, models: [{ id: "raw-new", name: "原始模型名" }] }));
  const checkbox = document.querySelector<HTMLInputElement>("#model-pick-raw-new");
  if (!checkbox) throw new Error("发现的模型未显示");
  await act(async () => checkbox.click());
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(search, "raw");
  await act(async () => search.dispatchEvent(new Event("input", { bubbles: true })));
  search.focus();
  for (const locale of ["zh-TW", "zh-CN"]) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(document.querySelector("#model-pick-raw-new")).toBe(checkbox);
    expect(checkbox.checked).toBe(true);
    expect(document.activeElement).toBe(search);
    expect(search.value).toBe("raw");
    expect(remote.discover).toHaveBeenCalledTimes(1);
    expect(useSettingStore.getState().setting.llmProviders).toBe(before);
  }
});
