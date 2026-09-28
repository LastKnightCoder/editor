import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_TOKEN_WORDS, cssVarName, type TokenWord } from "../tokenContract";
import { THEME_MODES, defineTheme, getThemeRegistry, listThemes } from "../defineTheme";
import "../register"; // 副作用注册全部主题

const css = readFileSync(resolve(import.meta.dirname, "../tokens.css"), "utf-8");

/** 提取指定主题族 × 明暗的 [data-theme][data-mode] 数据块（到行首 } 为止） */
function themeBlock(key: string, mode: string): string {
  const selector = `[data-theme="${key}"][data-mode="${mode}"]`;
  const start = css.indexOf(selector);
  expect(start, `tokens.css 缺少 ${selector} 数据块`).toBeGreaterThan(-1);
  const end = css.indexOf("\n}", start);
  return css.slice(start, end);
}

/**
 * 守护手工同步期（codegen 落地前）的漂移：tokens.css 数据块与 *.theme.ts
 * 的 tokens() 产物必须逐值一致，否则首帧（CSS 级联）与声明式主题（协议/对比度
 * 门禁）各说各话。
 */
describe("theme 数据块与 defineTheme 产物一致", () => {
  for (const theme of getThemeRegistry().values()) {
    for (const mode of THEME_MODES) {
      describe(`主题 ${theme.key} · ${mode}`, () => {
        const tokens = theme[mode].tokens;
        it("每个 token 词汇在数据块中都有定义且取值一致", () => {
          const block = themeBlock(theme.key, mode);
          const missing: string[] = [];
          const drifted: string[] = [];
          for (const word of ALL_TOKEN_WORDS) {
            const match = block.match(new RegExp(`${cssVarName(word)}\\s*:\\s*([^;]+);`));
            if (!match) {
              missing.push(word);
              continue;
            }
            if (match[1].trim() !== tokens[word])
              drifted.push(`${word}: css=${match[1].trim()} theme=${tokens[word]}`);
          }
          expect(missing, `数据块缺少 token：${missing.join(", ")}`).toEqual([]);
          expect(drifted, `token 取值漂移：\n${drifted.join("\n")}`).toEqual([]);
        });

        it("color-scheme 与明暗一致", () => {
          expect(themeBlock(theme.key, mode)).toContain(`color-scheme: ${mode}`);
        });
      });
    }
  }
});

describe("主题列表排序", () => {
  it("水墨（素色）始终排在最后，其余按注册顺序", () => {
    const keys = listThemes().map(t => t.key);
    expect(keys.at(-1)).toBe("ink");
    const rest = [...getThemeRegistry().keys()].filter(k => k !== "ink");
    expect(keys.slice(0, -1)).toEqual(rest);
  });

  it("晚于水墨注册的主题也排在水墨之前", () => {
    const { light } = listThemes()[0];
    const late = defineTheme({
      key: "__late__",
      name: "迟到",
      light: { palette: light.palette, tokens: () => light.tokens },
      dark: { palette: light.palette, tokens: () => light.tokens },
    });
    try {
      const keys = listThemes().map(t => t.key);
      expect(keys.indexOf(late.key)).toBeLessThan(keys.indexOf("ink"));
      expect(keys.at(-1)).toBe("ink");
    } finally {
      (getThemeRegistry() as Map<string, unknown>).delete(late.key);
    }
  });
});

// ── WCAG 对比度工具（02 规范 §2.5 硬指标的测试化，codegen 门禁前的手工守护）──

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((h % 360) + 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1
      ? [c, x, 0]
      : hp < 2
        ? [x, c, 0]
        : hp < 3
          ? [0, c, x]
          : hp < 4
            ? [0, x, c]
            : hp < 5
              ? [x, 0, c]
              : [c, 0, x];
  const m = l - c / 2;
  return [Math.round((r1 + m) * 255), Math.round((g1 + m) * 255), Math.round((b1 + m) * 255)];
}

