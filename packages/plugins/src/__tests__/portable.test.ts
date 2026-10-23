import { expect, it } from "vitest";
import { definePlugin } from "../index";
import { validatePluginManifest } from "../package";
import { validateDistributionManifest } from "../template";
import { evaluatePortablePluginPackage, evaluatePluginPackage } from "../rendering";
import {
  validatePortablePluginManifest,
  buildPortablePluginManifest,
  readPortablePluginManifest,
  validatePortableDistributionManifest,
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
      { minAppVersion: "1.0.0", required: ["pages"], optional: ["settings"] },
    ])
  ),
});

it("客户端保留未来可选能力，作者和上传入口仍拒绝未知名称", () => {
  const input = raw();
  input.targets.ios.optional.push("futureFeature");
  input.targets.desktop.required.push("futureRequired");
  const manifest = readPortablePluginManifest(input);
  expect(manifest.targets.ios?.optional).toContain("futureFeature");
  expect(readPortablePluginManifest(manifest)).toEqual(manifest);
  expect(assertPortablePluginCompatibility(manifest, host("ios"))).toBe(manifest.targets.ios);
  expect(() => assertPortablePluginCompatibility(manifest, host("desktop"))).toThrow(
    "futureRequired"
  );
  expect(() => validatePortablePluginManifest(input)).toThrow("未知能力");
  expect(() => validatePortableDistributionManifest(input)).toThrow("未知能力");
  const valid = `module.exports.default = require('@tau/plugins').definePlugin({id:'test.portable',name:'跨端',version:'1.0.0'});`;
  expect(
    evaluatePortablePluginPackage(
      { manifest, code: valid },
      { "@tau/plugins": { definePlugin } },
      host("ios")
    ).id
  ).toBe("test.portable");
  expect(() =>
    evaluatePortablePluginPackage(
      { manifest, code: "throw Error('不应执行')" },
      {},
      host("desktop")
    )
  ).toThrow("宿主缺少必需能力");
});

it.each(["future.feature", " bad", "Future", "a".repeat(129), 1])(
  "前向读取仍拒绝非法能力名 %s",
  name => {
    const input = raw();
    const target = { ...input.targets.ios, optional: [name] };
    expect(() => readPortablePluginManifest({ ...input, targets: { ios: target } })).toThrow(
      "能力列表"
    );
  }
);

it("前向读取仍严格检查重复、交集、数量、结构、profile 与节点等级", () => {
  const input = raw();
  for (const optional of [
    Array(1),
    ["futureFeature", "futureFeature"],
    ["pages"],
    Array.from({ length: 129 }, (_, i) => `future${i}`),
  ])
    expect(() =>
      readPortablePluginManifest({ ...input, targets: { ios: { ...input.targets.ios, optional } } })
    ).toThrow();
  for (const patch of [
    { profile: "web-v2" },
    { formatVersion: 4 },
    { unknown: true },
    { permissions: ["future:read"] },
  ])
    expect(() => readPortablePluginManifest({ ...input, ...patch })).toThrow();
  expect(() =>
    readPortablePluginManifest({
      ...input,
      editor: true,
      targets: { ios: { ...input.targets.ios, elements: { block: "future" } } },
    })
  ).toThrow("等级");
});

it("模板与上传共用版本和移动权限门禁，移动运行前独立拒绝未支持权限", () => {
  for (const version of ["1.0.0-beta.1", "1.0.0+build"])
    expect(() => validatePortableDistributionManifest({ ...raw(), version })).toThrow();
  const manifest = validatePortablePluginManifest({ ...raw(), permissions: ["cards:read"] });
  expect(() => validatePortableDistributionManifest(manifest)).toThrow("业务数据授权");
  expect(() => assertPortablePluginCompatibility(manifest, host("ios"))).toThrow("业务数据授权");
  expect(() => assertPortablePluginCompatibility(manifest, host("android"))).toThrow(
    "业务数据授权"
  );
  expect(() =>
    validatePortableDistributionManifest({
      ...manifest,
      targets: { desktop: manifest.targets.desktop },
    })
  ).not.toThrow();
  expect(() => assertPortablePluginCompatibility(manifest, host("desktop"))).not.toThrow();
});
const host = (platform: "desktop" | "android" | "ios"): PortablePluginHost => ({
  appVersion: "1.0.0",
  profiles: ["web-v1"],
  capabilities: ["pages"],
  environment: {
    platform,
    input: { coarsePointer: true, finePointer: false },
  },
});

