import { expect, it } from "vitest";
import { definePlugin } from "../index";
import { validatePluginManifest } from "../package";
import { validateDistributionManifest } from "../template";
import { evaluatePortablePluginPackage, evaluatePluginPackage } from "../rendering";
import {
  validatePortablePluginManifest,
  assertPortablePluginCompatibility,
  getPortableElementSupport,
  assertPortableElementDeclarations,
  type PortablePluginHost,
} from "../portable";

const raw = () => ({
  formatVersion: 3,
  apiVersion: 1,
  id: "test.portable",
  name: "跨端",
  version: "1.0.0",
  platform: "portable",
  profile: "web-v1",
  format: "cjs",
  main: "main.js",
  integrity: { "main.js": "a".repeat(64) },
  targets: Object.fromEntries(
    ["desktop", "android", "ios"].map(platform => [
      platform,
      { minAppVersion: "1.0.0", required: ["pages.v1"], optional: ["settings.v1"] },
    ])
  ),
});
const host = (platform: "desktop" | "android" | "ios"): PortablePluginHost => ({
  appVersion: "1.0.0",
  profiles: ["web-v1"],
  environment: {
    platform,
    layout: "compact",
    input: { touch: true, finePointer: false },
    capabilities: ["pages.v1"],
  },
});

it("同一包显式通过三端兼容校验，旧生产入口仍拒绝新格式", () => {
  const manifest = validatePortablePluginManifest(raw());
  expect(validatePortablePluginManifest(manifest)).toEqual(manifest);
  for (const platform of ["desktop", "android", "ios"] as const)
    expect(assertPortablePluginCompatibility(manifest, host(platform)).optional).toEqual([
      "settings.v1",
    ]);
  expect(() => validatePluginManifest(raw())).toThrow("不兼容");
  expect(() => validateDistributionManifest(raw())).toThrow();
  const legacy = { ...raw(), formatVersion: 1, platform: "desktop" };
  expect(validatePluginManifest(legacy).platform).toBe("desktop");
});

it("版本、平台、运行配置与必需能力逐项失败，可选能力缺失允许", () => {
  const manifest = validatePortablePluginManifest(raw());
  expect(() =>
    assertPortablePluginCompatibility(manifest, { ...host("ios"), appVersion: "0.9.0" })
  ).toThrow("版本");
  expect(() =>
    assertPortablePluginCompatibility(manifest, { ...host("ios"), profiles: [] })
  ).toThrow("配置");
  expect(() =>
    assertPortablePluginCompatibility(manifest, {
      ...host("ios"),
      environment: { ...host("ios").environment, capabilities: [] },
    })
  ).toThrow("必需能力");
  expect(() =>
    validatePortablePluginManifest({
      ...raw(),
      targets: { ios: { minAppVersion: "1.0.0", required: ["page.v1"] } },
    })
  ).toThrow("未知能力");
  expect(() => validatePortablePluginManifest({ ...raw(), backend: {} })).toThrow("未支持字段");
  expect(() => validatePortablePluginManifest({ ...raw(), targets: { linux: {} } })).toThrow(
    "未知平台"
  );
  expect(() =>
    validatePortablePluginManifest({
      ...raw(),
      targets: { ios: { minAppVersion: "1.0.0", required: ["pages.v1"], optional: ["pages.v1"] } },
    })
  ).toThrow("重叠");
});

it("显示/编辑支持按节点与平台声明，未声明不授予，定义必须完全对账", () => {
  const targets = Object.fromEntries(
    ["desktop", "android", "ios"].map(platform => [
      platform,
      {
        minAppVersion: "1.0.0",
        required: ["editor.elements.v1"],
        elements: { "test.block": platform === "desktop" ? "edit" : "render" },
      },
    ])
  );
  const manifest = validatePortablePluginManifest({ ...raw(), editor: true, targets });
  expect(getPortableElementSupport(manifest, "ios", "test.block")).toBe("render");
  expect(getPortableElementSupport(manifest, "desktop", "test.block")).toBe("edit");
  expect(getPortableElementSupport(manifest, "ios", "toString")).toBe("none");
  expect(() => assertPortableElementDeclarations(manifest, ["other"])).toThrow("不一致");
  assertPortableElementDeclarations(manifest, ["test.block"]);
  const code = `module.exports.default = require('@tau/plugins').definePlugin({id:'test.portable',name:'跨端',version:'1.0.0',editorExtensions:[{id:'test.block',apiVersion:1,elements:[{type:'test.block',kind:'block',render:()=>null}]}]});`;
  const renderer = {
    ...host("ios"),
    environment: { ...host("ios").environment, capabilities: ["editor.elements.v1" as const] },
  };
  expect(
    evaluatePortablePluginPackage(
      { manifest, code },
      { "@tau/plugins": { definePlugin } },
      renderer
    ).editorExtensions
  ).toHaveLength(1);
  expect(() =>
    evaluatePortablePluginPackage(
      { manifest, code: code.replaceAll("test.block", "other.block") },
      { "@tau/plugins": { definePlugin } },
      renderer
    )
  ).toThrow("不一致");
  expect(() => validatePortablePluginManifest({ ...raw(), editor: true })).toThrow("支持等级");
});

it("兼容性在求值前拦截，旧加载器未被放宽", () => {
  const manifest = validatePortablePluginManifest(raw());
  const code = `throw new Error('已经执行代码');`;
  expect(() => evaluatePluginPackage({ manifest, code } as never, {})).toThrow("不兼容");
  expect(() =>
    evaluatePortablePluginPackage({ manifest, code }, {}, { ...host("ios"), profiles: [] })
  ).toThrow("配置");
  const valid = `module.exports.default = require('@tau/plugins').definePlugin({id:'test.portable',name:'跨端',version:'1.0.0'});`;
  for (const platform of ["desktop", "android", "ios"] as const)
    expect(
      evaluatePortablePluginPackage(
        { manifest, code: valid },
        { "@tau/plugins": { definePlugin } },
        host(platform)
      ).id
    ).toBe("test.portable");
  expect(() =>
    evaluatePortablePluginPackage(
      { manifest, code: "require('@tau/plugins/whiteboard')" },
      {},
      host("ios")
    )
  ).toThrow("未提供");
});
