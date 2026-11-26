import { desktopLocaleSource } from "@/app/i18n/runtime";
import { syncTranslator } from "../sync/i18n";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  download,
  getDatabasePath,
  closeDatabase,
  removeFile,
  getRemoteDatabaseVersion,
  upload,
  getResourceSyncSnapshot,
  retryFailedResourceSync,
  startResourceSync,
  refreshResourceSyncStatuses,
} from "@/commands";
import { ResourceSyncStatus, type IFileSyncStatus, type ResourceSyncSnapshot } from "@/types";
import useSettingStore, { ESync } from "@/stores/useSettingStore";
import { SyncSection } from "../sections/SyncSection";

const mocks = vi.hoisted(() => ({
  pluginState: "active",
  pluginEnabled: true,
  sections: [] as unknown[],
  probe: vi.fn(async () => ({ version: 0 })),
}));

vi.mock("@/commands", () => ({
  getResourceSyncSnapshot: vi.fn(),
  retryFailedResourceSync: vi.fn(),
  startResourceSync: vi.fn(),
  refreshResourceSyncStatuses: vi.fn(),
  listResourceSyncBlacklist: vi.fn(async () => [{ id: 1, fileName: "big.mov" }]),
  download: vi.fn(),
  upload: vi.fn(),
  getRemoteDatabaseVersion: vi.fn(async () => ({ version: 0 })),
  getDatabasePath: vi.fn(async (name: string) => `/data/${name}`),
  closeDatabase: vi.fn(),
  removeFile: vi.fn(),
}));
vi.mock("@/utils/sync", () => ({ isSyncConfigured: () => true }));
vi.mock("@/app/plugins/context", () => ({
  useDesktopPlugins: () => ({
    listSettings: () => mocks.sections,
    local: { owns: () => true, enabled: () => mocks.pluginEnabled },
    host: { listPlugins: () => [{ id: "test.sync", state: mocks.pluginState }] },
  }),
}));
vi.mock("@/services/storage-providers", async importOriginal => ({
  ...(await importOriginal<typeof import("@/services/storage-providers")>()),
  probeRemoteDatabaseVersion: mocks.probe,
}));
vi.mock("@/services/page-navigation", () => ({ openPage: vi.fn() }));
vi.mock("@/services/usageSyncRunner", () => ({ runUsageSync: vi.fn(async () => null) }));
vi.mock("@/app/settingsStore", () => ({
  useSettingsStore: { getState: () => ({ openSettings: vi.fn(), closeSettings: vi.fn() }) },
}));
const file = (
  syncStatus: ResourceSyncStatus,
  extra: Partial<IFileSyncStatus> = {}
): IFileSyncStatus => ({
  retryCount: 0,
  errorMessage: null,
  syncStatus,
  syncDirection: "upload",
  fileSize: 2048,
  lastSyncTime: null,
  ...extra,
});

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;
const render = () =>
  act(() =>
    root.render(
      <QueryClientProvider client={queryClient}>
        <SyncSection />
      </QueryClientProvider>
    )
  );
const text = () => container.textContent ?? "";
const button = (label: string) =>
  [...container.querySelectorAll("button")].find(b => b.textContent?.includes(label))!;

const providerSection = (pluginId: string, title: string) => ({
  key: `plugin:${pluginId}:sync`,
  mountId: 1,
  context: { pluginId },
  definition: {
    id: "sync",
    title,
    target: "sync",
    form: {
      groups: [
        {
          title: "存储位置",
          fields: [
            { key: "bucket", label: "Bucket", type: "text", summary: true },
            { key: "secret", label: "密钥", type: "secret" },
          ],
        },
      ],
    },
  },
});

