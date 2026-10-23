import { webcrypto } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { mobilePluginStorage, installMobilePlugin } from "../plugins";
import { portableFixtures } from "../../../../../tests/fixtures/plugins/portable.mjs";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});
it("KV 固定发起库，保存 null 保留语义，停用后的迟到响应与写入均拒绝", async () => {
  const controller = new AbortController();
  const scope = { pluginId: "example.counter", workspaceId: "A", signal: controller.signal };
  const storage = mobilePluginStorage("A.db");
  vi.mocked(invoke).mockResolvedValueOnce("null");
  expect(await storage.get(scope, "count")).toBeNull();
  expect(invoke).toHaveBeenLastCalledWith("plugin_kv_read", {
    database: "A.db",
    pluginId: "example.counter",
    key: "count",
  });
  let complete!: (value: string) => void;
  vi.mocked(invoke).mockImplementationOnce(
    () =>
      new Promise(resolve => {
        complete = resolve;
      })
  );
  const pending = storage.get(scope, "count");
  controller.abort();
  complete("42");
  await expect(pending).rejects.toThrow();
  await expect(storage.set(scope, "count", 43)).rejects.toThrow();
  expect(invoke).toHaveBeenCalledTimes(2);
});
it("安装先校验兼容和摘要，坏包只取消暂存，不提交或执行代码", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const [artifact] = await portableFixtures();
  const source = {
    id: artifact.manifest.id,
    version: artifact.manifest.version,
    url: "http://127.0.0.1/fixture.zip",
    sha256: "a".repeat(64),
    size: 10,
  };
  vi.mocked(invoke).mockResolvedValueOnce({
    artifact: { ...artifact, code: artifact.code + "被篡改" },
    sha256: source.sha256,
  });
  const environment = {
    platform: "ios" as const,
    layout: "compact" as const,
    input: { touch: true, finePointer: false },
    capabilities: ["commands.v1", "storage.v1", "pages.v1", "navigation.v1"] as const,
  };
  await expect(installMobilePlugin(source, environment, "0.2.1")).rejects.toThrow("摘要");
  expect(vi.mocked(invoke).mock.calls.map(call => call[0])).toEqual([
    "plugin_stage",
    "plugin_cancel",
  ]);
  vi.mocked(invoke).mockReset().mockResolvedValueOnce({ artifact, sha256: source.sha256 });
  await installMobilePlugin(source, environment, "0.2.1");
  expect(invoke).toHaveBeenLastCalledWith("plugin_commit", {
    id: source.id,
    sha256: source.sha256,
  });
});

it("开发来源严格校验字段、版本、体积与 URL，不接受任意远端 HTTP", async () => {
  const { readDevelopmentPluginSource } = await import("../plugins");
  const source = {
    id: "example.counter",
    version: "1.0.0",
    url: "https://example.invalid/plugin.zip",
    size: 100,
    sha256: "a".repeat(64),
  };
  expect(readDevelopmentPluginSource(JSON.stringify(source))).toEqual(source);
  for (const patch of [
    { url: "http://remote.invalid/plugin.zip" },
    { url: "https://user:password@example.invalid/a" },
    { size: -1 },
    { version: "1" },
    { id: "../bad" },
    { extra: true },
  ])
    expect(() => readDevelopmentPluginSource(JSON.stringify({ ...source, ...patch }))).toThrow();
});

it("安装会话失效后，迟到的暂存包不得提交", async () => {
  const controller = new AbortController();
  const [artifact] = await portableFixtures();
  const source = {
    id: artifact.manifest.id,
    version: artifact.manifest.version,
    url: "https://example.invalid/a.zip",
    sha256: "a".repeat(64),
    size: 10,
  };
  vi.mocked(invoke).mockImplementationOnce(async () => {
    controller.abort();
    return { artifact, sha256: source.sha256 };
  });
  await expect(
    installMobilePlugin(
      source,
      {
        platform: "ios",
        layout: "compact",
        input: { touch: true, finePointer: false },
        capabilities: [],
      },
      "0.2.1",
      controller.signal
    )
  ).rejects.toThrow();
  expect(vi.mocked(invoke).mock.calls.map(call => call[0])).toEqual([
    "plugin_stage",
    "plugin_cancel",
  ]);
});
