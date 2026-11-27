import { describe, expect, it } from "vitest";
import {
  formatPluginLocales,
  parseLocalizedReadmeFilename,
  pluginSearchTerms,
  resolvePluginMetadata,
  resolvePluginReadme,
} from "../center";
import { validateUnifiedPackageManifest } from "../unified";

const HASH = "a".repeat(64);
const BASE_PLUGIN = {
  formatVersion: 4,
  platform: "portable",
  apiVersion: 1,
  kind: "plugin",
  profile: "web-v1",
  format: "cjs",
  id: "example.counter",
  name: "计数器",
  description: "记录并保存计数。",
  version: "1.0.0",
  targets: { desktop: { minAppVersion: "0.66.3" } },
  main: "main.js",
  integrity: { "main.js": HASH },
};

describe("插件目录与说明多语言契约", () => {
  it("校验并规范化 manifest.i18n 与 locales，旧包不填时保持省略", () => {
    const legacy = validateUnifiedPackageManifest(BASE_PLUGIN);
    expect(legacy).not.toHaveProperty("i18n");
    expect(legacy).not.toHaveProperty("locales");

    const localized = validateUnifiedPackageManifest({
      ...BASE_PLUGIN,
      keywords: ["计数"],
      locales: ["zh-cn", "zh-TW", "en-us", "zh-CN"],
      i18n: {
        "en-us": {
          name: "Counter",
          description: "Track and save counts.",
          keywords: ["counter", "counter", "tally"],
        },
        "zh-tw": {
          description: "記錄並儲存計數。",
        },
      },
    });
    expect(localized.locales).toEqual(["zh-CN", "zh-TW", "en-US"]);
    expect(localized.i18n).toEqual({
      "en-US": {
        name: "Counter",
        description: "Track and save counts.",
        keywords: ["counter", "tally"],
      },
      "zh-TW": {
        description: "記錄並儲存計數。",
      },
    });
  });

  it("拒绝非法语言键、重复规范化键、空条目与未知字段", () => {
    expect(() =>
      validateUnifiedPackageManifest({ ...BASE_PLUGIN, i18n: { "not_valid!": { name: "A" } } })
    ).toThrow();
    expect(() =>
      validateUnifiedPackageManifest({
        ...BASE_PLUGIN,
        i18n: { "en-us": { name: "A" }, "en-US": { name: "B" } },
      })
    ).toThrow();
    expect(() =>
      validateUnifiedPackageManifest({ ...BASE_PLUGIN, i18n: { "en-US": {} } })
    ).toThrow();
    expect(() =>
      validateUnifiedPackageManifest({
        ...BASE_PLUGIN,
        i18n: { "en-US": { title: "wrong" } },
      })
    ).toThrow();
    expect(() =>
      validateUnifiedPackageManifest({ ...BASE_PLUGIN, locales: ["123"] })
    ).toThrow();
  });

  it("按精确匹配、同语言同字形与默认回退解析元信息和 README", () => {
    const source = {
      name: "计数器",
      description: "记录并保存计数。",
      keywords: ["计数"],
      i18n: {
        "en-US": { name: "Counter", description: "Track counts.", keywords: ["counter"] },
        "zh-TW": { description: "記錄計數。" },
      },
    };
    expect(resolvePluginMetadata(source, "en-US")).toEqual({
      name: "Counter",
      description: "Track counts.",
    });
    expect(resolvePluginMetadata(source, "en-GB")).toEqual({
      name: "Counter",
      description: "Track counts.",
    });
    // 繁体地区命中 zh-TW，未覆写 name 时回退顶层 name
    expect(resolvePluginMetadata(source, "zh-HK")).toEqual({
      name: "计数器",
      description: "記錄計數。",
    });
    // 简体中文不误匹配 zh-TW，回退顶层默认文案
    expect(resolvePluginMetadata(source, "zh-CN")).toEqual({
      name: "计数器",
      description: "记录并保存计数。",
    });

    const content = {
      readme: "# 默认说明",
      readmes: { "en-US": "# English README", "zh-TW": "# 繁體說明" },
    };
    expect(resolvePluginReadme(content, "en-US")).toBe("# English README");
    expect(resolvePluginReadme(content, "zh-HK")).toBe("# 繁體說明");
    expect(resolvePluginReadme(content, "zh-CN")).toBe("# 默认说明");
    expect(resolvePluginReadme({ readme: "# 老插件" }, "en-US")).toBe("# 老插件");

    expect(pluginSearchTerms({ pluginId: "example.counter", ...source })).toEqual([
      "example.counter",
      "计数器",
      "记录并保存计数。",
      "计数",
      "Counter",
      "Track counts.",
      "counter",
      "記錄計數。",
    ]);
  });

  it("识别规范多语言 README 文件名并格式化展示语言名称", () => {
    expect(parseLocalizedReadmeFilename("README.md")).toBeNull();
    expect(parseLocalizedReadmeFilename("README.en-us.md")).toBe("en-US");
    expect(parseLocalizedReadmeFilename("README.zh-TW.md")).toBe("zh-TW");
    expect(parseLocalizedReadmeFilename("README.ja.md")).toBe("ja");
    expect(parseLocalizedReadmeFilename("README..md")).toBeNull();
    expect(parseLocalizedReadmeFilename("README.en_US.md")).toBeNull();
    expect(parseLocalizedReadmeFilename("docs/README.en-US.md")).toBeNull();

    expect(formatPluginLocales(["zh-CN", "zh-TW", "en-US"], "en-US")).toEqual([
      "Simplified Chinese",
      "Traditional Chinese",
      "English",
    ]);
    expect(formatPluginLocales(["zh-CN", "zh-TW", "en-US"], "zh-CN")).toEqual([
      "简体中文",
      "繁体中文",
      "英语",
    ]);
  });
});
