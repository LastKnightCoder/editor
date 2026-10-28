import { expect, it, vi } from "vitest";
import { definePlugin } from "../index";
import { validatePluginManifest } from "../package";
import {
  evaluatePortablePluginPackage,
  evaluatePublishedPluginPackage,
  getPluginNodeTypes,
} from "../rendering";
import {
  buildPortablePluginManifest,
  validatePortableDistributionManifest,
  validatePortablePluginManifest,
  assertPortablePluginCompatibility,
  type PortablePluginHost,
} from "../portable";

const source = () => ({
  id: "test.portable",
  name: "跨端",
  version: "1.0.0",
  targets: Object.fromEntries(
    ["desktop", "android", "ios"].map(platform => [platform, { minAppVersion: "1.0.0" }])
  ),
});
const output = { main: "main.js", integrity: { "main.js": "a".repeat(64) } };
const raw = () => buildPortablePluginManifest(source(), output);
const host = (platform: "desktop" | "android" | "ios"): PortablePluginHost => ({
  appVersion: "1.0.0",
  profiles: ["web-v1"],
  environment: { platform, input: { coarsePointer: true, finePointer: false } },
});
const modules = { "@tau/plugins": { definePlugin } };
const code = `module.exports.default = require('@tau/plugins').definePlugin({id:'test.portable',name:'跨端',version:'1.0.0',create:()=>({activate(context){return context.fetch('/fixture')}})});`;

it("作者与发行清单只声明平台最低版本，三端直接使用宿主上下文", async () => {
  const manifest = raw();
  expect(validatePortablePluginManifest(manifest)).toEqual(manifest);
  for (const platform of ["desktop", "android", "ios"] as const) {
    expect(manifest.targets[platform]).toEqual({ minAppVersion: "1.0.0" });
    const fetch = vi.fn().mockResolvedValue(new Response("ok"));
    const definition = evaluatePortablePluginPackage({ manifest, code }, modules, host(platform));
    await definition.create().activate({ fetch } as never);
    expect(fetch).toHaveBeenCalledWith("/fixture");
  }
  expect(() => validatePluginManifest(manifest)).toThrow("不兼容");
});

it("构建与读取只提取协议数据，多余元信息不影响实际功能", () => {
  const manifest = buildPortablePluginManifest(
    {
      ...source(),
      documentation: { owner: "example" },
      targets: { desktop: { minAppVersion: "1.0.0", note: "desktop" } },
    },
    { ...output, cache: true } as typeof output
  );
  expect(manifest.targets.desktop).toEqual({ minAppVersion: "1.0.0" });
  expect(validatePortablePluginManifest({ ...manifest, documentation: "extra" })).toEqual(manifest);
});

it("节点、codec 和白板从真实定义读取，不需要清单贡献标记", () => {
  const manifest = raw();
  const editor = `module.exports.default=require('@tau/plugins').definePlugin({id:'test.portable',name:'跨端',version:'1.0.0',editorExtensions:[{id:'test.portable',apiVersion:1,elements:[{type:'test.block',kind:'block',render:()=>null}]}],editorCodecs:[{type:'test.block'}]});`;
  for (const platform of ["desktop", "android", "ios"] as const)
    expect(
      getPluginNodeTypes(
        evaluatePortablePluginPackage({ manifest, code: editor }, modules, host(platform))
      )
    ).toEqual(["test.block"]);
  expect(
    getPluginNodeTypes(evaluatePublishedPluginPackage({ manifest, code: editor }, modules))
  ).toEqual(["test.block"]);
  const whiteboard = `module.exports.default=require('@tau/plugins').definePlugin({id:'test.portable',name:'跨端',version:'1.0.0',whiteboardExtensions:[{id:'test.portable',apiVersion:1,create:()=>({}),elements:[{type:'test.portable.figure',render:()=>null}]}]});`;
  expect(
    evaluatePortablePluginPackage({ manifest, code: whiteboard }, modules, host("desktop"))
      .whiteboardExtensions
  ).toHaveLength(1);
  expect(() =>
    evaluatePortablePluginPackage({ manifest, code: whiteboard }, modules, host("ios"))
  ).toThrow("白板扩展");
  expect(() =>
    evaluatePortablePluginPackage(
      {
        manifest,
        code: editor.replace("editorCodecs:[{type:'test.block'}]", "editorCodecs:[{type:'other'}]"),
      },
      modules,
      host("desktop")
    )
  ).toThrow("本插件");
});

