import { describe, expect, it } from "vitest";
import { resolveContentTheme } from "../theme";

describe("页面内划线 UI 的主题解析", () => {
  it("沿用侧栏的主题族；明暗按偏好，跟随系统时看页面所在系统", () => {
    expect(resolveContentTheme({ theme: "sakura", appearance: "dark" }, false)).toEqual({
      theme: "sakura",
      mode: "dark",
    });
    expect(resolveContentTheme({ theme: "ink", appearance: "system" }, true)).toEqual({
      theme: "ink",
      mode: "dark",
    });
    expect(resolveContentTheme({ theme: "ink", appearance: "system" }, false).mode).toBe("light");
  });

  it("还没有偏好或主题未注册时回到默认主题、跟随系统", () => {
    expect(resolveContentTheme(undefined, true)).toEqual({ theme: "paper", mode: "dark" });
    expect(resolveContentTheme({ theme: "future", appearance: "light" }, true)).toEqual({
      theme: "paper",
      mode: "light",
    });
  });
});