beforeEach(() => {
  queryClient = new QueryClient();
  mocks.sections = [];
  mocks.probe.mockReset().mockResolvedValue({ version: 0 });
  mocks.pluginState = "active";
  mocks.pluginEnabled = true;
  vi.mocked(upload).mockReset();
  vi.mocked(download).mockReset();
  vi.mocked(getRemoteDatabaseVersion).mockReset();
  vi.mocked(getRemoteDatabaseVersion).mockResolvedValue({ version: 0 });
  useSettingStore.setState(s => ({
    setting: {
      ...s.setting,
      sync: {
        ...s.setting.sync,
        active: ESync.Plugin,
        plugin: { id: "test.sync", configurations: { "test.sync": {} } },
      },
      database: { active: "data.db", databases: [{ name: "data.db", version: 1 }] },
    },
  }));
  vi.mocked(retryFailedResourceSync).mockReset().mockResolvedValue({ ok: true });
  vi.mocked(startResourceSync).mockReset();
  vi.mocked(refreshResourceSyncStatuses).mockClear();
  vi.mocked(getResourceSyncSnapshot)
    .mockReset()
    .mockResolvedValue({
      progress: {
        status: "error",
        totalFiles: 3,
        processedFiles: 3,
        currentFile: null,
        startTime: 1,
        uploadCount: 2,
        downloadCount: 1,
        skippedCount: 1,
        errorCount: 1,
      },
      statusFile: {
        provider: "plugin",
        config: {},
        lastSyncTime: 1,
        files: {
          "broken.png": file(ResourceSyncStatus.Error, { errorMessage: "上传超时" }),
          "ok.png": file(ResourceSyncStatus.Synced),
          "new.pdf": file(ResourceSyncStatus.Synced, { syncDirection: "download" }),
          "both.txt": file(ResourceSyncStatus.Synced, { syncDirection: null }),
        },
      },
    });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  queryClient.clear();
  document.body.innerHTML = "";
});

it("已启用插件仍在激活时等待，就绪后自动检查远程版本", async () => {
  mocks.pluginState = "activating";
  render();
  expect(text()).toContain("准备中");
  expect(button("检查").disabled).toBe(true);
  expect(button("同步到云端").disabled).toBe(true);
  await act(async () => {
    button("检查").click();
    button("同步到云端").click();
  });
  expect(getRemoteDatabaseVersion).not.toHaveBeenCalled();
  expect(upload).not.toHaveBeenCalled();

  mocks.pluginState = "active";
  render();
  await vi.waitFor(() => expect(text()).toContain("已是最新"));
  expect(getRemoteDatabaseVersion).toHaveBeenCalledOnce();
  expect(text()).not.toContain("检查失败");
  expect(button("检查").disabled).toBe(false);
});

it("插件激活失败不发起检查，恢复激活后自动检查", async () => {
  mocks.pluginState = "failed";
  render();
  expect(text()).toContain("插件不可用");
  expect(getRemoteDatabaseVersion).not.toHaveBeenCalled();
  mocks.pluginState = "active";
  render();
  await vi.waitFor(() => expect(text()).toContain("已是最新"));
  expect(getRemoteDatabaseVersion).toHaveBeenCalledOnce();
});

it("真实检查失败保留错误，手动检查成功后清除", async () => {
  vi.mocked(getRemoteDatabaseVersion).mockRejectedValueOnce(new Error("网络不可用"));
  render();
  await vi.waitFor(() => expect(text()).toContain("检查失败"));
  await act(async () => button("检查").click());
  await vi.waitFor(() => expect(text()).toContain("已是最新"));
  expect(getRemoteDatabaseVersion).toHaveBeenCalledTimes(2);
  expect(text()).not.toContain("检查失败");
});

it("云端存储直接显示上传下载明细，两端已有的文件展开后可查", async () => {
  render();
  await vi.waitFor(() => expect(text()).toContain("ok.png"));
  expect(text()).toContain("new.pdf");
  expect(text()).not.toContain("both.txt");
  const details = container.querySelector("details")!;
  await act(async () => {
    details.open = true;
    details.dispatchEvent(new Event("toggle"));
  });
  expect(text()).toContain("both.txt");
});

