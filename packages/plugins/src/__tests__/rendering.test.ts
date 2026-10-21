import { expect, it, vi } from "vitest";
import { definePlugin } from "../index";
import { validatePluginManifest } from "../package";
import {
  evaluatePluginPackage,
  getPluginNodeTypes,
  assertRenderTypes,
  assertUniqueEditorCodecs,
} from "../rendering";

const manifest = {
  formatVersion: 1,
  apiVersion: 1,
  id: "test.editor",
  name: "测试",
  version: "1.0.0",
  platform: "desktop",
  format: "cjs",
  editor: true,
  main: "main.js",
  integrity: { "main.js": "a".repeat(64) },
};
const code = `module.exports.default = require('@tau/plugins').definePlugin({id:'test.editor',name:'测试',version:'1.0.0',editorExtensions:[{id:'test.block',apiVersion:1,elements:[{type:'test.block',kind:'block',render:()=>null}]}]});`;

it("静态贡献只定义一次，读取定义不执行 activate，纯编辑器插件可省略 create", () => {
  const factory = vi.fn(definePlugin);
  const definition = evaluatePluginPackage(
    { manifest: validatePluginManifest(manifest), code },
    { "@tau/plugins": { definePlugin: factory } }
  );
  expect(getPluginNodeTypes(definition)).toEqual(["test.block"]);
  expect(typeof definition.create().activate).toBe("function");
  expect(factory).toHaveBeenCalledOnce();
  assertRenderTypes(definition, ["test.block"]);
  expect(() => assertRenderTypes(definition, ["other"])).toThrow("归属");
});

it("编辑器声明缺失、节点重复与不可用共享模块明确失败", () => {
  expect(() =>
    assertUniqueEditorCodecs([
      { type: "a", directives: { same: () => null } },
      { type: "b", directives: { same: () => null } },
    ])
  ).toThrow("directive 重复");
  expect(() =>
    evaluatePluginPackage(
      { manifest: validatePluginManifest({ ...manifest, editor: undefined }), code },
      { "@tau/plugins": { definePlugin } }
    )
  ).toThrow("声明一致");
  expect(() =>
    evaluatePluginPackage(
      { manifest: validatePluginManifest(manifest), code: "require('node:fs')" },
      {}
    )
  ).toThrow("未提供");
  expect(() => validatePluginManifest({ ...manifest, editor: false })).toThrow("editor");
  expect(() =>
    getPluginNodeTypes(
      definePlugin({
        id: "test",
        name: "test",
        version: "1",
        editorExtensions: [
          {
            id: "x",
            apiVersion: 1,
            elements: [
              { type: "a", kind: "block", render: () => null },
              { type: "a", kind: "block", render: () => null },
            ],
          },
        ],
      })
    )
  ).toThrow("重复");
});

it("已发布插件的编辑器扩展带未开放字段时加载失败", () => {
  const withInputRules = code.replace(
    "apiVersion:1,",
    "apiVersion:1,inputRules:[{id:'test.bold',delimiter:'**',marks:{bold:true}}],"
  );
  expect(() =>
    evaluatePluginPackage(
      { manifest: validatePluginManifest(manifest), code: withInputRules },
      { "@tau/plugins": { definePlugin } }
    )
  ).toThrow("未开放的字段：inputRules");
});
