import { describe, expect, it } from "vitest";
import {
  FEATURE_PRESETS,
  disabledForPresets,
  isFeatureEnabled,
  isPresetChecked,
  togglePreset,
} from "../features";

const preset = (id: string) => {
  const found = FEATURE_PRESETS.find(item => item.id === id);
  if (!found) throw new Error(`没有组合 ${id}`);
  return found;
};

describe("功能开关", () => {
  it("父功能关掉时依附功能一起收起，重新打开后恢复原来的单独设置", () => {
    expect(isFeatureEnabled("skills", ["chat"])).toBe(false);
    expect(isFeatureEnabled("skills", ["mcp"])).toBe(true);
    expect(isFeatureEnabled("mcp", ["mcp"])).toBe(false);
  });

  it("今日不能被关掉", () => {
    expect(isFeatureEnabled("home", ["home"])).toBe(true);
  });

  it("取消一个组合不误关其他已勾组合共有的功能", () => {
    // 写作与笔记、日程与专注都包含日记；学习与写作都包含卡片库
    const all = ["diary", "cards", "articles", "schedule", "todos", "pomodoro"];
    const disabled = togglePreset(preset("writing"), false, []);
    expect(disabled).not.toContain("diary");
    expect(disabled).not.toContain("cards");
    expect(disabled).toContain("articles");
    for (const id of all.filter(id => id !== "articles"))
      expect(isFeatureEnabled(id, disabled)).toBe(true);
  });

  it("组合的勾选状态由开关推出，关掉其中一项即取消勾选", () => {
    expect(isPresetChecked(preset("planning"), [])).toBe(true);
    expect(isPresetChecked(preset("planning"), ["pomodoro"])).toBe(false);
    expect(
      isPresetChecked(preset("planning"), togglePreset(preset("planning"), true, ["pomodoro"]))
    ).toBe(true);
  });

  it("首次启动只选部分组合时其余功能关掉，一个都不选时全部打开", () => {
    const all = ["home", "diary", "cards", "schedule", "collaboration", "publish"];
    expect(disabledForPresets(all, ["planning"])).toEqual(["cards", "collaboration", "publish"]);
    expect(disabledForPresets(all, [])).toEqual([]);
  });
});