it("同步服务列表只显示摘要，未配置不可选，切换前先探测云端", async () => {
  mocks.sections = [providerSection("test.sync", "S3"), providerSection("other.sync", "WebDAV")];
  useSettingStore.setState(s => ({
    setting: {
      ...s.setting,
      sync: {
        ...s.setting.sync,
        plugin: {
          id: "test.sync",
          configurations: {
            "test.sync": { bucket: "notes", secret: "x" },
            "other.sync": { bucket: "dav", secret: "y" },
            "third.sync": {},
          },
        },
      },
    },
  }));
  render();
  expect(text()).toContain("notes");
  expect(text()).not.toContain("x");
  const radios = [
    ...container.querySelectorAll<HTMLInputElement>('input[type="radio"][value$=".sync"]'),
  ];
  expect(radios.map(radio => radio.checked)).toEqual([true, false]);
  await act(async () => radios[1].click());
  await vi.waitFor(() =>
    expect(useSettingStore.getState().setting.sync.plugin?.id).toBe("other.sync")
  );
  expect(mocks.probe).toHaveBeenCalledWith("other.sync", { bucket: "dav", secret: "y" });
});

it("目标云端已有数据时确认后才切换", async () => {
  mocks.sections = [providerSection("test.sync", "S3"), providerSection("other.sync", "WebDAV")];
  mocks.probe.mockResolvedValue({ version: 5 });
  useSettingStore.setState(s => ({
    setting: {
      ...s.setting,
      sync: {
        ...s.setting.sync,
        plugin: {
          id: "test.sync",
          configurations: {
            "test.sync": { bucket: "notes", secret: "x" },
            "other.sync": { bucket: "dav", secret: "y" },
          },
        },
      },
    },
  }));
  render();
  const radios = [
    ...container.querySelectorAll<HTMLInputElement>('input[type="radio"][value$=".sync"]'),
  ];
  await act(async () => radios[1].click());
  await vi.waitFor(() => expect(document.body.textContent).toContain("改为同步到 WebDAV"));
  expect(useSettingStore.getState().setting.sync.plugin?.id).toBe("test.sync");
  const confirm = [...document.body.querySelectorAll("button")].find(
    node => node.textContent?.trim() === "切换"
  ) as HTMLButtonElement;
  await act(async () => confirm.click());
  expect(useSettingStore.getState().setting.sync.plugin?.id).toBe("other.sync");
});

it("同步请求返回前立即锁定按钮，结束后原地读取结果", async () => {
  const previous = await vi.mocked(getResourceSyncSnapshot)({
    provider: "plugin",
    pluginId: "test.sync",
    config: {},
  });
  const idle: ResourceSyncSnapshot = {
    progress: { ...previous.progress, status: "idle" },
    statusFile: null,
  };
  vi.mocked(getResourceSyncSnapshot).mockResolvedValue(idle);
  let finish!: () => void;
  vi.mocked(startResourceSync).mockImplementation(
    () =>
      new Promise(resolve => {
        finish = () => resolve({ ok: true });
      })
  );
  render();
  await vi.waitFor(() => expect(text()).toContain("已是最新"));
  const syncButton = [...container.querySelectorAll("button")].find(
    item => item.textContent === "同步"
  )!;
  act(() => {
    syncButton.click();
    syncButton.click();
  });
  expect(startResourceSync).toHaveBeenCalledOnce();
  expect(syncButton.disabled).toBe(true);
  expect(button("停止").disabled).toBe(false);
  expect(container.querySelector('[role="progressbar"]')).toBeNull();
  vi.mocked(getResourceSyncSnapshot).mockResolvedValue({
    ...previous,
    progress: {
      ...previous.progress,
      status: "syncing",
      currentFile: "new.pdf",
      totalFiles: 2,
      processedFiles: 1,
    },
  });
  await vi.waitFor(
    () =>
      expect(container.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe(
        "50"
      ),
    { timeout: 2000 }
  );
  vi.mocked(getResourceSyncSnapshot).mockResolvedValue(previous);
  await act(async () => finish());
  await vi.waitFor(() => expect(text()).toContain("上传超时"));
  expect(text()).toContain("new.pdf");
  expect(refreshResourceSyncStatuses).not.toHaveBeenCalled();
});

it("在云端存储筛出失败原因，可单独重试该文件", async () => {
  render();
  await vi.waitFor(() => expect(text()).toContain("broken.png"));
  act(() => container.querySelector<HTMLInputElement>('input[value="error"]')!.click());
  expect(text()).toContain("上传超时");
  expect(text()).not.toContain("ok.png");
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[aria-label="重试 broken.png"]')!.click()
  );
  expect(retryFailedResourceSync).toHaveBeenCalledWith(
    expect.objectContaining({ pluginId: "test.sync" }),
    "broken.png"
  );
});

