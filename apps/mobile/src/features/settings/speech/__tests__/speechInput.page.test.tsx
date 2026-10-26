// 语音输入设置：经真实 router 入栈，覆盖服务列表、未配置时进账号页、账号保存带上模型、点选切换与停用提示。

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { definePlugin } from "@tau/plugins";
import { createMemoryStorage } from "@tau/plugins/host";
import { createPluginEnvironmentStore } from "@tau/plugins/environment-host";
import { PageHost, RouterProvider, getNavigator } from "../../../../router";
import { AppContext, type AppContextValue } from "../../../../app/AppContext";
import { MobilePluginRuntime } from "../../../../app/plugins/runtime";
import { MobilePluginsContext } from "../../../../app/plugins/context";
import type { SettingCompat } from "../../../../types";
import "../../../cards/pages/home.page";
import "../../pages/settingsModule.page";
import "../../pages/speechInputProvider.page";

const tauriMock = vi.hoisted(() => ({
  selectPluginProvider: vi.fn(),
  savePluginProviderConfig: vi.fn(),
}));
vi.mock("../../../../services/tauri", async importOriginal => ({
  ...(await importOriginal<object>()),
  selectPluginProvider: tauriMock.selectPluginProvider,
  savePluginProviderConfig: tauriMock.savePluginProviderConfig,
}));
const toastSpies = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("../../../../components/toast", () => ({ toast: toastSpies }));

let runtime: MobilePluginRuntime;
let setting: SettingCompat;
let host: HTMLDivElement;
let root: Root;

async function createRuntime() {
  const created = new MobilePluginRuntime(
    createPluginEnvironmentStore({
      platform: "android",
      input: { coarsePointer: true, finePointer: false },
    }),
    createMemoryStorage(),
    "data.db",
    { push: () => undefined },
    "0.2.9"
  );
  created.host.registerTrusted(
    definePlugin({
      id: "tau.asr-seed",
      name: "豆包语音",
      version: "1.0.0",
      create: () => ({
        activate(context) {
          context.asr.register({
            id: context.pluginId,
            name: "豆包语音",
            create: () => {
              throw new Error("测试不创建识别实例");
            },
          });
          context.settings.register({
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
                        { value: "duration", label: "按时长", description: "按识别时长计费" },
                        { value: "concurrent", label: "按并发", description: "按并发路数计费" },
                      ],
                    },
                  ],
                },
              ],
            },
          });
        },
      }),
    })
  );
  await created.host.enable("tau.asr-seed");
  return created;
}

function makeSetting(speechInput: SettingCompat["speechInput"]): SettingCompat {
  return {
    database: { active: "data.db", databases: [] },
    imageBed: { active: "local", plugin: { id: "", configurations: {} } },
    sync: { active: "plugin", plugin: { id: "", configurations: {} } },
    speechInput,
  } as unknown as SettingCompat;
}

function mount() {
  tauriMock.savePluginProviderConfig.mockImplementation(async (_db, _target, id, value) => ({
    ...setting,
    speechInput: {
      ...setting.speechInput!,
      plugin: {
        ...setting.speechInput!.plugin,
        configurations: { ...setting.speechInput!.plugin.configurations, [id]: value },
      },
    },
  }));
  tauriMock.selectPluginProvider.mockImplementation(async (_db, _target, id) => ({
    ...setting,
    speechInput: {
      ...setting.speechInput!,
      active: id === "native" ? "native" : "plugin",
      plugin: { ...setting.speechInput!.plugin, id: id === "native" ? "" : id },
    },
  }));
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
      persistSetting: vi.fn(async () => ({ ok: true })),
    },
    bootstrap: {
      databases: { activeDatabase: "data.db", databases: [{ name: "data.db", version: 42 }] },
      versions: null,
    },
    resourceSync: { progress: { status: "idle" }, statusFile: null, isResourceSyncing: false },
  } as unknown as AppContextValue;
  const render = () =>
    act(() =>
      root.render(
        <RouterProvider rootKey="home">
          <MobilePluginsContext.Provider value={runtime}>
            <AppContext.Provider value={app}>
              <PageHost rootContent={<div />} />
            </AppContext.Provider>
          </MobilePluginsContext.Provider>
        </RouterProvider>
      )
    );
  render();
}

const activePage = () => document.querySelector('[data-page-active="true"]')!;
const text = () => activePage()?.textContent ?? "";
const button = (label: string) =>
  [...activePage().querySelectorAll<HTMLElement>("button, [role='button']")].find(node =>
    node.textContent?.trim().startsWith(label)
  )!;
async function click(element: HTMLElement) {
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

beforeEach(async () => {
  vi.clearAllMocks();
  window.history.replaceState(null, "");
  runtime = await createRuntime();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  act(() => root.unmount());
  host.remove();
  await runtime.dispose();
});

it("未配置的识别插件进入账号页，保存时带上插件声明的模型", async () => {
  setting = makeSetting({
    active: "native",
    language: "zh-CN",
    plugin: { id: "", configurations: {} },
  });
  mount();
  await open("settingsModule", { module: "speech-input" });
  await waitFor(() => text().includes("豆包语音"));
  expect(text()).toContain("系统识别");
  expect(text()).toContain("尚未配置账号");

  await click(button("豆包语音"));
  await waitFor(() => !!activePage().querySelector('input[aria-label="API Key"]'));
  expect(text()).toContain("按识别时长计费");
  const input = activePage().querySelector<HTMLInputElement>('input[aria-label="API Key"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "k1");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await click(button("保存"));
  await waitFor(() => tauriMock.savePluginProviderConfig.mock.calls.length === 1);
  expect(tauriMock.savePluginProviderConfig).toHaveBeenCalledWith(
    "data.db",
    "asr",
    "tau.asr-seed",
    {
      modelId: "seed-asr-2.0",
      config: { apiKey: "k1", resourceId: "duration" },
    }
  );
  expect(tauriMock.selectPluginProvider).not.toHaveBeenCalled();
});

it("已配置的插件点选即切换；选用的插件停用后保留选择并提示", async () => {
  const account = { modelId: "seed-asr-2.0", config: { apiKey: "k1", resourceId: "duration" } };
  setting = makeSetting({
    active: "native",
    language: "zh-CN",
    plugin: { id: "", configurations: { "tau.asr-seed": account } },
  });
  mount();
  await open("settingsModule", { module: "speech-input" });
  await waitFor(() => text().includes("云端识别"));
  await click(button("豆包语音"));
  await waitFor(() => tauriMock.selectPluginProvider.mock.calls.length === 1);
  expect(tauriMock.selectPluginProvider).toHaveBeenCalledWith(
    "data.db",
    "asr",
    "tau.asr-seed",
    account
  );

  await act(async () => runtime.host.disable("tau.asr-seed"));
  await waitFor(() => text().includes("识别插件已停用"));
  expect(setting.speechInput?.plugin.id).toBe("tau.asr-seed");
});