/** 解析 token 取值：#hex / rgb(a) / hsl(a)（空格与逗号分隔都兼容） */
function parseColor(value: string): Rgba {
  const v = value.trim().toLowerCase();
  const hex = v.match(/^#([0-9a-f]{6})$/);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const fn = v.match(/^(rgba?|hsla?)\(([^)]+)\)$/);
  if (!fn) throw new Error(`无法解析颜色值：${value}`);
  const nums = fn[2]
    .split(/[,/\s]+/)
    .filter(Boolean)
    .map(p => Number(p.replace("%", "")));
  if (nums.length < 3 || nums.length > 4 || nums.some(Number.isNaN)) {
    throw new Error(`无法解析颜色值：${value}`);
  }
  const a = nums.length === 4 ? nums[3] : 1;
  if (fn[1].startsWith("hsl")) {
    const [r, g, b] = hslToRgb(nums[0], nums[1] / 100, nums[2] / 100);
    return { r, g, b, a };
  }
  return { r: nums[0], g: nums[1], b: nums[2], a };
}

function relativeLuminance({ r, g, b }: Rgba): number {
  const lin = [r, g, b].map(c => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrastRatio(fgValue: string, bgValue: string): number {
  const fg = parseColor(fgValue);
  const bg = parseColor(bgValue);
  // 前景带 alpha 时先合成到底色再算（本断言组合均为实色，合成只为通用）
  const l1 = relativeLuminance({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
  const l2 = relativeLuminance(bg);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

describe("theme 对比度达 AA（02 规范 §2.5）", () => {
  const cases: Array<{ fg: TokenWord; bg: TokenWord; min: number; why: string }> = [
    { fg: "ink-1", bg: "bg-page", min: 7, why: "正文文字 / 窗口底" },
    { fg: "ink-1", bg: "bg-surface", min: 7, why: "正文文字 / 卡片" },
    // 实底控件（浮起图标按钮等）hover 态：surface-hover 是不透明 hover 档
    { fg: "ink-1", bg: "bg-surface-hover", min: 7, why: "正文文字 / 实底控件 hover" },
    { fg: "ink-2", bg: "bg-surface-hover", min: 4.5, why: "次要文字 / 实底控件 hover" },
    { fg: "ink-2", bg: "bg-page", min: 4.5, why: "次要文字 / 窗口底" },
    { fg: "ink-2", bg: "bg-surface", min: 4.5, why: "次要文字 / 卡片" },
    { fg: "accent-text", bg: "bg-page", min: 4.5, why: "强调文字 / 窗口底" },
    { fg: "accent-text", bg: "bg-surface", min: 4.5, why: "强调文字 / 卡片" },
    { fg: "ink-inverse", bg: "accent", min: 4.5, why: "accent 实底上文字" },
    // 凹陷底上的文字：sunken 沉在 page 之下，有人把 ink-2 放上去就会静默跌破 AA。
    { fg: "ink-2", bg: "bg-sunken", min: 4.5, why: "次要文字 / 凹陷底" },
    { fg: "ink-1", bg: "bg-sunken", min: 4.5, why: "正文 / 凹陷底" },
  ];

  for (const theme of getThemeRegistry().values()) {
    for (const mode of THEME_MODES) {
      it(`主题 ${theme.key}（${theme.name}）· ${mode} 全组合达标`, () => {
        const tokens = theme[mode].tokens;
        const failures = cases
          .map(c => {
            const ratio = contrastRatio(tokens[c.fg], tokens[c.bg]);
            return ratio >= c.min
              ? null
              : `${c.why}：${c.fg} 对 ${c.bg} = ${ratio.toFixed(2)}（要求 ≥ ${c.min}）`;
          })
          .filter((s): s is string => s !== null);
        expect(failures, `对比度不达标：\n${failures.join("\n")}`).toEqual([]);
      });
    }
  }
});
