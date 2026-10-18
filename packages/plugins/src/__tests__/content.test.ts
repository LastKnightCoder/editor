import { expect, it } from "vitest";
import { ContentPluginRegistry, createPluginMarkdownProcessor } from "../content";
import { sharedPluginModules } from "../shared-modules";
import { validatePluginManifest } from "../package";

const artifact = {
  manifest: validatePluginManifest({
    id: "external.example",
    name: "外部插件",
    version: "1.0.0",
    apiVersion: 1,
    formatVersion: 1,
    platform: "desktop",
    format: "cjs",
    editor: true,
    main: "main.js",
    integrity: { "main.js": "a".repeat(64) },
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
