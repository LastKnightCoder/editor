// AI 模型设置：经真实 router 入栈，覆盖功能分配、预设草稿保存、Key 留空不修改、删除服务商与语音整理分组。

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { PageHost, RouterProvider, getNavigator } from "../../../../router";
import { AppContext, type AppContextValue } from "../../../../app/AppContext";
import type {
  AiSettingsMutation,
  AiSettingsSnapshot,
  MobileLlmProvider,
  SettingCompat,
} from "../../../../types";
import "../../../cards/pages/home.page";
import "../../pages/settingsModule.page";
import "../../pages/aiProvider.page";

const tauriMock = vi.hoisted(() => ({ mutateAiSettings: vi.fn() }));
vi.mock("../../../../services/tauri", async importOriginal => ({
  ...(await importOriginal<object>()),
  mutateAiSettings: tauriMock.mutateAiSettings,
}));
const toastSpies = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("../../../../components/toast", () => ({ toast: toastSpies }));

let setting: SettingCompat;
let host: HTMLDivElement;
let root: Root;

const deepseek: MobileLlmProvider = {
  id: "deepseek",
  name: "DeepSeek",
  baseUrl: "https://api.deepseek.com",
  api: "openai-completions",
  builtin: "deepseek",
  configured: true,
  keyHint: "a91f",
  models: [{ id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", reasoning: true, input: ["text"] }],
};

function makeSetting(providers: MobileLlmProvider[], usage = {}): SettingCompat {
  return {
    database: { active: "data.db", databases: [{ name: "data.db", version: 1 }] },
    sync: { active: "plugin" },
    imageBed: { active: "local", enableCompression: true, local: { path: "" } },
    speechInput: { active: "native", language: "zh-CN", plugin: { id: "", configurations: {} } },
    llmProviders: providers,
    llmUsageSettings: usage,
  } as unknown as SettingCompat;
}

/** 模拟原生：按 mutation 改写快照，从不回传 Key */
function fakeNative(mutation: AiSettingsMutation): AiSettingsSnapshot {
  let providers = [...(setting.llmProviders ?? [])];
  let usage = { ...setting.llmUsageSettings };
  let speechInput = setting.speechInput;
  if (mutation.kind === "upsertProvider") {
    const previous = providers.find(item => item.id === mutation.provider.id);
    const next = {
      ...mutation.provider,
      configured: mutation.apiKey !== undefined ? !!mutation.apiKey : !!previous?.configured,
      keyHint: mutation.apiKey ? mutation.apiKey.slice(-4) : (previous?.keyHint ?? ""),
    };
    providers = previous
      ? providers.map(item => (item.id === next.id ? next : item))
      : [...providers, next];
  } else if (mutation.kind === "removeProvider") {
    providers = providers.filter(item => item.id !== mutation.providerId);
    for (const [key, value] of Object.entries(usage))
      if (value?.providerId === mutation.providerId) usage[key] = null;
  } else if (mutation.kind === "assign") {
    usage = { ...usage, [mutation.feature]: mutation.model };
  } else {
    speechInput = {
      ...speechInput!,
      refinement: { style: mutation.style, instructions: "" },
    };
  }
  return { llmProviders: providers, llmUsageSettings: usage, speechInput };
}

function mount() {
  tauriMock.mutateAiSettings.mockImplementation(async (mutation: AiSettingsMutation) =>
    fakeNative(mutation)
  );
  const app = {
    syncSettings: {
      get safeSetting() {
        return setting;
      },
      isSavingSetting: false,
      isSyncing: false,
      updateSetting: vi.fn((updater: (prev: SettingCompat) => SettingCompat) => {
        setting = updater(setting);
        render();
      }),
    },
    bootstrap: {
      databases: { activeDatabase: "data.db", databases: [{ name: "data.db", version: 1 }] },
      versions: null,
    },
    resourceSync: { progress: { status: "idle" }, statusFile: null, isResourceSyncing: false },
  } as unknown as AppContextValue;
  const render = () =>
    act(() =>
      root.render(
        <RouterProvider rootKey="home">
          <AppContext.Provider value={app}>
            <PageHost rootContent={<div />} />
          </AppContext.Provider>
        </RouterProvider>
      )
    );
  render();
}

const activePage = () => document.querySelector('[data-page-active="true"]')!;
const text = () => activePage()?.textContent ?? "";
const pressable = (scope: ParentNode, label: string) =>
  [...scope.querySelectorAll<HTMLElement>("button, [role='button']")].find(node =>
    node.textContent?.trim().startsWith(label)
  );
async function click(element: HTMLElement | undefined) {
  if (!element) throw new Error("找不到可点击元素");
  await act(async () => {
    element.click();
    await Promise.resolve();
  });
}
async function waitFor(condition: () => boolean) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > 2000) throw new Error("waitFor 超时");
    await act(async () => new Promise(resolve => setTimeout(resolve, 25)));
  }
}
async function open(page: string, params: object) {
  await act(async () => {
    getNavigator().push(page as never, params as never);
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}
function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const input = (label: string) =>
  activePage().querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;

// 详情页与添加面板为懒加载（含内置模型目录），先加载，避免冷启动转译计入各用例的等待
beforeAll(async () => {
  await import("../AiProviderPage");
  await import("../AddProviderSheet");
}, 60_000);

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("功能分配：选择器按服务商分组，选中后写入分配并显示模型名", async () => {
  setting = makeSetting([deepseek]);
  mount();
  await open("settingsModule", { module: "ai-models" });
  await waitFor(() => text().includes("功能分配"));
  expect(text()).toContain("未分配");
  expect(text()).toContain("可用");
  expect(text()).toContain("…a91f");

  await click(pressable(activePage(), "对话"));
  await waitFor(() => document.body.textContent!.includes("对话使用的模型"));
  await click(pressable(document.body, "DeepSeek V4 Pro"));
  await waitFor(() => text().includes("DeepSeek V4 Pro"));
  expect(tauriMock.mutateAiSettings).toHaveBeenCalledWith({
    kind: "assign",
    feature: "chat",
    model: { providerId: "deepseek", modelId: "deepseek-v4-pro" },
  });
});

it("预设草稿：未保存前不写设置，保存时带上 Key，返回后列表出现新服务商", async () => {
  setting = makeSetting([]);
  mount();
  await open("aiProvider", { providerId: "deepseek", preset: "deepseek" });
  await waitFor(() => !!input("API Key"));
  expect(tauriMock.mutateAiSettings).not.toHaveBeenCalled();
  expect(input("接口地址").value).toBe("https://api.deepseek.com");

  type(input("API Key"), "sk-test-0000wxyz");
  await click(pressable(activePage(), "保存"));
  await waitFor(() => tauriMock.mutateAiSettings.mock.calls.length === 1);
  const [mutation] = tauriMock.mutateAiSettings.mock.calls[0];
  expect(mutation).toMatchObject({
    kind: "upsertProvider",
    apiKey: "sk-test-0000wxyz",
    provider: { id: "deepseek", builtin: "deepseek", api: "openai-completions" },
  });
  expect(mutation.provider.models.length).toBeGreaterThan(0);
  expect(mutation.provider).not.toHaveProperty("configured");
  expect(mutation.provider).not.toHaveProperty("keyHint");
  expect(setting.llmProviders?.[0]?.configured).toBe(true);
});

it("已保存服务商：Key 留空不修改，删除前确认并清空分配", async () => {
  setting = makeSetting([deepseek], {
    chat: { providerId: "deepseek", modelId: "deepseek-v4-pro" },
  });
  mount();
  await open("aiProvider", { providerId: "deepseek" });
  await waitFor(() => !!input("API Key"));
  expect(input("API Key").placeholder).toContain("…a91f");

  type(input("接口地址"), "https://api.deepseek.com/v1");
  await click(pressable(activePage(), "保存"));
  await waitFor(() => tauriMock.mutateAiSettings.mock.calls.length === 1);
  expect(tauriMock.mutateAiSettings.mock.calls[0][0]).not.toHaveProperty("apiKey");

  await click(pressable(activePage(), "删除服务商"));
  await waitFor(() => document.body.textContent!.includes("删除「DeepSeek」？"));
  await click(
    [...document.body.querySelectorAll<HTMLElement>("button")].find(
      node => node.textContent?.trim() === "删除"
    )
  );
  await waitFor(() => !setting.llmProviders?.length);
  expect(setting.llmUsageSettings?.chat).toBeNull();
});

it("自定义服务商：地址无效与没有模型时拦下保存", async () => {
  setting = makeSetting([]);
  mount();
  await open("aiProvider", { providerId: "custom", preset: "custom" });
  await waitFor(() => !!input("名称"));
  type(input("名称"), "公司网关");
  type(input("接口地址"), "ftp://gateway");
  await click(pressable(activePage(), "保存"));
  await waitFor(() => text().includes("请填写 http(s) 开头的地址"));
  expect(text()).toContain("至少保留一个模型");
  expect(tauriMock.mutateAiSettings).not.toHaveBeenCalled();
});

it("语音输入页：分配整理模型后出现整理方式，选择后写入风格", async () => {
  setting = makeSetting([deepseek], {
    speechInputRefinement: { providerId: "deepseek", modelId: "deepseek-v4-pro" },
  });
  mount();
  await open("settingsModule", { module: "speech-input" });
  await waitFor(() => text().includes("AI 整理"));
  expect(text()).toContain("DeepSeek V4 Pro");
  await click(pressable(activePage(), "整理方式"));
  await waitFor(() => document.body.textContent!.includes("整理并分段"));
  await click(pressable(document.body, "整理并分段"));
  await waitFor(() => setting.speechInput?.refinement?.style === "paragraphs");
  expect(tauriMock.mutateAiSettings).toHaveBeenCalledWith({
    kind: "setSpeechRefinement",
    style: "paragraphs",
  });
});
