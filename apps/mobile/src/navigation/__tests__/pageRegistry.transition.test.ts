import { describe, expect, it } from "vitest";
import { getPageDefinition } from "../pageRegistry";

describe("navigation/pageRegistry transition", () => {
  it("main.home 应配置为无动画", () => {
    expect(getPageDefinition("main.home").transition).toEqual({
      preset: "none",
      enterMs: 0,
      exitMs: 0,
    });
  });

  it("screen.search 应配置为底部上滑", () => {
    expect(getPageDefinition("screen.search").transition).toEqual({
      preset: "sheetUp",
      enterMs: 300,
      exitMs: 250,
    });
  });

  it("其余 screen 应配置为右侧进出", () => {
    expect(getPageDefinition("screen.settings").transition).toEqual({
      preset: "slideRight",
      enterMs: 300,
      exitMs: 250,
    });
    expect(getPageDefinition("screen.about").transition).toEqual({
      preset: "slideRight",
      enterMs: 300,
      exitMs: 250,
    });
    expect(getPageDefinition("screen.todo").transition).toEqual({
      preset: "slideRight",
      enterMs: 300,
      exitMs: 250,
    });
    expect(getPageDefinition("screen.todoDetail").transition).toEqual({
      preset: "slideRight",
      enterMs: 300,
      exitMs: 250,
    });
    expect(getPageDefinition("screen.contentDetail").transition).toEqual({
      preset: "slideRight",
      enterMs: 300,
      exitMs: 250,
    });
  });
});
