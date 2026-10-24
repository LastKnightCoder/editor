import { expect, it } from "vitest";
import { PLUGIN_CATEGORIES, validatePluginManifest } from "../package";

const manifest = {
  formatVersion: 1,
  apiVersion: 1,
  id: "test.catalog",
  name: "测试",
  version: "1.0.0",
  platform: "desktop",
  format: "cjs",
  main: "main.js",
  integrity: { "main.js": "a".repeat(64) },
};

it("分类与关键词去重保序，空值不写入清单", () => {
  const result = validatePluginManifest({
    ...manifest,
    categories: ["editor", "ai", "editor"],
    keywords: [" LaTeX ", "绘图", "LaTeX"],
  });
  expect(result.categories).toEqual(["editor", "ai"]);
  expect(result.keywords).toEqual(["LaTeX", "绘图"]);
  const empty = validatePluginManifest({ ...manifest, categories: [], keywords: [] });
  expect("categories" in empty || "keywords" in empty).toBe(false);
});

it("拒绝无效分类与非文本关键词", () => {
  const strict = (extra: Record<string, unknown>) => () =>
    validatePluginManifest({ ...manifest, ...extra });
  expect(strict({ categories: ["reading"] })).toThrow("未知插件分类");
  expect(strict({ categories: "editor" })).toThrow("必须是数组");
  expect(strict({ keywords: [""] })).toThrow("非空文本");
  expect(strict({ keywords: ["a".repeat(21)] })).not.toThrow();
  expect(strict({ keywords: ["a", "b", "c", "d", "e", "f"] })).not.toThrow();
});

it("关键词不截断已提供的有效搜索信息", () => {
  const keywords = ["a", "b", "c", "d", "e", "f", "a".repeat(40)];
  expect(validatePluginManifest({ ...manifest, keywords }).keywords).toEqual(keywords);
});

it("分类 ID 唯一且均有显示名", () => {
  const ids = PLUGIN_CATEGORIES.map(item => item.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(PLUGIN_CATEGORIES.every(item => item.label.trim())).toBe(true);
});
