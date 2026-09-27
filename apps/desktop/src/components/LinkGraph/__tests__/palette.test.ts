/**
 * 调色板门禁：画布上的每个元素在「6 个主题族 × 明暗」全部 12 种组合下都要看得见。
 * 这是自研渲染最容易悄悄劣化的地方（G6 版就是靠 useThemeColors 里几个写死色值，
 * 深色下连线几乎不可见），所以用穷举断言兜住，而不是靠肉眼过一遍。
 */

import { describe, expect, it } from "vitest";
import { THEME_MODES, getThemeRegistry } from "@tau/ui/theme";
import "@tau/ui/theme/themes"; // 副作用注册全部主题族
import { contrast, hexTone } from "@/utils/oklch";
import {
  LABEL_MIN_CONTRAST,
  resolveBackdrop,
  topicColor,
  SHAPE_MIN_CONTRAST,
  createPalette,
  ensureContrast,
  flatten,
  parseColor,
  withAlpha,
} from "../core/palette";

describe("颜色解析", () => {
  it("解析 6 位与 3 位 hex", () => {
    expect(parseColor("#ff8800")).toEqual({ r: 255, g: 136, b: 0, a: 1 });
    expect(parseColor("#f80")).toEqual({ r: 255, g: 136, b: 0, a: 1 });
  });

  it("解析带透明度的 hex 与 rgba()", () => {
    expect(parseColor("#00000080").a).toBeCloseTo(0.502, 2);
    expect(parseColor("rgba(67, 57, 44, 0.05)")).toEqual({ r: 67, g: 57, b: 44, a: 0.05 });
    expect(parseColor("rgb(1, 2, 3)").a).toBe(1);
  });

  it("解析 hsl() 与 hsla()（主题的 accent 族就是这么声明的）", () => {
    expect(parseColor("hsl(0 100% 50%)")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColor("hsl(120 100% 50%)")).toEqual({ r: 0, g: 255, b: 0, a: 1 });
    expect(parseColor("hsl(240 100% 50%)")).toEqual({ r: 0, g: 0, b: 255, a: 1 });
    // 无饱和度 = 灰阶；亮度 100% = 白
    expect(parseColor("hsl(22 0% 40%)").r).toBeCloseTo(102, 0);
    expect(parseColor("hsla(22 58% 42%, 0.5)").a).toBe(0.5);
  });

  it("无法识别的值退化为中灰而不是抛错", () => {
    expect(parseColor("var(--nope)")).toEqual({ r: 128, g: 128, b: 128, a: 1 });
  });

  it("flatten 把半透明合成到底色：5% 黑叠白接近浅灰", () => {
    expect(flatten("rgba(0, 0, 0, 0.05)", "#ffffff")).toBe("#f2f2f2");
    // 已是实色时原样返回
    expect(flatten("#123456", "#ffffff")).toBe("#123456");
  });

  it("withAlpha 在已有透明度上叠乘", () => {
    expect(withAlpha("rgba(0, 0, 0, 0.5)", 0.5)).toBe("rgba(0, 0, 0, 0.250)");
  });
});

describe("ensureContrast", () => {
  it("已达标的颜色原样返回（只做实色化）", () => {
    expect(ensureContrast("#000000", "#ffffff", 4.5)).toBe("#000000");
  });

  it("浅底上压深不达标的颜色", () => {
    const fixed = ensureContrast("#f0f0f0", "#ffffff", SHAPE_MIN_CONTRAST);
    expect(contrast(hexTone(fixed), hexTone("#ffffff"))).toBeGreaterThanOrEqual(
      SHAPE_MIN_CONTRAST - 0.01
    );
  });

  it("深底上提亮不达标的颜色", () => {
    const fixed = ensureContrast("#101010", "#000000", SHAPE_MIN_CONTRAST);
    expect(contrast(hexTone(fixed), hexTone("#000000"))).toBeGreaterThanOrEqual(
      SHAPE_MIN_CONTRAST - 0.01
    );
  });
});