it("本地数据库 Tab：展示当前库与路径，其他库可删除，新建入口与备份注记", async () => {
  useSettingStore.setState(s => ({
    setting: {
      ...s.setting,
      database: {
        active: "notes.db",
        databases: [
          { name: "notes.db", version: 3 },
          { name: "work.db", version: 1 },
        ],
      },
    },
  }));
  render();
  const tab = container.querySelector('[role="tab"][data-tab="database"]') as HTMLButtonElement;
  expect(tab.textContent).toBe("本地数据库");
  await act(async () => tab.click());
  expect(tab.getAttribute("aria-selected")).toBe("true");
  expect(text()).toContain("当前数据库");
  await vi.waitFor(() => expect(text()).toContain("/data/notes.db"));
  expect(text()).toContain("新建数据库");
  expect(text()).toContain("拉取远程数据库前，原文件会自动备份到 backup 文件夹");
  expect(container.querySelector('[aria-label="删除数据库：work"]')).not.toBeNull();
  expect(container.querySelector('[aria-label="删除数据库：notes"]')).toBeNull();
});

it("拉取远程后保留远程版本缓存", async () => {
  useSettingStore.setState(s => ({
    setting: {
      ...s.setting,
      database: {
        active: "data.db",
        databases: [{ name: "data.db", version: 1 }],
      },
    },
  }));
  vi.mocked(getRemoteDatabaseVersion).mockResolvedValue({ version: 2 });
  vi.mocked(download).mockImplementation(async () => {
    useSettingStore.setState(s => ({
      setting: {
        ...s.setting,
        database: {
          ...s.setting.database,
          databases: [{ name: "data.db", version: 2 }],
        },
      },
    }));
    return true;
  });

  render();
  await vi.waitFor(() => {
    expect(
      [...container.querySelector("dl")!.querySelectorAll("dd")].map(node =>
        node.textContent?.trim()
      )
    ).toEqual(["1", "2"]);
  });

  await act(async () => button("拉取远程").click());
  await vi.waitFor(() => expect(document.body.textContent).toContain("下载更新"));
  const confirmButton = [...document.body.querySelectorAll("button")].find(
    node => node.textContent?.trim() === "下载"
  ) as HTMLButtonElement;
  await act(async () => confirmButton.click());

  await vi.waitFor(() => {
    expect(
      [...container.querySelector("dl")!.querySelectorAll("dd")].map(node =>
        node.textContent?.trim()
      )
    ).toEqual(["2", "2"]);
  });
});

it("远程有更新时可确认后强制上传", async () => {
  vi.mocked(getRemoteDatabaseVersion).mockResolvedValue({ version: 3 });
  vi.mocked(upload).mockResolvedValue(true);
  render();
  await vi.waitFor(() => expect(text()).toContain("远程有更新"));
  await act(async () => button("强制上传").click());
  expect(upload).not.toHaveBeenCalled();
  const confirm = [...document.body.querySelectorAll("button")].find(
    b => b.textContent?.trim() === "强制同步"
  )!;
  await act(async () => confirm.click());
  expect(upload).toHaveBeenCalledOnce();
});

