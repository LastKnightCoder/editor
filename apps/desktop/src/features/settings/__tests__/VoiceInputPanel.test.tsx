import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PluginContext, PluginProviderSettingsDefinition } from "@tau/plugins";
import { UiProvider } from "@tau/ui";
import type { RegisteredPluginSettings } from "@/app/plugins/runtime";
import { rendererASRRegistry } from "@/app/plugins/asr-registry";
import useSettingStore from "@/stores/useSettingStore";
import { VoiceInputPanel } from "../sections/VoiceInputPanel";

const mocks = vi.hoisted(() => ({
  update: vi.fn(async (_operation: unknown) => undefined),
  probe: vi.fn(async () => ({ state: "ready" })),
  sections: [] as unknown[],
  open: vi.fn(),
}));
vi.mock("@/services/speechInput", () => ({ updateSpeechInput: mocks.update }));
vi.mock("@/services/open-provider-settings", () => ({ openProviderSettings: mocks.open }));
vi.mock("@/commands/module-init", () => ({ ensureModule: async () => undefined }));
vi.mock("@/electron", async importOriginal => ({
  ...(await importOriginal<typeof import("@/electron")>()),
  invoke: mocks.probe,
}));
vi.mock("@/app/plugins/context", () => ({
  useDesktopPlugins: () => ({ listSettings: () => mocks.sections }),
}));

const context = { pluginId: "seed.asr", signal: new AbortController().signal } as PluginContext;
const definition: PluginProviderSettingsDefinition = {
  id: "asr",
  title: "豆包语音",
  target: "asr",
  models: [{ id: "seed-asr-2.0" }],
  form: {
    groups: [
      {
        title: "账号",
        fields: [
          { key: "apiKey", label: "API Key", type: "secret" },
          {
            key: "resourceId",
            label: "计费资源",
            type: "choice",
            default: "duration",
            options: [
              { value: "duration", label: "按时长", description: "按识别音频时长计费" },
              { value: "concurrent", label: "按并发", description: "按购买的并发路数计费" },
            ],
          },
        ],
      },
    ],
  },
};

let container: HTMLDivElement;
let root: Root;
let registration: { dispose(): unknown } | undefined;
const text = () => container.textContent ?? "";
const button = (label: string) =>
  [...container.querySelectorAll("button")].find(item => item.textContent?.trim() === label)!;
const render = () =>
  act(async () =>
    root.render(
      <UiProvider>
        <VoiceInputPanel />
      </UiProvider>
    )
  );

beforeEach(() => {
  mocks.update.mockClear();
  mocks.open.mockClear();
  mocks.sections = [
    { key: "plugin:seed.asr:asr", definition, context, mountId: 1 } as RegisteredPluginSettings,
  ];
  useSettingStore.setState(state => ({
    setting: {
      ...state.setting,
      speechInput: {
        active: "native",
        language: "zh-CN",
        plugin: { id: "", configurations: {} },
      },
      llmUsageSettings: { ...state.setting.llmUsageSettings, speechInputRefinement: null },
    },
  }));
  registration = rendererASRRegistry.register(context, {
    id: "seed.asr",
    name: "豆包语音",
    create: () => {
      throw new Error("测试不创建识别实例");
    },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await registration?.dispose();
  act(() => root.unmount());
  document.body.innerHTML = "";
});

it("列出系统识别与识别插件，账号在插件页配置，设置页不渲染插件表单", async () => {
  await render();
  expect(text()).toContain("系统识别");
  expect(text()).toContain("豆包语音");
  expect(text()).toContain("待配置");
  expect(container.querySelector('input[aria-label="API Key"]')).toBeNull();
  await act(async () => button("去配置").click());
  expect(mocks.open).toHaveBeenCalledWith("seed.asr", "plugin:seed.asr:asr", "voice");
});

it("未保存账号时选用转去插件页；已保存时选用要带上当前配置", async () => {
  await render();
  await act(async () => button("豆包语音云端识别 · 录音会发送到该服务待配置").click());
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.open).toHaveBeenCalledWith("seed.asr", "plugin:seed.asr:asr", "voice");

  const account = { modelId: "seed-asr-2.0", config: { apiKey: "k1" } };
  useSettingStore.setState(state => ({
    setting: {
      ...state.setting,
      speechInput: {
        active: "native",
        language: "zh-CN",
        plugin: { id: "", configurations: { "seed.asr": account } },
      },
    },
  }));
  await render();
  expect(text()).toContain("seed-asr-2.0");
  await act(async () => button("豆包语音云端识别 · 录音会发送到该服务已配置").click());
  expect(mocks.update).toHaveBeenCalledWith({
    kind: "select",
    pluginId: "seed.asr",
    expected: account,
  });
});

it("选用的插件停用后保留选择并提示", async () => {
  mocks.sections = [];
  useSettingStore.setState(state => ({
    setting: {
      ...state.setting,
      speechInput: {
        active: "plugin",
        language: "zh-CN",
        plugin: { id: "seed.asr", configurations: { "seed.asr": { modelId: "m", config: {} } } },
      },
    },
  }));
  await render();
  expect(text()).toContain("已停用或卸载");
  expect(mocks.update).not.toHaveBeenCalled();
});
