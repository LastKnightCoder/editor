import { afterEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { installMobilePlugin, verifyMobilePlugin, type MobilePluginArtifact } from "../plugins";
import { installMobileCenterRelease } from "../pluginCenter";
import { centerHost } from "../../../../../tests/fixtures/plugins/center";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
afterEach(() => vi.resetAllMocks());
const artifact = (): MobilePluginArtifact => ({
  kind: "skills",
  manifest: {
    id: "example.summary",
    name: "整理技能",
    version: "1.0.0",
    formatVersion: 1,
    apiVersion: 1,
    platform: "portable",
    targets: { ios: { minAppVersion: "0.2.13" } },
    skills: ["summary"],
    integrity: {
      "skills/summary/SKILL.md": "a".repeat(64),
      "skills/summary/scripts/retained.js": "b".repeat(64),
    },
  },
});
const environment = {
  platform: "ios" as const,
  input: { coarsePointer: true, finePointer: false },
};

it("独立技能按格式1共享协议安装，无代码入口且保留脚本摘要", async () => {
  const value = artifact();
  expect(await verifyMobilePlugin(value, environment, "0.2.13")).toEqual(value);
  const source = {
    id: value.manifest.id,
    version: "1.0.0",
    url: "https://example.invalid/skill.zip",
    sha256: "c".repeat(64),
    size: 100,
  };
  vi.mocked(invoke).mockResolvedValueOnce({ artifact: value, sha256: source.sha256 });
  await installMobilePlugin(source, environment, "0.2.13");
  expect(invoke).toHaveBeenLastCalledWith("plugin_commit", {
    id: source.id,
    sha256: source.sha256,
  });
});

it("独立技能拒绝旧desktop包、未声明目标、低版本及伪装代码入口", async () => {
  const value = artifact();
  await expect(
    verifyMobilePlugin(value, { ...environment, platform: "android" }, "0.2.13")
  ).rejects.toThrow();
  await expect(verifyMobilePlugin(value, environment, "0.2.12")).rejects.toThrow();
  for (const patch of [
    { platform: "desktop", targets: undefined },
    { main: "main.js" },
    { format: "cjs" },
    { profile: "web-v1" },
  ]) {
    await expect(
      verifyMobilePlugin(
        { ...value, manifest: { ...value.manifest, ...patch } } as MobilePluginArtifact,
        environment,
        "0.2.13"
      )
    ).rejects.toThrow();
  }
  await expect(
    verifyMobilePlugin(
      { ...value, code: "throw new Error('不得执行')" } as MobilePluginArtifact,
      environment,
      "0.2.13"
    )
  ).rejects.toThrow("代码");
});

it("中心独立技能使用共享canonical清单，审核清单被篡改则取消暂存", async () => {
  const value = artifact();
  const staged = {
    artifact: value,
    sha256: "c".repeat(64),
    release: {
      releaseId: "skill-release",
      pluginId: value.manifest.id,
      sha256: "c".repeat(64),
      content: { manifest: value.manifest },
    },
  };
  vi.mocked(invoke).mockImplementation(async command =>
    command === "plugin_center_config"
      ? {
          origin: "https://example.invalid",
          host: { ...centerHost, platform: "ios", appVersion: "0.2.13" },
          installationEnabled: true,
        }
      : command === "plugin_center_stage"
        ? staged
        : undefined
  );
  await installMobileCenterRelease(value.manifest.id, "skill-release");
  expect(invoke).toHaveBeenLastCalledWith("plugin_center_commit", {
    pluginId: value.manifest.id,
    releaseId: "skill-release",
    sha256: staged.sha256,
  });
  vi.mocked(invoke).mockClear();
  staged.release.content.manifest = { ...value.manifest, name: "篡改清单" };
  await expect(installMobileCenterRelease(value.manifest.id, "skill-release")).rejects.toThrow(
    "清单"
  );
  expect(vi.mocked(invoke).mock.calls.map(call => call[0])).toEqual([
    "plugin_center_config",
    "plugin_center_stage",
    "plugin_cancel",
  ]);
});
