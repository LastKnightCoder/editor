import { definePlugin } from "@tau/plugins";
import { mobileLocaleSource } from "../../../../services/i18n";
import { storageTranslator } from "../../storage/i18n";
import { createStorageRuntime } from "../../__tests__/storageProviders";
import { MobilePluginsContext } from "../../../../app/plugins/context";
let storageRuntime: Awaited<ReturnType<typeof createStorageRuntime>>;
// 「图片与附件」集成测试：经真实 router 入栈，覆盖目的地卡的状态与修复入口、压缩开关、
// 位置列表页切换到本机，以及上传服务页的测试上传（能传 / 打不开 / 传不上去）与设为当前。

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageHost, RouterProvider, getNavigator } from "../../../../router";
import { AppContext, type AppContextValue } from "../../../../app/AppContext";
import type { SettingCompat } from "../../../../types";
import {
  recordUploadFailure,
  recordUploadSuccess,
  resetUploadOutcomeForTest,
} from "../../../../services/uploadOutcome";
import "../../../cards/pages/home.page";
import "../../pages/settingsModule.page";
import "../../pages/uploadProvider.page";
import "../../pages/uploadTargets.page";

const tauriMock = vi.hoisted(() => ({
  resourceUploadTest: vi.fn(),
  savePluginProviderConfig: vi.fn(),
  selectPluginProvider: vi.fn(),
}));
vi.mock("../../../../services/tauri", async importOriginal => ({
  ...(await importOriginal<object>()),
  resourceUploadTest: tauriMock.resourceUploadTest,
  savePluginProviderConfig: tauriMock.savePluginProviderConfig,
  selectPluginProvider: tauriMock.selectPluginProvider,
}));

const toastSpies = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("../../../../components/toast", () => ({ toast: toastSpies }));

function makeSetting(active: string, githubReady = true): SettingCompat {
  return {
    database: { active: "data.db", databases: [] },
    sync: { active: "plugin", plugin: { id: "", configurations: {} } },
    imageBed: {
      active: active === "local" ? "local" : "plugin",
      enableCompression: true,
      local: { path: "resources" },
      plugin: {
        id: active === "local" ? "" : `tau.upload-${active}`,
        configurations: githubReady
          ? {
              "tau.upload-github": {
                token: "fixture",
                owner: "d7hacx",
                repo: "tau-assets",
                branch: "main",
                pathPrefix: "uploads",
              },
            }
          : {},
      },
    },
  } as unknown as SettingCompat;
}

type Harness = { app: AppContextValue; setting: () => SettingCompat; persisted: () => number };

function createApp(initial: SettingCompat): Harness {
  let setting = initial;
  let persisted = 0;
  tauriMock.selectPluginProvider.mockImplementation(async (_database, target, id) => {
    const section = target === "sync" ? "sync" : "imageBed";
    return {
      ...setting,
      [section]: {
        ...setting[section],
        active: id === "local" ? "local" : "plugin",
        plugin: {
          ...setting[section].plugin,
          id: id === "local" ? (setting[section].plugin?.id ?? "") : id,
        },
      },
    };
  });
  const app = {
    syncSettings: {
      safeSetting: setting,
      isSavingSetting: false,
      isSyncing: false,
      updateSetting: vi.fn(
        (updater: (prev: SettingCompat) => SettingCompat, options?: { persist?: boolean }) => {
          setting = updater(setting);
          if (options?.persist) persisted += 1;
        }
      ),
      persistSetting: vi.fn(async () => ({ ok: true })),
    },
    bootstrap: { databases: null, versions: null },
    resourceSync: { progress: null, statusFile: null, isResourceSyncing: false },
  } as unknown as AppContextValue;
  return { app, setting: () => setting, persisted: () => persisted };
}

let host: HTMLDivElement | null = null;
let root: Root | null = null;

function mount(app: AppContextValue): void {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <RouterProvider rootKey="home">
        <MobilePluginsContext.Provider value={storageRuntime}>
          <AppContext.Provider value={app}>
            <PageHost rootContent={<div data-testid="root" />} />
          </AppContext.Provider>
        </MobilePluginsContext.Provider>
      </RouterProvider>
    );
  });
}

