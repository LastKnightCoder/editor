// 同步中心集成测试：经真实 router 入栈，覆盖状态卡主按钮（同步后顺带同步资源文件）、首次配置、出错、
// 服务抽屉 → 服务页 → 设为同步服务（先探测云端再确认）、资源文件行与整库覆盖的可用性。

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageHost, RouterProvider, getNavigator } from "../../../../router";
import { AppContext, type AppContextValue } from "../../../../app/AppContext";
import type { ResourceSyncStatusFile, SettingCompat, SyncVersionResponse } from "../../../../types";
import "../../../cards/pages/home.page";
import "../../pages/settingsModule.page";
import "../../pages/syncProvider.page";

const tauriMock = vi.hoisted(() => ({ syncCheckVersions: vi.fn() }));
vi.mock("../../../../services/tauri", async importOriginal => ({
  ...(await importOriginal<object>()),
  syncCheckVersions: tauriMock.syncCheckVersions,
}));

const toastSpies = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("../../../../components/toast", () => ({ toast: toastSpies }));

function makeSetting(active: string, s3Configured = true): SettingCompat {
  return {
    sync: {
      active,
      webdav: { pathPrefix: "" },
      aliOSS: { bucket: "", region: "", path: "/" },
      s3: s3Configured
        ? { bucket: "tau-sync", region: "ap-southeast-1", pathPrefix: "" }
        : { bucket: "", region: "", pathPrefix: "" },
      github: { repo: "tau-data", branch: "main", pathPrefix: "" },
    },
    integration: {
      github: { token: "ghp_x", user: { name: "d7hacx", email: "" } },
      s3: s3Configured
        ? { accessKeyId: "AKIAEXAMPLE7Q2M", secretAccessKey: "s", endpoint: "", urlStyle: "path" }
        : { accessKeyId: "", secretAccessKey: "", endpoint: "", urlStyle: "path" },
      webdav: { url: "", username: "", password: "" },
      aliOSS: { accessKeyId: "", accessKeySecret: "" },
    },
  } as unknown as SettingCompat;
}

type Harness = {
  app: AppContextValue;
  setting: () => SettingCompat;
};

