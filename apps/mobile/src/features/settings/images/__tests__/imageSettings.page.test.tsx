import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { definePlugin } from "@tau/plugins";
import { createMemoryStorage } from "@tau/plugins/host";
import { createPluginEnvironmentStore } from "@tau/plugins/environment-host";
import { PageHost, RouterProvider, getNavigator } from "../../../../router";
import { AppContext, type AppContextValue } from "../../../../app/AppContext";
import { MobilePluginsContext } from "../../../../app/plugins/context";
import { MobilePluginRuntime } from "../../../../app/plugins/runtime";
import { setMobileSettingSnapshot } from "../../../../services/mobileSettingsBridge";
import { mutateImageSettings } from "../../../../services/image-settings";
import type { ImageSettingsMutation, SettingCompat } from "../../../../types";
import "../../../cards/pages/home.page";
import "../../pages/settingsModule.page";
import "../../pages/imageAccount.page";
import "../../../plugins/pages/plugin-settings.page";

vi.mock("../../../../services/image-settings", async original => ({
  ...(await original<object>()),
  mutateImageSettings: vi.fn(),
}));
let runtime: MobilePluginRuntime;
let setting: SettingCompat;
let root: Root;
let host: HTMLDivElement;
let render: () => void;
const active = () => document.querySelector('[data-page-active="true"]')!;
const button = (label: string) =>
  [...active().querySelectorAll<HTMLElement>("button, [role=button]")].find(node =>
    node.textContent?.trim().startsWith(label)
  )!;
const waitFor = async (condition: () => boolean) => {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > 2500) throw new Error("等待页面状态超时");
    await act(async () => new Promise(resolve => setTimeout(resolve, 25)));
  }
};
const click = async (node: HTMLElement) =>
  act(async () => {
    node.click();
    await Promise.resolve();
  });
async function open(key: string, params: object) {
  await act(async () => {
    getNavigator().push(key as never, params as never);
  });
}
async function input(label: string, value: string) {
  const node = active().querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(node, value);
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(async () => {
  vi.clearAllMocks();
  window.history.replaceState(null, "");
  setting = {
    database: { active: "data.db", databases: [] },
    sync: { active: "plugin" },
    imageBed: { active: "local", enableCompression: false, local: { path: "resources" } },
    imageGeneration: { currentProviderId: "", providers: [] },
  };
  runtime = new MobilePluginRuntime(
    createPluginEnvironmentStore({
      platform: "android",
      input: { coarsePointer: true, finePointer: false },
    }),
    createMemoryStorage(),
    "data.db",
    { push: (key, params) => getNavigator().push(key, params) },
    "0.2.16"
  );
  runtime.host.registerTrusted(
    definePlugin({
      id: "test.images",
      name: "测试图片",
      version: "1.0.0",
      create: () => ({
        activate(context) {
          context.images.register({
            id: context.pluginId,
            name: "测试图片",
            create: () => ({ generate: async () => [] }),
          });
          context.settings.register({
            id: "connection",
            title: "测试图片",
            target: "images",
            models: [{ id: "image-model" }],
            form: {
              groups: [
                {
                  title: "连接",
                  fields: [
                    { key: "apiKey", label: "API Key", type: "secret" },
                    {
                      key: "baseUrl",
                      label: "模型地址",
                      type: "url",
                      default: "https://images.test/v1",
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
  await runtime.host.enable("test.images");
  vi.mocked(mutateImageSettings).mockImplementation(
    async (_database, mutation: ImageSettingsMutation) => {
      const images = structuredClone(setting.imageGeneration!);
      if (mutation.type === "save") {
        const index = images.providers.findIndex(item => item.id === mutation.provider.id);
        if (index < 0) images.providers.push(mutation.provider);
        else images.providers[index] = mutation.provider;
      } else if (mutation.type === "select") images.currentProviderId = mutation.id;
      else {
        images.providers = images.providers.filter(item => item.id !== mutation.id);
        if (images.currentProviderId === mutation.id) images.currentProviderId = "";
      }
      return { ...setting, imageGeneration: images };
    }
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const app = {
    syncSettings: {
      get safeSetting() {
        return setting;
      },
      updateSetting: (update: (previous: SettingCompat) => SettingCompat) => {
        setting = update(setting);
        setMobileSettingSnapshot(setting);
        render();
      },
    },
    bootstrap: { databases: null, versions: null },
    resourceSync: { progress: null, statusFile: null },
  } as unknown as AppContextValue;
  render = () =>
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
  setMobileSettingSnapshot(setting);
  render();
});
afterEach(async () => {
  act(() => root.unmount());
  host.remove();
  await runtime.dispose();
  setMobileSettingSnapshot(null);
});

it("设置经插件账号页保存名称、模型与连接配置，保存不自动选用", async () => {
  await open("settingsModule", { module: "image-generation" });
  expect(active().textContent).toContain("去插件中心下载");
  await click(button("测试图片"));
  await waitFor(() => !!button("添加图片账号"));
  await click(button("添加图片账号"));
  await waitFor(() => !!active().querySelector('input[aria-label="API Key"]'));
  await input("账号名称", "个人图片");
  await input("图片模型 ID", "custom-image");
  await input("API Key", "test-key");
  await click(button("保存配置"));
  await waitFor(() => setting.imageGeneration!.providers.length === 1);
  expect(mutateImageSettings).toHaveBeenCalledWith("data.db", {
    type: "save",
    provider: expect.objectContaining({
      name: "个人图片",
      modelId: "custom-image",
      pluginId: "test.images",
      config: { apiKey: "test-key", baseUrl: "https://images.test/v1" },
    }),
  });
  expect(setting.imageGeneration!.currentProviderId).toBe("");
  expect(active().textContent).toContain("配置已保存");
});

it("账号选择独立持久化，插件停用时保留选择并禁止再次调用", async () => {
  const account = {
    id: "a",
    name: "个人图片",
    pluginId: "test.images",
    modelId: "image-model",
    config: { apiKey: "test-key", baseUrl: "https://images.test/v1" },
  };
  setting.imageGeneration!.providers.push(account);
  setMobileSettingSnapshot(setting);
  render();
  await open("settingsModule", { module: "image-generation" });
  await click(button("个人图片"));
  expect(mutateImageSettings).toHaveBeenCalledWith("data.db", {
    type: "select",
    id: "a",
    expectedProvider: account,
  });
  expect(setting.imageGeneration!.currentProviderId).toBe("a");
  await act(async () => runtime.host.disable("test.images"));
  expect(active().textContent).toContain("插件已停用，配置已保留");
  expect((button("个人图片") as HTMLButtonElement).disabled).toBe(true);
  expect(setting.imageGeneration!.currentProviderId).toBe("a");
});