it("切换语言保留建库草稿、光标和查询身份，主动创建时仍保存原始文件名", async () => {
  const original = desktopLocaleSource.getSnapshot();
  const counts = () => ({
    remote: vi.mocked(getRemoteDatabaseVersion).mock.calls.length,
    resources: vi.mocked(getResourceSyncSnapshot).mock.calls.length,
    path: vi.mocked(getDatabasePath).mock.calls.length,
    upload: vi.mocked(upload).mock.calls.length,
    download: vi.mocked(download).mock.calls.length,
    close: vi.mocked(closeDatabase).mock.calls.length,
    remove: vi.mocked(removeFile).mock.calls.length,
  });
  try {
    await act(async () => desktopLocaleSource.setLocale("zh-CN"));
    render();
    await vi.waitFor(() => expect(getRemoteDatabaseVersion).toHaveBeenCalled());
    const tab = container.querySelector<HTMLButtonElement>('[role="tab"][data-tab="database"]');
    if (!tab) throw new Error("本地数据库入口未挂载");
    await act(async () => tab.click());
    await vi.waitFor(() => expect(getDatabasePath).toHaveBeenCalledWith("data.db"));
    await act(async () => button(syncTranslator.t("action.new")).click());
    const field = document.querySelector<HTMLInputElement>("#new-database-name");
    if (!field) throw new Error("建库草稿未挂载");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        field,
        "用户草稿.db"
      );
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.focus();
      field.setSelectionRange(1, 4);
    });
    const setting = useSettingStore.getState().setting,
      before = counts(),
      keys = queryClient
        .getQueryCache()
        .getAll()
        .map(query => query.queryKey);
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect(document.querySelector("#new-database-name")).toBe(field);
      expect(field.value).toBe("用户草稿.db");
      expect(document.activeElement).toBe(field);
      expect([field.selectionStart, field.selectionEnd]).toEqual([1, 4]);
      expect(tab.getAttribute("aria-selected")).toBe("true");
      expect(useSettingStore.getState().setting).toBe(setting);
      expect(counts()).toEqual(before);
      expect(
        queryClient
          .getQueryCache()
          .getAll()
          .map(query => query.queryKey)
      ).toEqual(keys);
    }
    const create = [...document.querySelectorAll("button")].find(
      node => node.textContent?.trim() === syncTranslator.t("action.create")
    );
    if (!create) throw new Error("创建入口未挂载");
    await act(async () => create.click());
    expect(useSettingStore.getState().setting.database.active).toBe("用户草稿.db");
    expect(useSettingStore.getState().setting.database.databases).toContainEqual({
      name: "用户草稿.db",
      version: 1,
    });
  } finally {
    await act(async () => desktopLocaleSource.setLocale(original));
  }
});

it("切换语言保留进行中的数据库同步进度，不重发上传或重新检查", async () => {
  const original = desktopLocaleSource.getSnapshot();
  let finish: ((value: boolean) => void) | undefined;
  vi.mocked(upload).mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  try {
    await act(async () => desktopLocaleSource.setLocale("zh-CN"));
    render();
    await vi.waitFor(() => expect(getRemoteDatabaseVersion).toHaveBeenCalled());
    await act(async () => button(syncTranslator.t("action.uploadCloud")).click());
    await act(async () =>
      vi.mocked(upload).mock.calls[0][0]?.onProgress?.({
        value: 31,
        status: { kind: "upload-database-progress", done: 42, total: 99 },
      })
    );
    const progress = container.querySelector('[role="progressbar"]'),
      before = {
        remote: vi.mocked(getRemoteDatabaseVersion).mock.calls.length,
        resources: vi.mocked(getResourceSyncSnapshot).mock.calls.length,
      },
      keys = queryClient
        .getQueryCache()
        .getAll()
        .map(query => query.queryKey);
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect(container.querySelector('[role="progressbar"]')).toBe(progress);
      expect(progress?.getAttribute("aria-valuenow")).toBe("31");
      expect(button(syncTranslator.t("action.check")).disabled).toBe(true);
      expect(upload).toHaveBeenCalledTimes(1);
      expect(download).not.toHaveBeenCalled();
      expect({
        remote: vi.mocked(getRemoteDatabaseVersion).mock.calls.length,
        resources: vi.mocked(getResourceSyncSnapshot).mock.calls.length,
      }).toEqual(before);
      expect(
        queryClient
          .getQueryCache()
          .getAll()
          .map(query => query.queryKey)
      ).toEqual(keys);
    }
  } finally {
    await act(async () => {
      finish?.(true);
      await Promise.resolve();
      desktopLocaleSource.setLocale(original);
    });
  }
});
