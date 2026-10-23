import { afterEach, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { invoke } from "@tauri-apps/api/core";
import {
  createMobilePluginCenterClient,
  installMobileCenterRelease,
  MobileCenterError,
} from "../pluginCenter";
import { portableFixtures } from "../../../../../tests/fixtures/plugins/portable.mjs";
import { centerHost } from "../../../../../tests/fixtures/plugins/center";
import { refreshMobileCenterInstallations } from "../pluginCenter";
import { readMobilePlugins } from "../plugins";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

it("刷新失败标记中心状态未刷新，恢复后清理标记且保留待生效版本与撤回原因", async () => {
  const inventory = {
    appVersion: "0.2.0",
    platform: "ios",
    development: true,
    packages: [
      {
        id: "test.plugin",
        enabled: false,
        currentVersion: "1.0.0",
        pendingVersion: "2.0.0",
        centerSource: { origin: "https://example.invalid", releaseId: "release-1" },
        revoked: { kind: "revoked", reason: "已撤回" },
      },
    ],
  };
  let offline = true;
  vi.mocked(invoke).mockImplementation(async command => {
    if (command === "plugin_packages") return inventory;
    if (offline) throw new Error("离线");
    return { origin: "https://example.invalid", blockedPluginIds: ["test.plugin"] };
  });
  await expect(refreshMobileCenterInstallations()).rejects.toThrow("离线");
  expect((await readMobilePlugins()).packages[0]).toMatchObject({
    statusStale: true,
    pendingVersion: "2.0.0",
    revoked: { reason: "已撤回" },
  });
  offline = false;
  await refreshMobileCenterInstallations();
  expect((await readMobilePlugins()).packages[0].statusStale).toBe(false);
});
it("数据接口只发原生命令，解析时不接受前端伪造宿主或任意来源", async () => {
  vi.mocked(invoke).mockResolvedValue({ items: [] });
  const client = createMobilePluginCenterClient();
  await client.queryCatalog({ platform: "android", host: centerHost });
  expect(invoke).toHaveBeenLastCalledWith(
    "plugin_center_request",
    expect.objectContaining({ request: expect.objectContaining({ kind: "catalog" }) })
  );
  await client.resolve("test.plugin", {
    host: { ...centerHost, appVersion: "99.0.0" },
    releaseId: "release-1",
  });
  expect(invoke).toHaveBeenLastCalledWith("plugin_center_request", {
    request: { kind: "resolve", pluginId: "test.plugin", releaseId: "release-1" },
  });
});
it("原生错误保留状态与原因，取消读取不把迟到响应交给 UI", async () => {
  vi.mocked(invoke).mockRejectedValueOnce({
    status: 404,
    code: "NOT_FOUND",
    message: "版本不存在",
  });
  await expect(createMobilePluginCenterClient().getRelease("missing")).rejects.toEqual(
    new MobileCenterError(404, "NOT_FOUND", "版本不存在")
  );
  const controller = new AbortController();
  vi.mocked(invoke).mockImplementationOnce(async () => {
    controller.abort();
    return { items: [] };
  });
  await expect(createMobilePluginCenterClient().statuses([], controller.signal)).rejects.toThrow();
});
it("安装校验审核清单与摘要后才走中心提交，不走开发提交", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const [artifact] = await portableFixtures();
  const config = {
    origin: "https://example.invalid",
    host: {
      ...centerHost,
      platform: "ios",
      appVersion: "0.2.0",
      capabilities: ["commands.v1", "pages.v1", "navigation.v1", "storage.v1"],
    },
    installationEnabled: true,
  };
  const staged = {
    artifact,
    sha256: "a".repeat(64),
    release: {
      releaseId: "release-1",
      pluginId: artifact.manifest.id,
      sha256: "a".repeat(64),
      content: { manifest: artifact.manifest },
    },
  };
  vi.mocked(invoke).mockImplementation(async command =>
    command === "plugin_center_config"
      ? config
      : command === "plugin_center_stage"
        ? staged
        : undefined
  );
  await installMobileCenterRelease(artifact.manifest.id, "release-1");
  expect(vi.mocked(invoke).mock.calls.map(call => call[0])).toEqual([
    "plugin_center_config",
    "plugin_center_stage",
    "plugin_center_commit",
  ]);
  vi.mocked(invoke).mockClear();
  staged.release.content.manifest = { ...artifact.manifest, name: "换了清单" };
  await expect(installMobileCenterRelease(artifact.manifest.id, "release-1")).rejects.toThrow(
    "清单"
  );
  expect(vi.mocked(invoke).mock.calls.map(call => call[0])).toEqual([
    "plugin_center_config",
    "plugin_center_stage",
    "plugin_cancel",
  ]);
});
it("生产门禁和安装中取消均不会发起提交", async () => {
  vi.mocked(invoke).mockResolvedValueOnce({
    origin: "https://example.invalid",
    host: centerHost,
    installationEnabled: false,
  });
  await expect(installMobileCenterRelease("test.plugin", "release-1")).rejects.toThrow("未开放");
  expect(invoke).toHaveBeenCalledTimes(1);
  vi.mocked(invoke).mockReset();
  const controller = new AbortController();
  vi.mocked(invoke).mockImplementation(async command => {
    if (command === "plugin_center_config")
      return { origin: "https://example.invalid", host: centerHost, installationEnabled: true };
    if (command === "plugin_center_stage") {
      controller.abort();
      return {};
    }
  });
  await expect(
    installMobileCenterRelease("test.plugin", "release-1", controller.signal)
  ).rejects.toThrow();
  expect(vi.mocked(invoke).mock.calls.map(call => call[0])).toEqual([
    "plugin_center_config",
    "plugin_center_stage",
    "plugin_cancel",
  ]);
});