const activePage = () => document.querySelector('[data-page-active="true"]');
const activeTitle = () => activePage()?.querySelector("h1")?.textContent ?? "";

function findButton(text: string, scope: ParentNode | null = document): HTMLElement | null {
  const nodes = [...(scope?.querySelectorAll("button, [role='button']") ?? [])] as HTMLElement[];
  return nodes.find(node => node.textContent?.includes(text)) ?? null;
}

async function click(element: HTMLElement | null): Promise<void> {
  expect(element).toBeTruthy();
  await act(async () => {
    element!.click();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor 超时");
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 25));
    });
  }
}

async function openCenter(): Promise<void> {
  act(() => {
    getNavigator().push("settingsModule", { module: "resource" });
  });
  await waitFor(() => activeTitle() === "图片与附件");
}

async function openProvider(providerId: string, title: string): Promise<void> {
  act(() => {
    getNavigator().push("uploadProvider", { providerId: `tau.upload-${providerId}` });
  });
  await waitFor(() => activeTitle() === title);
}

describe("图片与附件", () => {
  beforeEach(async () => {
    storageRuntime = await createStorageRuntime();
    vi.clearAllMocks();
    window.localStorage.clear();
    resetUploadOutcomeForTest();
    window.history.replaceState(null, "");
  });

  afterEach(async () => {
    await storageRuntime.dispose();
    act(() => root?.unmount());
    host?.remove();
    document.body.innerHTML = "";
  });

  it("保存在本机时说明随资源文件同步，压缩开关立即保存", async () => {
    const harness = createApp(makeSetting("local"));
    mount(harness.app);
    await openCenter();
    expect(activePage()?.textContent).toContain("这台手机");
    expect(activePage()?.textContent).toContain("随资源文件同步");

    await click(activePage()!.querySelector<HTMLElement>('[role="switch"]'));
    expect(harness.setting().imageBed.enableCompression).toBe(false);
    expect(harness.persisted()).toBe(1);
  });

  it("当前服务配置不完整时给出「完成配置」，点击进入服务页", async () => {
    const harness = createApp(makeSetting("github", false));
    mount(harness.app);
    await openCenter();
    expect(activePage()?.textContent).toContain("配置不完整，插入图片会失败");

    await click(findButton("完成配置", activePage()));
    await waitFor(() => activeTitle() === "GitHub 仓库");
  });

  it("最近一次上传失败时把原因留在卡上，账号问题给出「检查账号」", async () => {
    recordUploadFailure(
      "tau.upload-github",
      new Error("RESOURCE_UPLOAD_FAILED:Github 上传返回异常状态 HTTP 401: Bad credentials")
    );
    const harness = createApp(makeSetting("github"));
    mount(harness.app);
    await openCenter();
    expect(activePage()?.textContent).toContain("最近一次没传上去：账号已失效或没有写入权限");
    expect(findButton("检查账号", activePage())).toBeTruthy();
  });

  it("换了上传位置后不再显示旧位置的结果", async () => {
    recordUploadFailure("tau.upload-s3", new Error("RESOURCE_UPLOAD_FAILED:HTTP 403"));
    recordUploadSuccess("tau.upload-github");
    const harness = createApp(makeSetting("github"));
    mount(harness.app);
    await openCenter();
    expect(activePage()?.textContent).toContain("正常");
    expect(activePage()?.textContent).not.toContain("没传上去");
  });

  it("位置列表里选「这台手机」直接切换并提示影响范围", async () => {
    const harness = createApp(makeSetting("github"));
    mount(harness.app);
    await openCenter();
    await click(findButton("更换位置", activePage()));
    await waitFor(() => activeTitle() === "保存到哪里");
    await click(findButton("这台手机", activePage()));
    expect(harness.setting().imageBed.active).toBe("local");
    expect(toastSpies.success).toHaveBeenCalledWith("之后的新图片会保存在这台手机");
  });

  it("服务页测试通过后可设为当前上传位置", async () => {
    const harness = createApp(makeSetting("local"));
    tauriMock.resourceUploadTest.mockResolvedValue({
      url: "https://raw.githubusercontent.com/d7hacx/tau-assets/main/uploads/tau-upload-test.png",
      readable: true,
      elapsedMs: 1800,
    });
    mount(harness.app);
    await openProvider("github", "GitHub 仓库");

    await click(findButton("上传测试图片", activePage()));
    await waitFor(() => activePage()?.textContent?.includes("上传成功，图片可以打开") ?? false);
    expect(harness.app.syncSettings.persistSetting).toHaveBeenCalled();
    expect(tauriMock.resourceUploadTest).toHaveBeenCalledWith("tau.upload-github");
    expect(harness.setting().imageBed.active).toBe("local");

    await click(findButton("设为当前", activePage()));
    expect(harness.setting().imageBed.plugin?.id).toBe("tau.upload-github");
    expect(toastSpies.success).toHaveBeenCalledWith("之后的新图片会保存到 GitHub 仓库");
  });

  it("传上去但地址打不开时说明原因，并禁止设为上传位置", async () => {
    const harness = createApp(makeSetting("local"));
    tauriMock.resourceUploadTest.mockResolvedValue({
      url: "https://example.com/tau-upload-test.png",
      readable: false,
      elapsedMs: 900,
    });
    mount(harness.app);
    await openProvider("github", "GitHub 仓库");
    await click(findButton("上传测试图片", activePage()));
    await waitFor(() => activePage()?.textContent?.includes("传上去了，但打不开") ?? false);
    expect(findButton("设为当前", activePage())?.hasAttribute("disabled")).toBe(true);
  });

  it("传不上去时翻译错误原因", async () => {
    const harness = createApp(makeSetting("local"));
    tauriMock.resourceUploadTest.mockRejectedValue(
      new Error("RESOURCE_UPLOAD_FAILED:Github 上传返回异常状态 HTTP 404: Not Found")
    );
    mount(harness.app);
    await openProvider("github", "GitHub 仓库");
    await click(findButton("上传测试图片", activePage()));
    await waitFor(() => activePage()?.textContent?.includes("传不上去") ?? false);
    expect(activePage()?.textContent).toContain("找不到仓库或存储桶");
  });

  it("位置列表点选已配置的服务直接切换，未配置的进入服务页", async () => {
    const harness = createApp(makeSetting("local"));
    mount(harness.app);
    act(() => getNavigator().push("uploadTargets", {}));
    await waitFor(() => activeTitle() === "保存到哪里");
    expect(activePage()?.textContent).toContain("d7hacx · tau-assets");
    await click(findButton("GitHub 仓库", activePage()));
    await waitFor(() => harness.setting().imageBed.plugin?.id === "tau.upload-github");
    expect(harness.setting().imageBed.active).toBe("plugin");
    await click(findButton("S3 兼容存储", activePage()));
    await waitFor(() => activeTitle() === "S3 兼容存储");
  });

  it("未配置的服务不能测试也不能启用", async () => {
    const harness = createApp(makeSetting("local"));
    mount(harness.app);
    await openProvider("s3", "S3 兼容存储");
    expect(findButton("上传测试图片", activePage())?.getAttribute("aria-disabled")).toBe("true");
    expect(findButton("设为当前", activePage())?.hasAttribute("disabled")).toBe(true);
    expect(activePage()?.textContent).toContain("路径模式");
  });
});

