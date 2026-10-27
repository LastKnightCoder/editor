import { expect, it } from "vitest";
import { ContentPluginRegistry, createPluginMarkdownProcessor } from "../content";
import { sharedPluginModules } from "../shared-modules";
import { validatePortablePluginManifest } from "../portable";

const artifact = {
  manifest: validatePortablePluginManifest({
    id: "external.example",
    name: "外部插件",
    version: "1.0.0",
    apiVersion: 1,
    formatVersion: 3,
    platform: "portable" as const,
    format: "cjs",

    main: "main.js",
    integrity: { "main.js": "a".repeat(64) },

    profile: "web-v1" as const,
    targets: { desktop: { minAppVersion: "0.0.0" } },
  }),
  code: `const sdk=require('@tau/plugins'); const language='external-example';
  module.exports.default=sdk.definePlugin({id:'external.example',name:'外部插件',version:'1.0.0',
    editorExtensions:[sdk.defineEditorExtension({id:'external.example',elements:[sdk.defineEditorElement({type:'external.example',kind:'block',isVoid:true,render:()=>null})]})],
    editorCodecs:[{type:'external.example',fence:{language},serializer:{isBlock:true,toMarkdown:node=>'~~~'+language+'\\n'+node.content+'\\n~~~'}}],
    create(){throw new Error('无界面任务不得调用生命周期')}
  });`,
};

it("任意插件单入口在无 DOM 环境提供带闭包的 codec，不启动插件业务", () => {
  expect(typeof document).toBe("undefined");
  const registry = new ContentPluginRegistry();
  const md = createPluginMarkdownProcessor({ codecs: [] }, registry);
  registry.load([artifact], sharedPluginModules);
  const value = md.importFromMarkdown("~~~external-example\n第三方内容\n~~~");
  expect(value[0]).toMatchObject({ type: "external.example", content: "第三方内容" });
  expect(md.getMarkdown(value).trim()).toBe("~~~external-example\n第三方内容\n~~~");
  expect(() => registry.load([artifact, artifact], sharedPluginModules)).toThrow("重复");
  expect(registry.list()).toHaveLength(1);
});

it("注册表相互隔离，已创建的转换器随快照更新且外部不能改写快照数组", () => {
  const registry = new ContentPluginRegistry();
  const other = new ContentPluginRegistry();
  const md = createPluginMarkdownProcessor({ codecs: [] }, registry);
  registry.load([artifact], sharedPluginModules);
  const value = md.importFromMarkdown("~~~external-example\n正文\n~~~");
  const previous = registry.list();
  expect(other.list()).toEqual([]);
  expect(Reflect.set(registry.codecs, 0, {})).toBe(false);
  expect(Reflect.set(previous, 0, {})).toBe(false);
  registry.install([
    {
      ...previous[0],
      editorCodecs: [
        { type: "external.example", serializer: { isBlock: true, toMarkdown: () => "新的转换器" } },
      ],
    },
  ]);
  expect(md.getMarkdown(value).trim()).toBe("新的转换器");
  expect(registry.list()).not.toBe(previous);
  registry.install([]);
  expect(md.getMarkdown(value).trim()).not.toBe("新的转换器");
});

it("增量转换跟随插件快照换代，未声明插件的外部状态不会被缓存", () => {
  const registry = new ContentPluginRegistry();
  const md = createPluginMarkdownProcessor({ codecs: [] }, registry);
  const serialize = md.createIncrementalSerializer({ codecs: [], textCodecs: [] });
  registry.load([artifact], sharedPluginModules);
  const value = md.importFromMarkdown("~~~external-example\n正文\n~~~");
  const freeze = (item: unknown) => {
    if (!item || typeof item !== "object") return;
    Object.values(item).forEach(freeze);
    Object.freeze(item);
  };
  freeze(value);
  expect(serialize(value)).toBe(md.getMarkdown(structuredClone(value)));
  const [definition] = registry.list();
  let state = "甲";
  registry.install([
    {
      ...definition,
      editorCodecs: [
        { type: "external.example", serializer: { isBlock: true, toMarkdown: () => state } },
      ],
    },
  ]);
  expect(serialize(value)).toBe("甲\n");
  state = "乙";
  expect(serialize(value)).toBe("乙\n");
  registry.install([]);
  expect(serialize(value)).toBe(md.getMarkdown(structuredClone(value)));
});

it("插件统计声明与快照同步，缺少插件不猜测私有源码", () => {
  const updates: unknown[] = [];
  const registry = new ContentPluginRegistry(rules => updates.push(rules));
  registry.load([artifact], sharedPluginModules);
  const definition = registry.list()[0];
  registry.install([
    { ...definition, editorMetrics: [{ type: "external.example", textFields: ["content"] }] },
  ]);
  expect(registry.metrics).toEqual([{ type: "external.example", textFields: ["content"] }]);
  expect(Object.isFrozen(registry.metrics)).toBe(true);
  expect(() =>
    registry.install([{ ...definition, editorMetrics: [{ type: "paragraph", textFields: [] }] }])
  ).toThrow("本插件");
  expect(registry.metrics).toHaveLength(1);
  registry.install([]);
  expect(registry.metrics).toEqual([]);
  expect(updates.at(-1)).toEqual([]);
});