it("跨端纯文档 Skill 从包结构读取并校验摘要，不要求重复声明能力", () => {
  const input = {
    ...raw(),
    skills: ["authoring"],
    integrity: { ...raw().integrity, "skills/authoring/SKILL.md": "b".repeat(64) },
  };
  const manifest = validatePortablePluginManifest(input);
  expect(manifest.skills).toEqual(["authoring"]);
  expect(manifest.integrity["skills/authoring/SKILL.md"]).toBe("b".repeat(64));
  expect(() => assertPortablePluginCompatibility(manifest, host("android"))).not.toThrow();
  for (const file of [
    "skills/authoring/scripts/read.md",
    "skills/authoring/run.js",
    "skills/unknown/SKILL.md",
    "skills/authoring/../escape.md",
  ])
    expect(() =>
      validatePortablePluginManifest({
        ...input,
        integrity: { ...input.integrity, [file]: "c".repeat(64) },
      })
    ).toThrow();
});

it("作者只填写功能名，构建器推导编辑器与 Skill 要求", () => {
  const source = {
    id: "test.portable",
    name: "跨端",
    version: "1.0.0",
    description: "跨端编辑器",
    editor: { elements: { "test.node": "edit" } },
    requires: ["sourceEditor", "media"],
    optional: ["runtimeStyles"],
    targets: {
      android: { minAppVersion: "0.2.3" },
      ios: {
        minAppVersion: "0.2.3",
        requires: [],
        optional: [],
        editor: { elements: { "test.node": "render" } },
      },
    },
  };
  const output = {
    main: "main.js",
    skills: ["guide"],
    integrity: { ...raw().integrity, "skills/guide/SKILL.md": "b".repeat(64) },
  };
  const manifest = buildPortablePluginManifest(source, output);
  expect(() =>
    buildPortablePluginManifest(source, { ...output, id: "other.plugin" } as typeof output)
  ).toThrow("构建文件信息");
  expect(manifest.description).toBe("跨端编辑器");
  expect(manifest.targets.android?.required).toEqual(
    expect.arrayContaining([
      "pages",
      "settings",
      "dialogs",
      "sourceEditor",
      "media",
      "editor",
      "editorCodecs",
    ])
  );
  expect(manifest.targets.android?.optional).toEqual(["runtimeStyles"]);
  expect(manifest.targets.ios?.required).not.toContain("sourceEditor");
  expect(manifest.targets.ios?.optional).toEqual([]);
  expect(manifest.targets.ios?.elements).toEqual({ "test.node": "render" });
  expect(source.requires).toEqual(["sourceEditor", "media"]);
  expect(() =>
    buildPortablePluginManifest({ ...source, requires: ["sorceEditor"] }, output)
  ).toThrow("未知能力");
  expect(() => buildPortablePluginManifest({ ...source, optional: ["media"] }, output)).toThrow(
    "可选访问"
  );
  expect(() =>
    buildPortablePluginManifest({ ...source, requires: [], optional: ["runtimeStyles"] }, output)
  ).toThrow("访问器");
  expect(() =>
    buildPortablePluginManifest({ ...source, requires: ["runtimeStyles"] }, output)
  ).toThrow("重叠");
});

it("同一包显式通过三端兼容校验，旧生产入口仍拒绝新格式", () => {
  const manifest = validatePortablePluginManifest(raw());
  expect(validatePortablePluginManifest(manifest)).toEqual(manifest);
  for (const platform of ["desktop", "android", "ios"] as const)
    expect(assertPortablePluginCompatibility(manifest, host(platform)).optional).toEqual([
      "settings",
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
      capabilities: [],
    })
  ).toThrow("必需能力");
  expect(() =>
    validatePortablePluginManifest({
      ...raw(),
      targets: { ios: { minAppVersion: "1.0.0", required: ["page"] } },
    })
  ).toThrow("未知能力");
  expect(() => validatePortablePluginManifest({ ...raw(), backend: {} })).toThrow("未支持字段");
  expect(() => validatePortablePluginManifest({ ...raw(), targets: { linux: {} } })).toThrow(
    "未知平台"
  );
  expect(() =>
    validatePortablePluginManifest({
      ...raw(),
      targets: { ios: { minAppVersion: "1.0.0", required: ["pages"], optional: ["pages"] } },
    })
  ).toThrow("重叠");
});

it("显示/编辑支持按节点与平台声明，未声明不授予，定义必须完全对账", () => {
  const targets = Object.fromEntries(
    ["desktop", "android", "ios"].map(platform => [
      platform,
      {
        minAppVersion: "1.0.0",
        required: ["editor"],
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
    capabilities: ["editor" as const],
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