function createApp(options: {
  setting: SettingCompat;
  versions: SyncVersionResponse | null;
  checkVersions?: () => Promise<SyncVersionResponse>;
  resourceStatusFile?: ResourceSyncStatusFile | null;
}): Harness {
  let setting = options.setting;
  const app = {
    syncSettings: {
      safeSetting: setting,
      isSavingSetting: false,
      isSyncing: false,
      updateSetting: vi.fn((updater: (prev: SettingCompat) => SettingCompat) => {
        setting = updater(setting);
      }),
      persistSetting: vi.fn(async () => ({ ok: true })),
    },
    bootstrap: {
      databases: { activeDatabase: "data.db", databases: [{ name: "data.db", version: 42 }] },
      versions: options.versions,
    },
    resourceSync: {
      progress: {
        totalFiles: 0,
        processedFiles: 0,
        currentFile: null,
        status: "idle",
        uploadCount: 0,
        downloadCount: 0,
        skippedCount: 0,
        errorCount: 0,
        startTime: null,
      },
      statusFile: options.resourceStatusFile ?? null,
      isResourceSyncing: false,
    },
    handleSwitchDatabase: vi.fn(async () => {}),
    handleSaveSetting: vi.fn(async () => {}),
    handleCheckVersions: vi.fn(
      options.checkVersions ??
        (async () =>
          options.versions ?? { databaseName: "data.db", localVersion: 0, remoteVersion: 0 })
    ),
    handleSyncUpload: vi.fn(async () => ({ ok: true, message: "上传成功，版本已更新" })),
    handleSyncDownload: vi.fn(async () => ({ ok: true, message: "下载成功" })),
    handleResourceSyncRefresh: vi.fn(async () => {}),
    handleResourceSyncStart: vi.fn(async () => ({})),
    handleResourceSyncRetryFailed: vi.fn(async () => ({})),
    handleResourceSyncCancel: vi.fn(async () => ({})),
  } as unknown as AppContextValue;
  return { app, setting: () => setting };
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

/** 进入同步中心并等待进入时的自动检查结束（检查期间主按钮禁用） */
async function openCenter(app: AppContextValue): Promise<void> {
  act(() => {
    getNavigator().push("settingsModule", { module: "database" });
  });
  await waitFor(() => activeTitle() === "同步");
  if (app.syncSettings.safeSetting?.sync.s3.bucket) {
    await waitFor(
      () => (app.handleCheckVersions as ReturnType<typeof vi.fn>).mock.calls.length > 0
    );
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  }
}

describe("同步中心", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, "");
  });

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    document.body.innerHTML = "";
  });

  it("云端有更新时主按钮直接下载，进入页面自动检查一次", async () => {
    const versions = { databaseName: "data.db", localVersion: 127, remoteVersion: 131 };
    const { app } = createApp({ setting: makeSetting("s3"), versions });
    mount(app);
    await openCenter(app);

    expect(app.handleCheckVersions).toHaveBeenCalled();
    expect(activePage()?.textContent).toContain("云端有更新");
    expect(activePage()?.textContent).toContain("tau-sync · ap-southeast-1");

    await click(findButton("下载更新", activePage()));
    await waitFor(() => (app.handleSyncDownload as ReturnType<typeof vi.fn>).mock.calls.length > 0);
    expect(app.handleSyncUpload).not.toHaveBeenCalled();
    await waitFor(() => toastSpies.success.mock.calls.length > 0);
    expect(toastSpies.success).toHaveBeenCalledWith("下载成功");
  });

  it("版本一致时「立即同步」先查版本再上传", async () => {
    const versions = { databaseName: "data.db", localVersion: 5, remoteVersion: 5 };
    const { app } = createApp({ setting: makeSetting("s3"), versions });
    mount(app);
    await openCenter(app);
    expect(activePage()?.textContent).toContain("已是最新");

    await click(findButton("立即同步", activePage()));
    await waitFor(() => (app.handleSyncUpload as ReturnType<typeof vi.fn>).mock.calls.length > 0);
    expect(app.handleSyncDownload).not.toHaveBeenCalled();
    // 数据库完成后顺带同步资源文件
    await waitFor(
      () => (app.handleResourceSyncStart as ReturnType<typeof vi.fn>).mock.calls.length > 0
    );
  });

  it("进入时同时刷新资源账本，资源文件行给出待同步徽标", async () => {
    const versions = { databaseName: "data.db", localVersion: 5, remoteVersion: 5 };
    const file = (direction: string, syncStatus: "pending" | "synced" | "error") => ({
      syncStatus,
      syncDirection: direction,
      fileSize: 1024,
      lastSyncTime: null,
      errorMessage: null,
      retryCount: 0,
    });
    const { app } = createApp({
      setting: makeSetting("s3"),
      versions,
      resourceStatusFile: {
        provider: "s3",
        config: {},
        lastSyncTime: null,
        files: {
          "a.webp": file("upload", "pending"),
          "b.webp": file("download", "pending"),
          "c.webp": file("upload", "synced"),
        },
      },
    });
    mount(app);
    await openCenter(app);
    expect(app.handleResourceSyncRefresh).toHaveBeenCalled();
    const row = findButton("资源文件", activePage());
    expect(row?.textContent).toContain("3 个");
    expect(row?.textContent).toContain("2 个待同步");

    await click(row);
    await waitFor(() => activeTitle() === "资源文件");
    expect(activePage()?.textContent).toContain("有 2 个文件待同步");
  });

  it("检查失败时错误留在状态卡上，并给出检查配置入口", async () => {
    const { app } = createApp({
      setting: makeSetting("s3"),
      versions: null,
      checkVersions: async () => {
        throw new Error("SYNC_CHECK_FAILED:403 拒绝访问");
      },
    });
    mount(app);
    await openCenter(app);
    await waitFor(() => activePage()?.textContent?.includes("连接失败") ?? false);
    expect(findButton("检查 S3 兼容存储 配置", activePage())).toBeTruthy();
    expect(findButton("重试", activePage())).toBeTruthy();
  });

  it("当前服务未配置时直接给服务选择，点选进入服务页", async () => {
    const { app } = createApp({ setting: makeSetting("s3", false), versions: null });
    mount(app);
    await openCenter(app);
    expect(activePage()?.textContent).toContain("在多台设备间同步");
    expect(app.handleCheckVersions).not.toHaveBeenCalled();

    await click(findButton("阿里云 OSS", activePage()));
    await waitFor(() => activeTitle() === "阿里云 OSS");
    expect(findButton("设为同步服务", activePage())?.hasAttribute("disabled")).toBe(true);
  });

  it("服务抽屉 → 服务页：云端已有数据时先确认再切换", async () => {
    const versions = { databaseName: "data.db", localVersion: 131, remoteVersion: 131 };
    const harness = createApp({ setting: makeSetting("s3"), versions });
    tauriMock.syncCheckVersions.mockResolvedValue({
      databaseName: "data.db",
      localVersion: 131,
      remoteVersion: 118,
    });
    mount(harness.app);
    await openCenter(harness.app);

    await click(findButton("S3 兼容存储", activePage()));
    await waitFor(() => findButton("GitHub 仓库") !== null);
    await click(findButton("GitHub 仓库"));
    await waitFor(() => activeTitle() === "GitHub 仓库");
    expect(activePage()?.textContent).toContain("d7hacx");

    await click(findButton("设为同步服务", activePage()));
    await waitFor(() => document.body.textContent?.includes("改为同步到 GitHub 仓库？") ?? false);
    expect(harness.app.syncSettings.persistSetting).toHaveBeenCalled();
    expect(tauriMock.syncCheckVersions).toHaveBeenCalledWith("github");
    expect(harness.setting().sync.active).toBe("s3");
    expect(document.body.textContent).toContain("用本机数据库覆盖云端");

    const confirm = [...document.querySelectorAll("button")].find(
      node => node.textContent?.trim() === "切换"
    );
    await click(confirm ?? null);
    expect(harness.setting().sync.active).toBe("github");
    expect(toastSpies.success).toHaveBeenCalledWith("已改为同步到 GitHub 仓库，返回即可同步");
  });

  it("目标服务云端为空时直接切换，不弹确认", async () => {
    const harness = createApp({ setting: makeSetting("s3"), versions: null });
    tauriMock.syncCheckVersions.mockResolvedValue({
      databaseName: "data.db",
      localVersion: 131,
      remoteVersion: 0,
    });
    mount(harness.app);
    act(() => {
      getNavigator().push("syncProvider", { providerId: "github" });
    });
    await waitFor(() => activeTitle() === "GitHub 仓库");
    await click(findButton("设为同步服务", activePage()));
    await waitFor(() => harness.setting().sync.active === "github");
    expect(document.body.textContent).not.toContain("改为同步到 GitHub 仓库？");
  });

  it("测试连接失败时在连接分组显示原因", async () => {
    const harness = createApp({ setting: makeSetting("s3"), versions: null });
    tauriMock.syncCheckVersions.mockRejectedValue(new Error("SYNC_CHECK_FAILED:仓库不存在"));
    mount(harness.app);
    act(() => {
      getNavigator().push("syncProvider", { providerId: "github" });
    });
    await waitFor(() => activeTitle() === "GitHub 仓库");
    await click(findButton("测试连接", activePage()));
    await waitFor(() => activePage()?.textContent?.includes("仓库不存在") ?? false);
    expect(harness.setting().sync.active).toBe("s3");
  });

  it("整库覆盖不允许低版本覆盖高版本", async () => {
    const versions = { databaseName: "data.db", localVersion: 3, remoteVersion: 5 };
    const { app } = createApp({ setting: makeSetting("s3"), versions });
    mount(app);
    await openCenter(app);
    await click(findButton("整库覆盖", activePage()));
    await waitFor(() => activeTitle() === "整库覆盖");

    const upload = findButton("以本机为准", activePage());
    expect(upload?.getAttribute("aria-disabled")).toBe("true");
    expect(upload?.textContent).toContain("云端版本更新，需先下载");
    expect(findButton("以云端为准", activePage())?.getAttribute("aria-disabled")).toBeNull();
  });
});
