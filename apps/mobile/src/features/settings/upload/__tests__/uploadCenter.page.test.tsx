// 「图片与附件」集成测试：经真实 router 入栈，覆盖目的地卡的状态与修复入口、压缩开关、
// 抽屉切换到本机，以及上传服务页的示例地址、测试上传（能传 / 打不开 / 传不上去）与设为上传位置。

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

const tauriMock = vi.hoisted(() => ({ resourceUploadTest: vi.fn() }));
vi.mock("../../../../services/tauri", async importOriginal => ({
  ...(await importOriginal<object>()),
  resourceUploadTest: tauriMock.resourceUploadTest,
}));

const toastSpies = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("../../../../components/toast", () => ({ toast: toastSpies }));

function makeSetting(active: string, githubReady = true): SettingCompat {
  return {
    imageBed: {
      active,
      enableCompression: true,
      github: githubReady
        ? { repo: "tau-assets", branch: "main", pathPrefix: "uploads" }
        : { repo: "", branch: "", pathPrefix: "" },
      aliOSS: { bucket: "", region: "", pathPrefix: "" },
      local: { path: "resources" },
      s3: { bucket: "", region: "", pathPrefix: "" },
      webdav: { pathPrefix: "" },
    },
    integration: {
      github: { token: "ghp_x", user: { name: "d7hacx", email: "" } },
      s3: { accessKeyId: "", secretAccessKey: "", endpoint: "", urlStyle: "path" },
      webdav: { url: "", username: "", password: "" },
      aliOSS: { accessKeyId: "", accessKeySecret: "" },
    },
  } as unknown as SettingCompat;
}

type Harness = { app: AppContextValue; setting: () => SettingCompat; persisted: () => number };

function createApp(initial: SettingCompat): Harness {
  let setting = initial;
  let persisted = 0;
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
        <AppContext.Provider value={app}>
          <PageHost rootContent={<div data-testid="root" />} />
        </AppContext.Provider>
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
    getNavigator().push("uploadProvider", { providerId });
  });
  await waitFor(() => activeTitle() === title);
}

describe("图片与附件", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    resetUploadOutcomeForTest();
    window.history.replaceState(null, "");
  });

  afterEach(() => {
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
      "github",
      new Error("RESOURCE_UPLOAD_FAILED:Github 上传返回异常状态 HTTP 401: Bad credentials")
    );
    const harness = createApp(makeSetting("github"));
    mount(harness.app);
    await openCenter();
    expect(activePage()?.textContent).toContain("最近一次没传上去：账号已失效或没有写入权限");
    expect(findButton("检查账号", activePage())).toBeTruthy();
  });

  it("换了上传位置后不再显示旧位置的结果", async () => {
    recordUploadFailure("s3", new Error("RESOURCE_UPLOAD_FAILED:HTTP 403"));
    recordUploadSuccess("github");
    const harness = createApp(makeSetting("github"));
    mount(harness.app);
    await openCenter();
    expect(activePage()?.textContent).toContain("正常");
    expect(activePage()?.textContent).not.toContain("没传上去");
  });

  it("抽屉里选「这台手机」直接切换并提示影响范围", async () => {
    const harness = createApp(makeSetting("github"));
    mount(harness.app);
    await openCenter();
    await click(findButton("更换位置", activePage()));
    await waitFor(() => document.body.textContent?.includes("保存到哪里") ?? false);
    await click(findButton("这台手机"));
    expect(harness.setting().imageBed.active).toBe("local");
    expect(toastSpies.success).toHaveBeenCalledWith("之后的新图片会保存在这台手机");
  });

  it("服务页显示示例地址；测试通过后可设为上传位置", async () => {
    const harness = createApp(makeSetting("local"));
    tauriMock.resourceUploadTest.mockResolvedValue({
      url: "https://raw.githubusercontent.com/d7hacx/tau-assets/main/uploads/tau-upload-test.png",
      readable: true,
      elapsedMs: 1800,
    });
    mount(harness.app);
    await openProvider("github", "GitHub 仓库");
    expect(activePage()?.textContent).toContain(
      "https://raw.githubusercontent.com/d7hacx/tau-assets/main/uploads/photo_"
    );

    await click(findButton("上传测试图片", activePage()));
    await waitFor(() => activePage()?.textContent?.includes("上传成功，图片可以打开") ?? false);
    expect(harness.app.syncSettings.persistSetting).toHaveBeenCalled();
    expect(tauriMock.resourceUploadTest).toHaveBeenCalledWith("github");
    expect(harness.setting().imageBed.active).toBe("local");

    await click(findButton("设为上传位置", activePage()));
    expect(harness.setting().imageBed.active).toBe("github");
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
    expect(findButton("设为上传位置", activePage())?.hasAttribute("disabled")).toBe(true);
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

  it("未配置的服务不能测试也不能启用", async () => {
    const harness = createApp(makeSetting("local"));
    mount(harness.app);
    await openProvider("s3", "S3 兼容存储");
    expect(findButton("上传测试图片", activePage())?.hasAttribute("disabled")).toBe(true);
    expect(findButton("设为上传位置", activePage())?.hasAttribute("disabled")).toBe(true);
    expect(activePage()?.textContent).not.toContain("图片地址示例");
  });
});
