import { createI18nRuntime, createLocaleStore, defineI18n } from "@tau/i18n";
import { expect, it } from "vitest";
import {
  validateDistributionManifest,
  isTemplateManifest,
  distributionFiles,
  resolveSiteFields,
  readTemplateI18nResources,
  resolveTemplateSiteFields,
  TEMPLATE_I18N_MIN_APP_VERSION,
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
it("入口必须存在于摘要清单", () => {
  expect(() =>
    validateDistributionManifest({
      ...input,
      template: { ...input.template, entries: ["missing.html"] },
    })
  ).toThrow("摘要");
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
it("模板包不能引用模板目录之外的执行文件", () => {
  expect(() =>
    validateDistributionManifest({
      ...input,
      format: "cjs",
      main: "main.js",
      integrity: { ...input.integrity, "main.js": "c".repeat(64) },
    })
  ).toThrow("路径或摘要");
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

const localizedTemplate = () => ({
  ...input,
  minAppVersion: TEMPLATE_I18N_MIN_APP_VERSION,
  template: {
    ...input.template,
    i18n: {
      fallbackLocale: "zh-CN",
      resources: {
        "zh-CN": "locales/cn.json",
        "zh-TW": "locales/tw.json",
        "en-US": "locales/en.json",
      },
    },
    siteFields: [
      {
        key: "description",
        label: { kind: "i18n", key: "name" },
        description: { kind: "i18n", key: "name" },
        type: "text",
        placeholder: { kind: "i18n", key: "hint", values: { site: "original" } },
        default: "原始默认正文",
      },
      {
        key: "layout",
        label: "User label",
        type: "select",
        options: [{ value: "raw-value", label: { kind: "i18n", key: "name" } }],
        default: "raw-value",
      },
    ],
  },
  integrity: {
    ...input.integrity,
    "site/locales/cn.json": "c".repeat(64),
    "site/locales/tw.json": "d".repeat(64),
    "site/locales/en.json": "e".repeat(64),
  },
});

it("静态声明经JSON往返保留消息参数与业务默认值，所属模板隔离且换语保持字段身份", () => {
  const raw = localizedTemplate();
  const parsed = validateDistributionManifest(JSON.parse(JSON.stringify(raw)));
  if (!isTemplateManifest(parsed) || !parsed.template.i18n) throw new Error("Expected template");
  const resources = {
    "zh-CN": { name: "甲", hint: "甲/{{site}}" },
    "zh-TW": { name: "乙", hint: "乙/{{site}}" },
    "en-US": { name: "A", hint: "A/{{site}}" },
  };
  const dictionary = readTemplateI18nResources(
    parsed.template.i18n,
    resources,
    parsed.template.siteFields
  );
  const source = createLocaleStore("zh-CN"),
    runtime = createI18nRuntime({ localeSource: source });
  const translator = runtime.get(defineI18n(dictionary));
  const other = runtime.get(
    defineI18n({
      fallbackLocale: "zh-CN",
      resources: { "zh-CN": { name: "other", hint: "other/{{site}}" } },
    })
  );
  const fields = resolveTemplateSiteFields(parsed.template.siteFields, translator.resolve);
  const otherFields = resolveTemplateSiteFields(parsed.template.siteFields, other.resolve);
  const field = fields[0],
    choice = fields[1];
  if (choice.type !== "select" || field.type !== "text") throw new Error("Expected fields");
  const options = choice.options,
    option = options[0];
  const original = resolveSiteFields(parsed.template.siteFields, undefined);
  for (const locale of ["zh-Hant-HK", "en-US"]) {
    source.setLocale(locale);
    expect(fields[0]).toBe(field);
    expect(choice.options).toBe(options);
    expect(options[0]).toBe(option);
    expect(field.label).toBe(translator.t("name"));
    expect(field.placeholder).toBe(translator.t("hint", { site: "original" }));
    expect(option.label).toBe(translator.t("name"));
    expect(otherFields[0].label).toBe("other");
    expect(resolveSiteFields(parsed.template.siteFields, undefined)).toEqual(original);
    expect(resolveSiteFields(fields, { description: "用户正文", layout: "raw-value" })).toEqual({
      description: "用户正文",
      layout: "raw-value",
    });
  }
  expect(parsed.template.siteFields).toEqual(raw.template.siteFields);
  runtime.dispose();
});

it.each(["../cn.json", "/cn.json", "locales/cn.js", "locales/missing.json"])(
  "模板词典路径保留原资产边界 %s",
  file => {
    const raw = localizedTemplate();
    raw.template.i18n.resources["zh-CN"] = file;
    expect(() => validateDistributionManifest(raw)).toThrow();
  }
);

it("拒绝无效语言、重复规范语言、未声明词典引用及回退词典缺失", () => {
  const raw = localizedTemplate();
  for (const i18n of [
    { ...raw.template.i18n, fallbackLocale: "bad_locale" },
    {
      fallbackLocale: "en-US",
      resources: { "en-US": "locales/en.json", "en-us": "locales/en.json" },
    },
    { fallbackLocale: "fr", resources: raw.template.i18n.resources },
  ])
    expect(() =>
      validateDistributionManifest({ ...raw, template: { ...raw.template, i18n } })
    ).toThrow();
  expect(() =>
    validateDistributionManifest({ ...raw, template: { ...raw.template, i18n: undefined } })
  ).toThrow();
});

it.each([undefined, "0.67.0", "0.68.0-beta.1"])(
  "模板新词典能力拒绝未达支持门槛的最低版本 %s",
  minAppVersion => {
    expect(() => validateDistributionManifest({ ...localizedTemplate(), minAppVersion })).toThrow(
      "最低客户端版本"
    );
  }
);

it("旧字符串字段的占位getter保留一次读取与原receiver快照", () => {
  let reads = 0;
  const field = {
    key: "name",
    label: "名称",
    type: "text",
    hint: "原占位",
    get placeholder() {
      expect(this).toBe(field);
      reads++;
      return reads === 1 ? this.hint : "后续读取";
    },
  };
  const parsed = withFields([field]);
  if (!isTemplateManifest(parsed)) throw new Error("Expected template");
  const value = parsed.template.siteFields?.[0];
  if (!value || value.type !== "text") throw new Error("Expected text field");
  expect(value.placeholder).toBe(field.hint);
  expect(reads).toBe(1);
});
