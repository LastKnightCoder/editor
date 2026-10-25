import { createStorageRuntime } from "../../__tests__/storageProviders";
import { MobilePluginsContext } from "../../../../app/plugins/context";
let storageRuntime: Awaited<ReturnType<typeof createStorageRuntime>>;
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

const tauriMock = vi.hoisted(() => ({ syncCheckVersions: vi.fn(), selectPluginProvider: vi.fn() }));
vi.mock("../../../../services/tauri", async importOriginal => ({
  ...(await importOriginal<object>()),
  syncCheckVersions: tauriMock.syncCheckVersions,
  selectPluginProvider: tauriMock.selectPluginProvider,
}));

const toastSpies = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("../../../../components/toast", () => ({ toast: toastSpies }));

function makeSetting(active: string, s3Configured = true): SettingCompat {
  return {
    database: { active: "data.db", databases: [] },
    imageBed: {
      active: "local",
      enableCompression: true,
      local: { path: "resources" },
      plugin: { id: "", configurations: {} },
    },
    sync: {
      active: "plugin",
      plugin: {
        id: `tau.sync-${active}`,
        configurations: {
          ...(s3Configured
            ? {
                "tau.sync-s3": {
                  bucket: "tau-sync",
                  region: "ap-southeast-1",
                  accessKeyId: "fixture",
                  secretAccessKey: "fixture",
                },
              }
            : {}),
          "tau.sync-github": {
            token: "fixture",
            owner: "d7hacx",
            repo: "tau-data",
            branch: "main",
            pathPrefix: "",
          },
        },
      },
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

/** 进入同步中心并等待进入时的自动检查结束（检查期间主按钮禁用） */
async function openCenter(app: AppContextValue): Promise<void> {
  act(() => {
    getNavigator().push("settingsModule", { module: "database" });
  });
  await waitFor(() => activeTitle() === "同步");
  if (app.syncSettings.safeSetting?.sync.plugin?.configurations["tau.sync-s3"]) {
    await waitFor(
      () => (app.handleCheckVersions as ReturnType<typeof vi.fn>).mock.calls.length > 0
    );
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  }
}

describe("同步中心", () => {
  beforeEach(async () => {
    storageRuntime = await createStorageRuntime();
    vi.clearAllMocks();
    window.history.replaceState(null, "");
  });

  afterEach(async () => {
    await storageRuntime.dispose();
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
    expect(activePage()?.textContent).toContain("配置已保存");

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
    expect(tauriMock.syncCheckVersions).toHaveBeenCalledWith("tau.sync-github");
    expect(harness.setting().sync.plugin?.id).toBe("tau.sync-s3");
    expect(document.body.textContent).toContain("用本机数据库覆盖云端");

    const confirm = [...document.querySelectorAll("button")].find(
      node => node.textContent?.trim() === "切换"
    );
    await click(confirm ?? null);
    expect(harness.setting().sync.plugin?.id).toBe("tau.sync-github");
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
      getNavigator().push("syncProvider", { providerId: "tau.sync-github" });
    });
    await waitFor(() => activeTitle() === "GitHub 仓库");
    await click(findButton("设为同步服务", activePage()));
    await waitFor(() => harness.setting().sync.plugin?.id === "tau.sync-github");
    expect(document.body.textContent).not.toContain("改为同步到 GitHub 仓库？");
  });

  it("测试连接失败时在连接分组显示原因", async () => {
    const harness = createApp({ setting: makeSetting("s3"), versions: null });
    tauriMock.syncCheckVersions.mockRejectedValue(new Error("SYNC_CHECK_FAILED:仓库不存在"));
    mount(harness.app);
    act(() => {
      getNavigator().push("syncProvider", { providerId: "tau.sync-github" });
    });
    await waitFor(() => activeTitle() === "GitHub 仓库");
    await click(findButton("测试连接", activePage()));
    await waitFor(() => activePage()?.textContent?.includes("仓库不存在") ?? false);
    expect(harness.setting().sync.plugin?.id).toBe("tau.sync-s3");
  });

  it("插件账号浮层留在服务页作用域，系统返回先关浮层", async () => {
    const harness = createApp({ setting: makeSetting("s3"), versions: null });
    mount(harness.app);
    act(() => getNavigator().push("syncProvider", { providerId: "tau.sync-github" }));
    await waitFor(() => activeTitle() === "GitHub 仓库");
    await click(findButton("更换", activePage()));
    await waitFor(() => !!activePage()?.querySelector('[role="dialog"]'));
    await act(async () => {
      await getNavigator().goBack("android");
    });
    expect(activeTitle()).toBe("GitHub 仓库");
    await waitFor(() => !document.querySelector('[role="dialog"]'));
  });

  it("整库覆盖较新一侧时可执行，并在确认面板警示", async () => {
    const versions = { databaseName: "data.db", localVersion: 3, remoteVersion: 5 };
    const { app } = createApp({ setting: makeSetting("s3"), versions });
    mount(app);
    await openCenter(app);
    await click(findButton("整库覆盖", activePage()));
    await waitFor(() => activeTitle() === "整库覆盖");

    const upload = findButton("以本机为准", activePage());
    expect(upload?.getAttribute("aria-disabled")).toBeNull();
    await click(upload);
    await waitFor(() => document.body.textContent?.includes("云端版本比本机新") ?? false);
  });
});
