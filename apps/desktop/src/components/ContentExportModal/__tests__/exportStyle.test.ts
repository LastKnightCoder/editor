import { describe, expect, it } from "vitest";
import { createExportFileName, resolveExportBackground, resolveExportLayout } from "../exportStyle";

describe("resolveExportLayout", () => {
  it("柔光按边距留背景，手机宽度按比例收窄", () => {
    expect(resolveExportLayout("glow", 600, "normal")).toEqual({ outer: 40, inner: 36 });
    expect(resolveExportLayout("glow", 375, "loose")).toEqual({ outer: 38, inner: 24 });
  });

  it("整张纸不留背景，边距转为纸内留白", () => {
    expect(resolveExportLayout("paper", 600, "normal")).toEqual({ outer: 0, inner: 44 });
    expect(resolveExportLayout("paper", 375, "normal")).toEqual({ outer: 0, inner: 24 });
  });
});

describe("resolveExportBackground", () => {
  it("只消费 --tau-* 变量，不含裸色值", () => {
    for (const mode of ["light", "dark"] as const) {
      const background = resolveExportBackground("glow", "paper", mode);
      expect(background).toContain("var(--tau-accent)");
      expect(background).toContain("var(--tau-tag-5)");
      expect(background).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    }
  });

  it("未登记晕光色的主题族回落 tag-3；整张纸直接取纸色", () => {
    expect(resolveExportBackground("glow", "custom", "light")).toContain("var(--tau-tag-3)");
    expect(resolveExportBackground("paper", "paper", "dark")).toBe("var(--tau-bg-surface)");
  });
});

describe("createExportFileName", () => {
  it("用标题命名并替换非法字符", () => {
    expect(createExportFileName('a/b:c*"d"  e.')).toBe("a_b_c__d_ e.png");
  });

  it("没有标题时按日期命名", () => {
    expect(createExportFileName("  ", new Date(2026, 9, 5))).toBe("Tau-20261005.png");
    expect(createExportFileName(undefined, new Date(2026, 0, 9))).toBe("Tau-20260109.png");
  });
});