describe("底色解析", () => {
  it("向上找到第一个不透明背景，跳过透明的中间层", () => {
    const outer = document.createElement("div");
    outer.style.backgroundColor = "rgb(243, 238, 226)";
    const middle = document.createElement("div");
    const inner = document.createElement("div");
    outer.appendChild(middle);
    middle.appendChild(inner);
    document.body.appendChild(outer);
    expect(resolveBackdrop(inner)).toBe("rgb(243, 238, 226)");
    outer.remove();
  });

  it("一路都透明时返回空串，由调用方退回 bg-page", () => {
    const orphan = document.createElement("div");
    expect(resolveBackdrop(orphan)).toBe("");
    expect(resolveBackdrop(null)).toBe("");
  });

  it("backdrop 覆盖 bg-page：surface 卡里的图谱按卡底算对比度", () => {
    const tokens: Record<string, string> = {
      "bg-page": "#000000",
      accent: "hsl(22 58% 42%)",
      "ink-1": "#ffffff",
      "ink-2": "#dddddd",
      "ink-3": "#999999",
    };
    const onPage = createPalette(word => tokens[word] ?? "");
    const onCard = createPalette(word => tokens[word] ?? "", "#ffffff");
    expect(onPage.background).toBe("#000000");
    expect(onCard.background).toBe("#ffffff");
    // 底色翻转后，文字色必须跟着翻到另一侧才可能达标
    expect(onPage.label).not.toBe(onCard.label);
  });
});

describe("全主题 × 明暗的画布可见性", () => {
  const themes = [...getThemeRegistry().values()];

  it("注册表非空（主题副作用已加载）", () => {
    expect(themes.length).toBeGreaterThan(0);
  });

  for (const theme of themes) {
    for (const mode of THEME_MODES) {
      describe(`${theme.key} · ${mode}`, () => {
        const tokens = theme[mode].tokens as Record<string, string>;
        const palette = createPalette(word => tokens[word] ?? "");
        const background = hexTone(palette.background);

        const ratio = (color: string) =>
          contrast(hexTone(flatten(color, palette.background)), background);

        it(`节点填色对底色 ≥ ${SHAPE_MIN_CONTRAST}:1`, () => {
          expect(ratio(palette.nodeFill)).toBeGreaterThanOrEqual(SHAPE_MIN_CONTRAST - 0.01);
        });

        it(`强调与当前态节点 ≥ ${SHAPE_MIN_CONTRAST}:1`, () => {
          expect(ratio(palette.nodeFillHover)).toBeGreaterThanOrEqual(SHAPE_MIN_CONTRAST - 0.01);
          expect(ratio(palette.nodeFillCurrent)).toBeGreaterThanOrEqual(SHAPE_MIN_CONTRAST - 0.01);
        });

        it(`高亮连线 ≥ ${SHAPE_MIN_CONTRAST}:1`, () => {
          expect(ratio(palette.edgeHighlight)).toBeGreaterThanOrEqual(SHAPE_MIN_CONTRAST - 0.01);
        });

        it(`标签 ≥ ${LABEL_MIN_CONTRAST}:1`, () => {
          expect(ratio(palette.label)).toBeGreaterThanOrEqual(LABEL_MIN_CONTRAST - 0.01);
        });

        it("默认连线可见但不抢戏：对比度在 1.05 与高亮线之间", () => {
          const edge = ratio(palette.edge);
          expect(edge).toBeGreaterThan(1.05);
          expect(edge).toBeLessThan(ratio(palette.edgeHighlight));
        });

        it("10 个主题色槽全部达到图形对比度，且彼此可分", () => {
          const colors = Array.from({ length: 10 }, (_, slot) =>
            topicColor(slot, palette.background)
          );
          for (const color of colors) {
            expect(ratio(color)).toBeGreaterThanOrEqual(SHAPE_MIN_CONTRAST - 0.01);
          }
          expect(new Set(colors).size).toBe(10);
          // 色槽循环：超出 10 的回到同一套颜色，不会冒出新色相
          expect(topicColor(13, palette.background)).toBe(colors[3]);
        });

        it("字体栈非空", () => {
          expect(palette.fontFamily.length).toBeGreaterThan(0);
        });

        // 兜底灰意味着某个 token 的颜色格式没被解析器认出来（实际发生过：
        // accent 用 hsl() 声明，而解析器起初只认 hex 与 rgba，强调色整体变灰）
        it("消费到的 token 全部解析成功，没有退化成兜底灰", () => {
          for (const word of ["bg-page", "accent", "ink-1", "ink-2", "ink-3", "line-1"]) {
            const raw = tokens[word];
            expect(raw, `${theme.key}/${mode} 缺少 token ${word}`).toBeTruthy();
            expect(parseColor(raw), `${word} = ${raw} 未被解析`).not.toEqual({
              r: 128,
              g: 128,
              b: 128,
              a: 1,
            });
          }
        });
      });
    }
  }
});
