import { expect, it } from "vitest";
import {
  validateDistributionManifest,
  isTemplateManifest,
  distributionFiles,
  resolveSiteFields,
  type TemplateManifest,
} from "../template";
import { replaceTemplatePaths } from "../template-html";
const input = {
  formatVersion: 1,
  apiVersion: 1,
  platform: "desktop",
  id: "test.template",
  name: "模板",
  version: "1.0.0",
  template: { protocolVersion: 1, root: "site", entries: ["index.html"] },
  integrity: { "site/index.html": "a".repeat(64), "site/字库.woff2": "b".repeat(64) },
};
it("纯静态模板不需要代码入口，保留全部资源声明", () => {
  const value = validateDistributionManifest(input);
  expect(isTemplateManifest(value)).toBe(true);
  expect(value).not.toHaveProperty("main");
  expect(distributionFiles(value)).toHaveLength(2);
});
it.each(["../site", "/site", "site/../other", "site\\other", "site/%2e%2e"])(
  "拒绝文件系统越界 %s",
  root => {
    expect(() =>
      validateDistributionManifest({ ...input, template: { ...input.template, root } })
    ).toThrow();
  }
);
it("入口必须存在于摘要清单，混合能力不能绕过原有校验", () => {
  expect(() =>
    validateDistributionManifest({
      ...input,
      template: { ...input.template, entries: ["missing.html"] },
    })
  ).toThrow("摘要");
  expect(() => validateDistributionManifest({ ...input, editor: true })).toThrow();
});
it("占位符只替换真实 HTML 属性，保留作者原始脚本与正文", () => {
  const result = replaceTemplatePaths(
    '<meta content="__TAU_MANIFEST__"><script>const x="unchanged";</script>',
    { MANIFEST: '/notes/data/site.json?x="<', BASE: "/notes/" }
  );
  expect(result).toContain('content="/notes/data/site.json?x=&quot;&lt;"');
  expect(result).toContain('const x="unchanged"');
  expect(() =>
    replaceTemplatePaths('<script>const x="__TAU_MANIFEST__";</script>', {
      MANIFEST: "/data/site.json",
      BASE: "/",
    })
  ).toThrow("属性");
  expect(() =>
    replaceTemplatePaths('<script src="__TAU_CLIENT__x.js"></script>', {
      MANIFEST: "/data/site.json",
      BASE: "/",
    })
  ).toThrow("未知模板占位符");
});
it("模板包不能同时声明代码插件入口", () => {
  expect(() =>
    validateDistributionManifest({
      ...input,
      format: "cjs",
      main: "main.js",
      integrity: { ...input.integrity, "main.js": "c".repeat(64) },
    })
  ).toThrow("代码插件入口");
});

const withFields = (siteFields: unknown) =>
  validateDistributionManifest({ ...input, template: { ...input.template, siteFields } });
it("站点字段按声明保留，未声明时不出现该键", () => {
  expect((validateDistributionManifest(input) as TemplateManifest).template).not.toHaveProperty(
    "siteFields"
  );
  const fields = [
    { key: "description", label: "站点描述", type: "textarea", placeholder: "一句话介绍" },
    {
      key: "layout",
      label: "首页布局",
      type: "select",
      options: [
        { value: "timeline", label: "时间线" },
        { value: "grid", label: "网格" },
      ],
      default: "grid",
    },
    { key: "showStats", label: "显示统计", type: "switch", default: true },
  ];
  expect((withFields(fields) as TemplateManifest).template.siteFields).toEqual(fields);
});
it.each([
  [[{ key: "1a", label: "名", type: "text" }], "key"],
  [
    [
      { key: "a", label: "名", type: "text" },
      { key: "a", label: "名", type: "url" },
    ],
    "重复",
  ],
  [[{ key: "a", label: "名", type: "image" }], "不支持"],
  [[{ key: "a", label: " ", type: "text" }], "名称"],
  [[{ key: "a", label: "名", type: "switch", default: "true" }], "布尔"],
  [[{ key: "a", label: "名", type: "select", options: [] }], "选项"],
  [
    [
      {
        key: "a",
        label: "名",
        type: "select",
        options: [{ value: "x", label: "X" }],
        default: "y",
      },
    ],
    "默认值",
  ],
])("拒绝无效站点字段声明 %#", (fields, message) => {
  expect(() => withFields(fields)).toThrow(message);
});
it("解析站点字段只输出声明的键，非法存量值回落默认值", () => {
  const fields = (
    withFields([
      { key: "description", label: "描述", type: "text", default: "默认" },
      {
        key: "layout",
        label: "布局",
        type: "select",
        options: [
          { value: "a", label: "A" },
          { value: "b", label: "B" },
        ],
      },
      { key: "dark", label: "深色", type: "switch" },
    ]) as TemplateManifest
  ).template.siteFields;
  expect(
    resolveSiteFields(fields, { description: "你好", layout: "c", dark: "yes", extra: 1 })
  ).toEqual({ description: "你好", layout: "a", dark: false });
  expect(resolveSiteFields(fields, undefined)).toEqual({
    description: "默认",
    layout: "a",
    dark: false,
  });
  expect(resolveSiteFields(undefined, { description: "x" })).toEqual({});
});
