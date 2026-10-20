import { describe, expect, it } from "vitest";
import { validatePluginManifest } from "../package";
import { distributionFiles, validateDistributionManifest } from "../template";

const backend = {
  entry: "backend.js",
  runtime: "node",
  apiVersion: 1,
  scope: "application",
  activation: "app-ready",
  lifetime: "persistent",
  reason: "读取本机设备",
  systemAccess: ["filesystem"],
};
const manifest = {
  formatVersion: 2,
  apiVersion: 1,
  platform: "desktop",
  format: "cjs",
  id: "example.device",
  name: "设备",
  version: "1.0.0",
  minAppVersion: "0.59.0",
  main: "main.js",
  backend,
  integrity: { "main.js": "a".repeat(64), "backend.js": "b".repeat(64) },
};

describe("后台清单", () => {
  it("格式 2 保留后台声明，分发文件包含独立后台", () => {
    const result = validatePluginManifest(manifest);
    expect(result.backend).toEqual(backend);
    expect(distributionFiles(result)).toEqual(["main.js", "backend.js"]);
    expect(Object.isFrozen(result.backend?.systemAccess)).toBe(true);
  });
  it("普通包不会从未知字段和摘要推断后台", () => {
    const result = validatePluginManifest({
      ...manifest,
      formatVersion: 1,
      backend: undefined,
      sync: "backend.js",
    });
    expect(result.backend).toBeUndefined();
    expect(distributionFiles(result)).toEqual(["main.js"]);
  });
  it.each([
    { formatVersion: 1 },
    { formatVersion: 3 },
    { backend: undefined },
    { minAppVersion: undefined },
    { integrity: { "main.js": "a".repeat(64) } },
  ])("拒绝不完整或不匹配的包 %j", override => {
    expect(() => validatePluginManifest({ ...manifest, ...override })).toThrow();
  });
  it.each([
    { entry: "main.js" },
    { entry: "../backend.js" },
    { entry: "/backend.js" },
    { entry: "nested/../backend.js" },
    { entry: "backend.node" },
    { runtime: "python" },
    { apiVersion: 2 },
    { scope: "machine" },
    { activation: "workspace-ready" },
    { lifetime: "forever" },
    { reason: " " },
    { systemAccess: ["admin"] },
    { systemAccess: ["network", "network"] },
    { extra: true },
  ])("客户端与门户都拒绝无效执行字段 %j", override => {
    for (const strict of [false, true])
      expect(() =>
        validatePluginManifest({ ...manifest, backend: { ...backend, ...override } }, { strict })
      ).toThrow();
  });
  it("工作区启动只匹配工作区作用域", () => {
    expect(
      validatePluginManifest({
        ...manifest,
        backend: { ...backend, scope: "workspace", activation: "workspace-ready" },
      }).backend?.scope
    ).toBe("workspace");
  });
  it("静态模板不能夹带后台声明", () => {
    expect(() =>
      validateDistributionManifest({
        ...manifest,
        formatVersion: 1,
        main: undefined,
        template: { protocolVersion: 1, root: "site", entries: ["index.html"] },
      })
    ).toThrow("不能同时声明");
  });
});
