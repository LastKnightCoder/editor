import { afterEach, describe, expect, it } from "vitest";
import { restoreHotkeyPlatform, stubHotkeyPlatform } from "../../__tests__/hotkey-platform-stub";
import { detectHotkeyPlatform, formatHotkey } from "../hotkeyFormat";

afterEach(restoreHotkeyPlatform);

describe("formatHotkey（mac）", () => {
  it.each([
    ["mod+shift+z", "⇧⌘Z"],
    ["mod+=", "⌘+"],
    ["mod+-", "⌘−"],
    ["shift+1", "⇧1"],
    ["delete", "⌫"],
    ["backspace", "⌫"],
    ["enter", "↵"],
    ["escape", "Esc"],
    ["arrowleft", "←"],
    ["arrowup", "↑"],
    ["arrowright", "→"],
    ["arrowdown", "↓"],
    ["mod+c", "⌘C"],
    ["mod+a", "⌘A"],
    ["z", "Z"],
    ["plus", "+"],
    ["Digit1+shift", "⇧1"],
    ["Digit2+shift", "⇧2"],
    ["Digit0+shift", "⇧0"],
  ])("%s → %s", (key, expected) => {
    expect(formatHotkey(key, "mac")).toBe(expected);
  });
});

describe("formatHotkey（other）", () => {
  it.each([
    ["mod+shift+z", "Ctrl+Shift+Z"],
    ["mod+=", "Ctrl++"],
    ["mod+-", "Ctrl+−"],
    ["shift+1", "Shift+1"],
    ["delete", "Delete"],
    ["backspace", "Backspace"],
    ["enter", "Enter"],
    ["escape", "Esc"],
    ["mod+c", "Ctrl+C"],
    ["z", "Z"],
    ["Digit1+shift", "Shift+1"],
  ])("%s → %s", (key, expected) => {
    expect(formatHotkey(key, "other")).toBe(expected);
  });
});

describe("formatHotkey（别名与修饰键）", () => {
  it("主键别名与大小写按 is-hotkey 语义归一（Esc、del、Mod+Z）", () => {
    expect(formatHotkey("Esc", "mac")).toBe("Esc");
    expect(formatHotkey("del", "mac")).toBe("⌫");
    expect(formatHotkey("Mod+Z", "mac")).toBe("⌘Z");
  });

  it("修饰键顺序固定：mac ⌃⌥⇧⌘ 紧贴，other Ctrl+Alt+Shift", () => {
    expect(formatHotkey("shift+alt+mod+k", "mac")).toBe("⌥⇧⌘K");
    expect(formatHotkey("shift+alt+mod+k", "other")).toBe("Ctrl+Alt+Shift+K");
    expect(formatHotkey("alt+mod+ctrl+shift+k", "mac")).toBe("⌃⌥⇧⌘K");
    expect(formatHotkey("alt+mod+ctrl+shift+k", "other")).toBe("Ctrl+Alt+Shift+K");
  });

  it('"=" 与 "plus" 都显示 "+"（用户按的是加号键位）', () => {
    expect(formatHotkey("mod+plus", "mac")).toBe("⌘+");
    expect(formatHotkey("mod+plus", "other")).toBe("Ctrl++");
  });
});

describe("detectHotkeyPlatform", () => {
  it("navigator.platform 判定 mac", () => {
    stubHotkeyPlatform("mac");
    expect(detectHotkeyPlatform()).toBe("mac");
  });

  it("navigator.platform 判定 other", () => {
    stubHotkeyPlatform("other");
    expect(detectHotkeyPlatform()).toBe("other");
  });

  it("userAgentData.platform 优先于 navigator.platform", () => {
    stubHotkeyPlatform("other", "macOS");
    expect(detectHotkeyPlatform()).toBe("mac");
  });
});