it("兼容检查在代码求值前拒绝平台、低版本和运行配置", () => {
  const manifest = raw();
  for (const current of [
    { ...host("ios"), appVersion: "0.9.0" },
    { ...host("ios"), profiles: [] },
  ])
    expect(() =>
      evaluatePortablePluginPackage({ manifest, code: "throw Error('已经执行')" }, {}, current)
    ).toThrow(/版本|配置/);
  const desktop = buildPortablePluginManifest(
    { ...source(), targets: { desktop: { minAppVersion: "1.0.0" } } },
    output
  );
  expect(() =>
    evaluatePortablePluginPackage(
      { manifest: desktop, code: "throw Error('已经执行')" },
      {},
      host("ios")
    )
  ).toThrow("不支持当前平台");
  expect(() =>
    evaluatePortablePluginPackage({ manifest, code: "require('node:fs')" }, {}, host("ios"))
  ).toThrow("未提供");
});

it("用户数据权限与实际资源、节点校验继续生效", () => {
  const manifest = validatePortablePluginManifest({ ...raw(), permissions: ["whiteboards:read"] });
  expect(() => assertPortablePluginCompatibility(manifest, host("ios"))).toThrow("业务权限");
  expect(() => validatePortableDistributionManifest(manifest)).toThrow("业务权限");
  expect(() =>
    buildPortablePluginManifest(
      {
        ...source(),
        permissions: ["cards:read"],
        targets: { desktop: { minAppVersion: "1.0.0" } },
      },
      output
    )
  ).not.toThrow();
  expect(() =>
    validatePortablePluginManifest({ ...raw(), permissions: ["future:read"] })
  ).toThrow();
  for (const patch of [
    { profile: "web-v2" },
    { formatVersion: 4 },
    { targets: {} },
    { targets: { linux: { minAppVersion: "1.0.0" } } },
    { targets: { ios: { minAppVersion: "bad" } } },
  ])
    expect(() => validatePortablePluginManifest({ ...raw(), ...patch })).toThrow();
});

it("Skill 和文件摘要由实际包结构生成，构建输入不可覆盖身份", () => {
  const manifest = buildPortablePluginManifest(source(), {
    ...output,
    skills: ["guide"],
    integrity: { ...output.integrity, "skills/guide/SKILL.md": "b".repeat(64) },
  });
  expect(manifest.skills).toEqual(["guide"]);
  expect(manifest).not.toHaveProperty("imports");
  expect(manifest).not.toHaveProperty("whiteboard");
  expect(
    buildPortablePluginManifest(source(), { ...output, id: "other" } as typeof output).id
  ).toBe(source().id);
  for (const file of [
    "skills/guide/scripts/read.md",
    "skills/guide/run.js",
    "skills/unknown/SKILL.md",
    "skills/guide/../escape.md",
  ])
    expect(() =>
      validatePortablePluginManifest({
        ...manifest,
        integrity: { ...manifest.integrity, [file]: "c".repeat(64) },
      })
    ).toThrow();
  for (const version of ["1.0.0-beta.1", "1.0.0+build"])
    expect(validatePortableDistributionManifest({ ...raw(), version }).version).toBe(version);
});

it("移动业务授权放行已实现领域并要求兼容版本", () => {
  for (const platform of ["android", "ios"] as const) {
    const input = {
      ...raw(),
      permissions: [
        "cards:read",
        "articles:write",
        "projects:read",
        "projects:write",
        "projects:delete",
        "documents:read",
        "documents:write",
        "documents:delete",
        "todos:read",
        "todos:write",
        "todos:delete",
        "calendar:read",
        "calendar:write",
        "calendar:delete",
      ],
      targets: { [platform]: { minAppVersion: "0.2.13" } },
    };
    const manifest = validatePortableDistributionManifest(input);
    expect(() =>
      assertPortablePluginCompatibility(manifest, { ...host(platform), appVersion: "0.2.13" })
    ).not.toThrow();
    expect(() =>
      assertPortablePluginCompatibility(manifest, { ...host(platform), appVersion: "0.2.12" })
    ).toThrow("客户端版本低于");
    expect(() =>
      validatePortableDistributionManifest({
        ...input,
        targets: { [platform]: { minAppVersion: "0.2.12" } },
      })
    ).toThrow("最低客户端");
    expect(() =>
      validatePortableDistributionManifest({ ...input, permissions: ["ai:chat"] })
    ).toThrow();
  }
});
