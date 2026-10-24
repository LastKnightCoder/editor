/* eslint-disable react-refresh/only-export-components -- TTS 页面测试共享夹具。 */
import { useCallback, useState, type ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { definePlugin, type PluginSettingsProps } from "@tau/plugins";
import { createMemoryStorage } from "@tau/plugins/host";
import { createPluginEnvironmentStore } from "@tau/plugins/environment-host";
import { AppContext, type AppContextValue } from "../../../../app/AppContext";
import { MobilePluginsContext } from "../../../../app/plugins/context";
import { MobilePluginRuntime } from "../../../../app/plugins/runtime";
import { setMobileSettingSnapshot } from "../../../../services/mobileSettingsBridge";
import type { SettingCompat, TTSProviderSetting, TTSUsageConfig } from "../../../../types";
import {
  definePage,
  getNavigator,
  getPageDefinition,
  getQueryClient,
  PageHost,
  PageQueryProvider,
  paramOptional,
  paramString,
  RouterProvider,
} from "../../../../router";
import "../../../cards/pages/home.page";
import "../../pages/settingsModule.page";
import "../pages/ttsAccount.page";
import "../pages/ttsClone.page";
import "../pages/ttsModels.page";
import "../pages/ttsTest.page";

if (!getPageDefinition("plugins")) {
  definePage({
    key: "plugins",
    match: "params",
    getId: params => params.tab ?? "store",
    params: { tab: paramOptional(paramString()) },
    component: () => <h1>插件中心</h1>,
  });
}

export type SettingState = {
  current: SettingCompat;
  loadSetting?: (next: SettingCompat) => void;
};

export function makeSetting(
  accounts: TTSProviderSetting[] = [],
  usage: TTSUsageConfig | null = null
): SettingCompat {
  return {
    database: { active: "data.db", databases: [] },
    sync: { active: "plugin", plugin: { id: "", configurations: {} } },
    imageBed: {
      active: "local",
      enableCompression: true,
      local: { path: "resources" },
      plugin: { id: "", configurations: {} },
    },
    ttsProviders: accounts,
    ttsUsageSettings: { default: usage },
  } as SettingCompat;
}

export function makeAccount(overrides: Partial<TTSProviderSetting> = {}): TTSProviderSetting {
  return {
    id: "account-a",
    name: "测试账号",
    pluginId: "fixture.tts",
    config: { apiKey: "super-secret-key" },
    models: [{ id: "model-a" }],
    ...overrides,
  };
}

function DefaultSettings({ ttsConfig }: PluginSettingsProps) {
  return <div data-testid="tts-author-form">作者设置 · {ttsConfig?.instanceId}</div>;
}

export async function createTtsRuntime(
  component: React.ComponentType<PluginSettingsProps> = DefaultSettings
) {
  const runtime = new MobilePluginRuntime(
    createPluginEnvironmentStore({
      platform: "android",
      input: { coarsePointer: true, finePointer: false },
    }),
    createMemoryStorage(),
    "data.db",
    { push: () => undefined },
    "0.2.6"
  );
  runtime.host.registerTrusted(
    definePlugin({
      id: "fixture.tts",
      name: "Fixture Voice",
      version: "1.0.0",
      create: () => ({
        activate(context) {
          context.settings.register({
            id: "voice",
            title: "Fixture Voice",
            target: "tts",
            component,
          });
        },
      }),
    })
  );
  await runtime.host.enable("fixture.tts");
  return runtime;
}

function Harness({
  state,
  runtime,
  rootContent,
}: {
  state: SettingState;
  runtime: MobilePluginRuntime;
  rootContent: ReactNode;
}) {
  const [setting, setSetting] = useState(state.current);
  const updateSetting = useCallback(
    (updater: (previous: SettingCompat) => SettingCompat) => {
      state.current = updater(state.current);
      setMobileSettingSnapshot(state.current);
      setSetting(state.current);
    },
    [state]
  );
  state.loadSetting = (next: SettingCompat) => {
    state.current = next;
    setMobileSettingSnapshot(next);
    setSetting(next);
  };
  const app = {
    syncSettings: {
      setting,
      safeSetting: setting,
      isSavingSetting: false,
      isSyncing: false,
      updateSetting,
      persistSetting: async () => ({ ok: true }),
    },
    bootstrap: { databases: null, versions: null },
    resourceSync: { progress: null, statusFile: null, isResourceSyncing: false },
    handleSwitchDatabase: async () => undefined,
    handleSaveSetting: async () => undefined,
    handleCheckVersions: async () => ({}),
    handleSyncUpload: async () => ({}),
    handleSyncDownload: async () => ({}),
    handleResourceSyncRefresh: async () => undefined,
    handleResourceSyncStart: async () => ({}),
    handleResourceSyncRetryFailed: async () => ({}),
    handleResourceSyncCancel: async () => ({}),
  } as unknown as AppContextValue;
  return (
    <RouterProvider rootKey="home">
      <PageQueryProvider>
        <MobilePluginsContext.Provider value={runtime}>
          <AppContext.Provider value={app}>
            <PageHost rootContent={rootContent} />
          </AppContext.Provider>
        </MobilePluginsContext.Provider>
      </PageQueryProvider>
    </RouterProvider>
  );
}

export function mountTtsHarness(
  state: SettingState,
  runtime: MobilePluginRuntime,
  rootContent: ReactNode = <div data-testid="root" />
) {
  getQueryClient().clear();
  setMobileSettingSnapshot(state.current);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<Harness state={state} runtime={runtime} rootContent={rootContent} />);
  });
  return {
    host,
    root,
    unmount: () => {
      act(() => root.unmount());
      host.remove();
      getQueryClient().clear();
      setMobileSettingSnapshot(null);
      document.body.innerHTML = "";
    },
  };
}

export const activePage = () => document.querySelector('[data-page-active="true"]');
export const activeTitle = () => activePage()?.querySelector("h1")?.textContent ?? "";

export function findButton(text: string, scope: ParentNode | null = document): HTMLElement | null {
  const nodes = [...(scope?.querySelectorAll("button, [role='button']") ?? [])] as HTMLElement[];
  return nodes.find(node => node.textContent?.includes(text)) ?? null;
}

export async function click(element: HTMLElement | null | undefined): Promise<void> {
  if (!element) throw new Error("找不到要点击的控件");
  await act(async () => {
    element.click();
    await Promise.resolve();
    await Promise.resolve();
  });
}

export async function waitFor(condition: () => boolean, timeoutMs = 2500): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor 超时");
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 25));
    });
  }
}

export async function openPage(key: string, params: Record<string, unknown>): Promise<void> {
  await act(async () => {
    getNavigator().push(key, params);
    await Promise.resolve();
  });
}

export async function setInputValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string
): Promise<void> {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  await act(async () => {
    setter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    await Promise.resolve();
  });
}

export async function chooseFile(input: HTMLInputElement, file: File): Promise<void> {
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await Promise.resolve();
  });
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
