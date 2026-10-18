import { act } from "react";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import * as ui from "@tau/ui";
import * as sdk from "@tau/plugins";
import { createMemoryStorage, type DevelopmentPluginPackage } from "@tau/plugins/host";
import { DesktopPluginRuntime } from "@/app/plugins/runtime";
import { registerPluginPackage } from "@/app/plugins/package-loader";
import { PluginRuntimeContext } from "@/app/plugins/context";
import useSettingStore, { ESync } from "@/stores/useSettingStore";
import { SyncSection } from "../sections/SyncSection";

const mocks = vi.hoisted(() => ({ save: vi.fn(), upload: vi.fn(async () => true) }));
vi.mock("@/commands", () => ({
  upload: mocks.upload,
  download: vi.fn(),
  getOriginDatabaseInfo: vi.fn(async () => ({ databaseInfo: { version: 0 } })),
  getDatabasePath: vi.fn(async () => "/test/data.db"),
  closeDatabase: vi.fn(),
  removeFile: vi.fn(),
}));
vi.mock("@/commands/plugin-local", () => ({ savePluginSyncConfig: mocks.save }));
vi.mock("@/utils/sync", async () => import("@/utils/sync/isSyncConfigured"));
vi.mock("@/services/usageSyncRunner", () => ({ runUsageSync: vi.fn(async () => null) }));
vi.mock("../sections/useResourceSyncModel", () => ({
  useResourceSyncModel: () => ({
    counts: { all: 0, upload: 0, download: 0, error: 0 },
    entries: [],
    statusFile: null,
    progress: { status: "idle", totalFiles: 0, processedFiles: 0, currentFile: null },
    isSyncing: false,
    blacklist: { items: [] },
    handleSync: vi.fn(),
    handleRefresh: vi.fn(),
    handleCancel: vi.fn(),
  }),
}));
const zip = process.env.TAU_SYNC_PLUGIN_ZIP;
describe.skipIf(!zip)("真实插件包注册同步配置表单", () => {
  let root: Root, container: HTMLDivElement, runtime: DesktopPluginRuntime;
  let pluginId: string;
  let previous: ReturnType<typeof useSettingStore.getState>["setting"];
  const settle = async () =>
    act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });
  beforeEach(async () => {
    if (!zip) throw new Error("缺少插件ZIP");
    // ZIP在Node中读取，避免JSDOM与Node的Uint8Array原型不同导致解包库误判输入。
    const artifact: DevelopmentPluginPackage = JSON.parse(
      execFileSync(
        process.execPath,
        [
          "-e",
          "const z=new(require('adm-zip'))(process.argv[1]);const e=z.getEntries().find(e=>e.entryName.endsWith('/manifest.json'));const m=JSON.parse(e.getData().toString());process.stdout.write(JSON.stringify({manifest:m,code:z.readAsText(m.id+'/'+m.main)}));",
          zip,
        ],
        { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
      )
    );
    const manifest = artifact.manifest;
    pluginId = manifest.id;
    previous = useSettingStore.getState().setting;
    useSettingStore.setState({
      setting: { ...previous, sync: { ...previous.sync, active: ESync.Plugin, plugin: undefined } },
    });
    mocks.save.mockReset().mockResolvedValue(undefined);
    runtime = new DesktopPluginRuntime({
      workspaceId: "test",
      storage: createMemoryStorage(),
      navigator: { push: vi.fn() },
      plugins: [],
      openSettings: vi.fn(),
    });
    registerPluginPackage(runtime.host, artifact, async () => ({
      "@tau/plugins": sdk,
      "@tau/ui": ui,
      react: React,
      "react/jsx-runtime": jsx,
    }));
    await runtime.host.enable(manifest.id);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () =>
      root.render(
        <ui.UiProvider>
          <QueryClientProvider
            client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
          >
            <PluginRuntimeContext.Provider value={runtime}>
              <SyncSection />
            </PluginRuntimeContext.Provider>
          </QueryClientProvider>
        </ui.UiProvider>
      )
    );
    await settle();
  });
  afterEach(async () => {
    await act(async () => {
      root?.unmount();
      await runtime?.dispose();
    });
    container?.remove();
    if (previous) useSettingStore.setState({ setting: previous });
  });
  async function input(label: string, value: string) {
    const element = container.querySelector<HTMLInputElement>('input[aria-label="' + label + '"]');
    if (!element) throw new Error("缺少字段：" + label);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        element,
        value
      );
      element.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  const button = (label: string) => {
    const found = [...container.querySelectorAll("button")].find(
      item => item.textContent === label
    );
    if (!found) throw new Error("缺少按钮：" + label);
    return found;
  };
  it("配置来自插件包，失败保留表单，成功保存并沿用客户端上传入口", async () => {
    expect(runtime.listSettings()[0].definition.target).toBe("sync");
    await input("Bucket", "test-bucket");
    await input("Region", "test-region");
    await input("Access Key ID", "test-only");
    await input(
      pluginId === "tau.sync-oss" ? "Access Key Secret" : "Secret Access Key",
      "test-only"
    );
    mocks.save.mockRejectedValueOnce(new Error("写入失败"));
    await act(async () => button("保存同步配置").click());
    await settle();
    expect(container.textContent).toContain("写入失败");
    expect(useSettingStore.getState().setting.sync.plugin).toBeUndefined();
    await act(async () => button("保存同步配置").click());
    await settle();
    expect(mocks.save).toHaveBeenLastCalledWith(
      pluginId,
      expect.objectContaining({ bucket: "test-bucket", region: "test-region" })
    );
    expect(useSettingStore.getState().setting.sync.plugin?.configurations[pluginId]).toMatchObject({
      bucket: "test-bucket",
    });
    await act(async () => button("同步到云端").click());
    await settle();
    expect(mocks.upload).toHaveBeenCalled();
    await act(async () => runtime.host.disable(pluginId));
    await settle();
    expect(container.textContent).toContain("请先在插件页安装并启用同步插件");
    expect(useSettingStore.getState().setting.sync.plugin?.id).toBe(pluginId);
  });
});
