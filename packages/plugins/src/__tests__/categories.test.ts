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
  const result = validatePluginManifest(
    { ...manifest, categories: ["editor", "ai", "editor"], keywords: [" LaTeX ", "绘图", "LaTeX"] },
    { strict: true }
  );
  expect(result.categories).toEqual(["editor", "ai"]);
  expect(result.keywords).toEqual(["LaTeX", "绘图"]);
  const empty = validatePluginManifest({ ...manifest, categories: [], keywords: [] });
  expect("categories" in empty || "keywords" in empty).toBe(false);
});

it("严格模式拒绝未知分类与不合规关键词", () => {
  const strict = (extra: Record<string, unknown>) => () =>
    validatePluginManifest({ ...manifest, ...extra }, { strict: true });
  expect(strict({ categories: ["reading"] })).toThrow("未知插件分类");
  expect(strict({ categories: "editor" })).toThrow("必须是数组");
  expect(strict({ keywords: [""] })).toThrow("1 至 20 字");
  expect(strict({ keywords: ["a".repeat(21)] })).toThrow("1 至 20 字");
  expect(strict({ keywords: ["a", "b", "c", "d", "e", "f"] })).toThrow("最多 5 个");
});

it("宽松模式静默丢弃，老客户端不因词表扩充拒收插件", () => {
  const result = validatePluginManifest({
    ...manifest,
    categories: ["future-kind", "sync", 1],
    keywords: ["a", "", "b", "c", "d", "e", "f", 2],
  });
  expect(result.categories).toEqual(["sync"]);
  expect(result.keywords).toEqual(["a", "b", "c", "d", "e"]);
  expect(validatePluginManifest({ ...manifest, categories: "sync" }).categories).toBeUndefined();
});

it("分类 ID 唯一且均有显示名", () => {
  const ids = PLUGIN_CATEGORIES.map(item => item.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(PLUGIN_CATEGORIES.every(item => item.label.trim())).toBe(true);
});
