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
  readPortablePluginManifest,
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
  expect(readPortablePluginManifest(manifest)).toEqual(manifest);
  for (const platform of ["desktop", "android", "ios"] as const) {
    expect(manifest.targets[platform]).toEqual({ minAppVersion: "1.0.0" });
    const fetch = vi.fn().mockResolvedValue(new Response("ok"));
    const definition = evaluatePortablePluginPackage({ manifest, code }, modules, host(platform));
    await definition.create().activate({ fetch } as never);
    expect(fetch).toHaveBeenCalledWith("/fixture");
  }
  expect(() => validatePluginManifest(manifest)).toThrow("不兼容");
});

it.each(["requires", "optional", "editor", "whiteboard", "required", "capabilities"])(
  "作者和发行入口拒绝重复声明 %s",
  field => {
    expect(() => buildPortablePluginManifest({ ...source(), [field]: [] }, output)).toThrow(
      "未知字段"
    );
    expect(() => readPortablePluginManifest({ ...raw(), [field]: [] })).toThrow("未支持字段");
    expect(() =>
      buildPortablePluginManifest(
        { ...source(), targets: { desktop: { minAppVersion: "1.0.0", [field]: [] } } },
        output
      )
    ).toThrow("未知字段");
  }
);

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
  const manifest = readPortablePluginManifest({ ...raw(), permissions: ["cards:read"] });
  expect(() => assertPortablePluginCompatibility(manifest, host("ios"))).toThrow("业务数据授权");
  expect(() => validatePortableDistributionManifest(manifest)).toThrow("业务数据授权");
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
  expect(() => readPortablePluginManifest({ ...raw(), permissions: ["future:read"] })).toThrow();
  for (const patch of [
    { profile: "web-v2" },
    { formatVersion: 4 },
    { targets: {} },
    { targets: { linux: { minAppVersion: "1.0.0" } } },
    { targets: { ios: { minAppVersion: "bad" } } },
    { backend: {} },
  ])
    expect(() => readPortablePluginManifest({ ...raw(), ...patch })).toThrow();
});

it("Skill 和文件摘要由实际包结构生成，构建输入不可覆盖身份", () => {
  const manifest = buildPortablePluginManifest(source(), {
    ...output,
    skills: ["guide"],
    integrity: { ...output.integrity, "skills/guide/SKILL.md": "b".repeat(64) },
    imports: ["@tau/plugins/whiteboard"],
  });
  expect(manifest.skills).toEqual(["guide"]);
  expect(manifest).not.toHaveProperty("imports");
  expect(manifest).not.toHaveProperty("whiteboard");
  expect(() => buildPortablePluginManifest(source(), { ...output, imports: ["node:fs"] })).toThrow(
    "模块依赖"
  );
  expect(() =>
    buildPortablePluginManifest(source(), { ...output, id: "other" } as typeof output)
  ).toThrow("构建文件信息");
  for (const file of [
    "skills/guide/scripts/read.md",
    "skills/guide/run.js",
    "skills/unknown/SKILL.md",
    "skills/guide/../escape.md",
  ])
    expect(() =>
      readPortablePluginManifest({
        ...manifest,
        integrity: { ...manifest.integrity, [file]: "c".repeat(64) },
      })
    ).toThrow();
  for (const version of ["1.0.0-beta.1", "1.0.0+build"])
    expect(() => validatePortableDistributionManifest({ ...raw(), version })).toThrow();
});
