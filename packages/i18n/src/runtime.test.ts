import { describe, expect, it } from "vitest";
import {
  bindI18nFields,
  createI18nRuntime,
  createLocaleStore,
  defineI18n,
  resolveLocale,
} from "./index";

describe("词典配置与作用域", () => {
  it("同名 key 在不同词典和语言源中独立，消息引用往返后仍跟随语言", () => {
    const source = createLocaleStore("en-GB");
    const otherSource = createLocaleStore("zh-CN");
    const runtime = createI18nRuntime({ localeSource: source });
    const otherRuntime = createI18nRuntime({ localeSource: otherSource });
    const messages = defineI18n({
      fallbackLocale: "zh-CN",
      resources: {
        "zh-CN": { action: "甲", fallback: "缺词回退" },
        "en-US": { action: "A" },
      },
    });
    const other = defineI18n({ fallbackLocale: "en-US", resources: { "en-US": { action: "B" } } });
    const translator = runtime.get(messages);
    const reference = JSON.parse(JSON.stringify(messages.ref("action")));
    const title = bindI18nFields({ title: reference, id: "stable" }, ["title"], translator.resolve);
    expect(title.title).toBe("A");
    expect(translator.t("fallback")).toBe("缺词回退");
    expect(runtime.get(other).t("action")).toBe("B");
    expect(otherRuntime.get(messages).t("action")).toBe("甲");
    source.setLocale("zh-CN");
    expect(title.title).toBe("甲");
    expect(translator.resolve(reference)).toBe("甲");
    expect(runtime.get(other).t("action")).toBe("B");
    runtime.dispose();
    expect(() => translator.resolve(reference)).toThrow("已关闭");
    expect(otherRuntime.get(messages).t("action")).toBe("甲");
    otherRuntime.dispose();
  });

  it("词典与引用参数取不可变快照，插值参数不能覆盖翻译选项", () => {
    const resources = { "en-US": { value: "{{lng}}/{{ns}}/{{name}}" } };
    const messages = defineI18n({ fallbackLocale: "en-US", resources });
    resources["en-US"].value = "changed";
    const values = { lng: "de", ns: "foreign", name: "<text>" };
    const reference = messages.ref("value", values);
    values.name = "changed";
    const runtime = createI18nRuntime({ localeSource: createLocaleStore("en-US") });
    expect(runtime.get(messages).resolve(reference)).toBe("de/foreign/<text>");
    expect(() => messages.ref("missing" as "value")).toThrow("缺少文案");
    expect(() =>
      defineI18n({ fallbackLocale: "en-US", resources: { "zh-CN": { value: "甲" } } })
    ).toThrow("回退语言");
    runtime.dispose();
  });

  it("跨语言回退保持数量参数，只有复数形式的文案缺少 count 时拒绝解析", () => {
    const source = createLocaleStore("en-US");
    const runtime = createI18nRuntime({ localeSource: source });
    const messages = defineI18n({
      fallbackLocale: "zh-CN",
      resources: {
        "zh-CN": { items: "共 {{count}} 条" },
        "en-US": { items_one: "{{count}} item", items_other: "{{count}} items" },
      },
    });
    const translate = runtime.get(messages);
    expect(translate.t("items", { count: 1 })).toBe("1 item");
    expect(translate.t("items", { count: 2 })).toBe("2 items");
    source.setLocale("fr-FR");
    expect(translate.t("items", { count: 2 })).toBe("共 2 条");
    const pluralOnly = defineI18n({
      fallbackLocale: "en-US",
      resources: { "en-US": { items_one: "one", items_other: "many" } },
    });
    expect(() => runtime.get(pluralOnly).t("items")).toThrow("count");
    runtime.dispose();
  });

  it("匹配语言变体时保持文字体系，不把繁体词典误当简体词典", () => {
    expect(resolveLocale("en-AU", ["zh-CN", "en-US"], "zh-CN")).toBe("en-US");
    expect(resolveLocale("zh-HK", ["zh-CN", "en-US"], "en-US")).toBe("en-US");
    for (const locale of ["zh-TW", "zh-HK", "zh-MO", "zh-Hant", "zh-Hant-HK"]) {
      expect(resolveLocale(locale, ["zh-CN", "zh-TW"], "en-US")).toBe("zh-TW");
    }
    expect(resolveLocale("zh-Hans-TW", ["zh-CN", "zh-TW"], "en-US")).toBe("zh-CN");
    expect(resolveLocale("zh-SG", ["zh-CN", "zh-TW"], "en-US")).toBe("zh-CN");
  });
});
