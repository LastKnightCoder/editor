import { expect, it, vi } from "vitest";
import { definePlugin } from "../index";
import { defineWhiteboardExtension } from "../whiteboard";
import { ContentPluginRegistry } from "../content";
import { validatePluginManifest, isContentPlugin } from "../package";
import { evaluatePluginPackage, validatePluginDefinition } from "../rendering";
import { sharedPluginModules } from "../shared-modules";

const metadata = { id: "sample.board", name: "白板验证", version: "1.0.0" };
const manifest = validatePluginManifest({
  ...metadata,
  apiVersion: 1,
  formatVersion: 1,
  whiteboard: true,
  platform: "desktop",
  format: "cjs",
  main: "main.js",
  integrity: { "main.js": "a".repeat(64) },
});
const create = vi.fn(() => ({}));
const extension = defineWhiteboardExtension({
  id: metadata.id,
  elements: [{ type: `${metadata.id}.box`, render: () => null }],
  create,
});

it("静态白板目录不创建 Board 或执行交互工厂，且与编辑器命名空间独立", () => {
  const registry = new ContentPluginRegistry();
  const definition = definePlugin({ ...metadata, whiteboardExtensions: [extension] });
  validatePluginDefinition(manifest, definition);
  registry.install([definition]);
  expect(registry.whiteboardExtensions).toEqual([extension]);
  expect(registry.extensions).toEqual([]);
  expect(create).not.toHaveBeenCalled();
  expect(isContentPlugin(manifest)).toBe(true);
  registry.install([]);
  expect(registry.whiteboardExtensions).toEqual([]);
});

it("白板清单缺失、贡献冒用其他插件身份与重复元素均拒绝", () => {
  const definition = definePlugin({ ...metadata, whiteboardExtensions: [extension] });
  expect(() =>
    validatePluginDefinition({ ...manifest, whiteboard: undefined }, definition)
  ).toThrow("声明一致");
  expect(() => validatePluginDefinition(manifest, definePlugin(metadata))).toThrow("声明一致");
  expect(() => validatePluginManifest({ ...manifest, whiteboard: false })).toThrow("whiteboard");
  expect(() =>
    validatePluginDefinition(manifest, {
      ...definition,
      whiteboardExtensions: [{ ...extension, id: undefined as unknown as string }],
    })
  ).toThrow("身份");
  expect(() =>
    validatePluginDefinition(manifest, {
      ...definition,
      whiteboardExtensions: [{ ...extension, id: "other.plugin" }],
    })
  ).toThrow("身份");
  expect(() =>
    validatePluginDefinition(manifest, {
      ...definition,
      whiteboardExtensions: [
        { ...extension, elements: [{ type: "foreign.box", render: () => null }] },
      ],
    })
  ).toThrow("不属于");
  expect(() =>
    validatePluginDefinition(manifest, {
      ...definition,
      whiteboardExtensions: [
        { ...extension, elements: [...extension.elements!, ...extension.elements!] },
      ],
    })
  ).toThrow("重复");
});

it("同一 CJS 在无 DOM 宿主通过正式共享白板入口求值", () => {
  const code = `const {definePlugin}=require('@tau/plugins'); const {defineElement,defineWhiteboardExtension}=require('@tau/plugins/whiteboard'); module.exports.default=definePlugin({id:'sample.board',name:'白板验证',version:'1.0.0',whiteboardExtensions:[defineWhiteboardExtension({id:'sample.board',elements:[defineElement({type:'sample.board.box',render:()=>null})],create:()=>({})})]});`;
  const result = evaluatePluginPackage({ manifest, code }, sharedPluginModules);
  expect(result.whiteboardExtensions?.[0].elements?.[0].type).toBe("sample.board.box");
});
