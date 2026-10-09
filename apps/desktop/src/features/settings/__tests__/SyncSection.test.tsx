import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { download, getOriginDatabaseInfo, upload } from "@/commands";
import { ResourceSyncStatus } from "@/types";
import useSettingStore from "@/stores/useSettingStore";
import { SyncSection } from "../sections/SyncSection";

const mocks = vi.hoisted(() => ({ model: {} as Record<string, unknown> }));

vi.mock("@/commands", () => ({
  download: vi.fn(),
  upload: vi.fn(),
  getOriginDatabaseInfo: vi.fn(async () => ({ databaseInfo: { version: 0 } })),
  getDatabasePath: vi.fn(async (name: string) => `/data/${name}`),
  closeDatabase: vi.fn(),
  removeFile: vi.fn(),
}));
vi.mock("@/utils/sync", () => ({ isSyncConfigured: () => true }));
vi.mock("@/services/usageSyncRunner", () => ({ runUsageSync: vi.fn(async () => null) }));
vi.mock("@/app/settingsStore", () => ({
  useSettingsStore: { getState: () => ({ openSettings: vi.fn() }) },
}));
vi.mock("../sections/useResourceSyncModel", () => ({
  useResourceSyncModel: () => mocks.model,
}));

const file = (syncStatus: ResourceSyncStatus, extra: Record<string, unknown> = {}) => ({
  syncStatus,
  syncDirection: "upload",
  fileSize: 2048,
  lastSyncTime: null,
  ...extra,
});

let container: HTMLDivElement;
let root: Root;
const render = () =>
  act(() =>
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <SyncSection />
      </QueryClientProvider>
    )
  );
const text = () => container.textContent ?? "";
const button = (label: string) =>
  [...container.querySelectorAll("button")].find(b => b.textContent?.includes(label))!;

beforeEach(() => {
  vi.mocked(upload).mockReset();
  vi.mocked(download).mockReset();
  vi.mocked(getOriginDatabaseInfo).mockReset();
  vi.mocked(getOriginDatabaseInfo).mockResolvedValue({
    isDatabaseInfoExist: false,
    databaseInfo: { version: 0 },
    databaseInfoObjectName: "database_data.db.json",
  });
  useSettingStore.setState(s => ({
    setting: {
      ...s.setting,
      database: { active: "data.db", databases: [{ name: "data.db", version: 1 }] },
    },
  }));
  mocks.model = {
    progress: { status: "completed", totalFiles: 3, processedFiles: 3, currentFile: null },
    statusFile: { lastSyncTime: Date.now() },
    isSyncing: false,
    entries: [
      ["broken.png", file(ResourceSyncStatus.Error, { errorMessage: "上传超时" })],
      ["ok.png", file(ResourceSyncStatus.Synced)],
      ["new.pdf", file(ResourceSyncStatus.Pending)],
    ],
    counts: { all: 3, upload: 2, download: 0, error: 1 },
    blacklist: {
      items: [{ id: "1", fileName: "big.mov" }],
      addItems: vi.fn(),
      removeItems: vi.fn(),
    },
    handleSync: vi.fn(),
    handleCancel: vi.fn(),
    handleRefresh: vi.fn(),
  };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
});

it("概览并排数据库卡与资源文件卡，Tab 角标为失败数", () => {
  render();
  expect(text()).toContain("数据库");
  expect(text()).toContain("资源文件");
  expect(text()).toContain("1 个失败");
  expect(text()).toContain("同步目标");
  const filesTab = container.querySelector('[role="tab"][data-tab="files"]')!;
  expect(filesTab.textContent).toBe("资源文件1");
  expect(filesTab.getAttribute("aria-selected")).toBe("false");
});

it("失败项存在时同步按钮改为重试失败，并调用模型动作", () => {
  render();
  act(() => button("重试失败").click());
  expect(mocks.model.handleSync).toHaveBeenCalled();
});

it("查看失败项切到资源文件 Tab 并按需重传筛选", () => {
  render();
  act(() => button("查看失败项").click());
  expect(
    container.querySelector('[role="tab"][data-tab="files"]')!.getAttribute("aria-selected")
  ).toBe("true");
  expect(text()).toContain("broken.png");
  expect(text()).toContain("上传超时");
  expect(text()).not.toContain("ok.png");
  expect(text()).toContain("big.mov");
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
  vi.mocked(getOriginDatabaseInfo).mockResolvedValue({
    isDatabaseInfoExist: true,
    databaseInfo: { version: 2, dataModelVersion: 4, databaseObject: "snapshot.db" },
    databaseInfoObjectName: "database_data.db.json",
  });
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

it("旧协议显示远程版本和升级状态，上传成功后清除升级状态", async () => {
  vi.mocked(getOriginDatabaseInfo).mockResolvedValue({
    isDatabaseInfoExist: true,
    databaseInfo: { version: 1, dataModelVersion: 3, databaseObject: "old.db" },
    databaseInfoObjectName: "database_data.db.json",
  });
  vi.mocked(upload).mockResolvedValue(true);
  render();
  await vi.waitFor(() => expect(text()).toContain("需升级云端"));
  expect(text()).not.toContain("连接失败");
  expect(
    [...container.querySelector("dl")!.querySelectorAll("dd")].map(node => node.textContent?.trim())
  ).toEqual(["1", "1"]);
  await act(async () => button("同步到云端").click());
  expect(upload).toHaveBeenCalledOnce();
  await vi.waitFor(() => expect(text()).not.toContain("需升级云端"));
});

it("旧协议远程有更新时禁用拉取，保留真实版本", async () => {
  vi.mocked(getOriginDatabaseInfo).mockResolvedValue({
    isDatabaseInfoExist: true,
    databaseInfo: { version: 2, dataModelVersion: 3, databaseObject: "old.db" },
    databaseInfoObjectName: "database_data.db.json",
  });
  render();
  await vi.waitFor(() => expect(text()).toContain("需升级云端"));
  expect(button("拉取远程").disabled).toBe(true);
  act(() => button("拉取远程").click());
  expect(download).not.toHaveBeenCalled();
});

it("未来协议查询失败显示协议不兼容", async () => {
  vi.mocked(getOriginDatabaseInfo).mockRejectedValue(new Error("DB_MODEL_INCOMPATIBLE"));
  render();
  await vi.waitFor(() => expect(text()).toContain("协议不兼容"));
  expect(text()).not.toContain("连接失败");
});
