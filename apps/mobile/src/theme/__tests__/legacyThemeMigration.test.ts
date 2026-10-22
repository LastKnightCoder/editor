import { beforeEach, describe, expect, it } from "vitest";
import { APPEARANCE_STORAGE_KEY, THEME_STORAGE_KEY } from "@tau/themes";
import {
  LEGACY_THEME_STORAGE_KEY,
  createLegacyThemeMigrationScript,
} from "../legacyThemeMigration";

// 走首帧内联脚本本体：验证的就是 toString() 序列化后真正运行的那份代码
const runMigration = () => new Function(createLegacyThemeMigrationScript())();

describe("旧版移动端主题偏好迁移", () => {
  beforeEach(() => localStorage.clear());

  it.each([
    ["apricot", "paper", "light"],
    ["midnight", "paper", "dark"],
    ["mint", "mint", "light"],
    ["ocean", "ocean", "light"],
    ["system", "paper", "system"],
    ["nocturne", "paper", "dark"],
  ])("%s → %s · %s，并删除旧键", (legacy, theme, appearance) => {
    localStorage.setItem(LEGACY_THEME_STORAGE_KEY, legacy);
    runMigration();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(theme);
    expect(localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe(appearance);
    expect(localStorage.getItem(LEGACY_THEME_STORAGE_KEY)).toBeNull();
  });

  it("已有新格式偏好时不覆盖，只清理旧键", () => {
    localStorage.setItem(LEGACY_THEME_STORAGE_KEY, "midnight");
    localStorage.setItem(THEME_STORAGE_KEY, "ink");
    localStorage.setItem(APPEARANCE_STORAGE_KEY, "light");
    runMigration();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("ink");
    expect(localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe("light");
    expect(localStorage.getItem(LEGACY_THEME_STORAGE_KEY)).toBeNull();
  });

  it("未知旧值：只清理旧键，走默认主题", () => {
    localStorage.setItem(LEGACY_THEME_STORAGE_KEY, "unknown");
    runMigration();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_THEME_STORAGE_KEY)).toBeNull();
  });
});