it("切换语言保留账号与手动路径草稿、秘密字段可见性和远程选择，不自动保存或测试", async () => {
  storageRuntime = await createStorageRuntime();
  vi.clearAllMocks();
  window.localStorage.clear();
  window.history.replaceState(null, "");
  const original = mobileLocaleSource.getSnapshot();
  const load = vi.fn(async () => [{ value: "initial://原始路径" }]);
  const beforeSave = vi.fn(async (values: Readonly<Record<string, string>>) => values);
  const id = "tau.upload-fixture",
    name = "用户存储服务";
  storageRuntime.host.registerTrusted(
    definePlugin({
      id,
      name,
      version: "1.0.0",
      create: () => ({
        activate(context) {
          context.upload.register({ id, name, upload: async () => "https://fixture.invalid/file" });
          context.settings.register({
            id: "upload",
            title: name,
            target: "upload",
            form: {
              groups: [
                {
                  title: "用户分组原文",
                  fields: [
                    { key: "account", label: "账号原文", type: "secret" },
                    { key: "destination", label: "路径原文", type: "remote-choice", load },
                  ],
                },
              ],
              beforeSave,
            },
          });
        },
      }),
    })
  );
  await storageRuntime.host.enable(id);
  const setting = makeSetting("local");
  setting.imageBed.plugin = {
    ...setting.imageBed.plugin,
    id: setting.imageBed.plugin?.id ?? "",
    configurations: {
      ...setting.imageBed.plugin?.configurations,
      [id]: {
        account: "原始账号",
        destination: "initial://原始路径",
        legacy: "未知字段原文",
      },
    },
  };
  const harness = createApp(setting);
  tauriMock.savePluginProviderConfig.mockImplementation(
    async (_workspace, _target, pluginId, config) => ({
      ...harness.setting(),
      imageBed: {
        ...harness.setting().imageBed,
        plugin: {
          ...harness.setting().imageBed.plugin,
          configurations: {
            ...harness.setting().imageBed.plugin?.configurations,
            [pluginId]: config,
          },
        },
      },
    })
  );
  try {
    await act(async () => mobileLocaleSource.setLocale("zh-CN"));
    mount(harness.app);
    await openProvider("fixture", name);
    const account = activePage()?.querySelector<HTMLInputElement>('input[aria-label="账号原文"]');
    if (!account) throw new Error("账号输入未挂载");
    await click(
      [...(activePage()?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find(
        button => button.getAttribute("aria-label") === storageTranslator.t("form.show")
      ) ?? null
    );
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        account,
        "未保存的账号"
      );
      account.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(findButton("路径原文", activePage()));
    await act(async () => {
      await Promise.resolve();
    });
    await click(
      findButton(storageTranslator.t("form.manualField", { field: "路径原文" }), activePage())
    );
    const path = activePage()?.querySelector<HTMLInputElement>('input[aria-label="路径原文"]');
    if (!path) throw new Error("手动路径草稿未挂载");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        path,
        "自定义/路径"
      );
      path.dispatchEvent(new Event("input", { bubbles: true }));
      path.focus();
      path.setSelectionRange(1, 4);
    });
    const loaded = load.mock.calls.length,
      savedSetting = harness.setting();
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => mobileLocaleSource.setLocale(locale));
      expect(activePage()?.querySelector('input[aria-label="账号原文"]')).toBe(account);
      expect(account.value).toBe("未保存的账号");
      expect(account.type).toBe("text");
      expect(activePage()?.querySelector('input[aria-label="路径原文"]')).toBe(path);
      expect(path.value).toBe("自定义/路径");
      expect(document.activeElement).toBe(path);
      expect([path.selectionStart, path.selectionEnd]).toEqual([1, 4]);
      expect(harness.setting()).toBe(savedSetting);
      expect(harness.persisted()).toBe(0);
      expect(load).toHaveBeenCalledTimes(loaded);
      expect(beforeSave).not.toHaveBeenCalled();
      expect(tauriMock.savePluginProviderConfig).not.toHaveBeenCalled();
      expect(tauriMock.resourceUploadTest).not.toHaveBeenCalled();
      expect(tauriMock.selectPluginProvider).not.toHaveBeenCalled();
      expect(harness.app.syncSettings.persistSetting).not.toHaveBeenCalled();
    }
    await click(
      findButton(storageTranslator.t("form.use", { value: "自定义/路径" }), activePage())
    );
    await click(findButton(storageTranslator.t("action.save"), activePage()));
    expect(beforeSave).toHaveBeenCalledTimes(1);
    expect(tauriMock.savePluginProviderConfig).toHaveBeenCalledExactlyOnceWith(
      "data.db",
      "upload",
      id,
      { account: "未保存的账号", destination: "自定义/路径", legacy: "未知字段原文" }
    );
  } finally {
    await act(async () => mobileLocaleSource.setLocale(original));
    await storageRuntime.dispose();
    act(() => root?.unmount());
    host?.remove();
    host = null;
    root = null;
    document.body.innerHTML = "";
  }
});
