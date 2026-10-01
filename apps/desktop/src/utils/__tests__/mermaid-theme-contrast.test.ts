import { describe, expect, it } from "vitest";
import { THEME_MODES, getThemeRegistry } from "@tau/themes";
import { buildMermaidTheme, parseColor } from "@tau/editor-diagram/mermaid";

const luminance = (value: string): number => {
  const c = parseColor(value);
  if (!c) throw new Error(`无法解析颜色值：${value}`);
  const lin = [c.r, c.g, c.b].map(v => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
};

const contrast = (fg: string, bg: string): number => {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
};

/** 文字 / 底色组合：正文类要求 AA 4.5，饼图、git 分支这类图形标签按大字号 3 */
const PAIRS: Array<{ fg: string; bg: string; min: number }> = [
  { fg: "primaryTextColor", bg: "primaryColor", min: 4.5 },
  { fg: "secondaryTextColor", bg: "secondaryColor", min: 4.5 },
  { fg: "tertiaryTextColor", bg: "tertiaryColor", min: 4.5 },
  { fg: "textColor", bg: "background", min: 4.5 },
  { fg: "noteTextColor", bg: "noteBkgColor", min: 4.5 },
  { fg: "actorTextColor", bg: "actorBkg", min: 4.5 },
  { fg: "labelTextColor", bg: "labelBoxBkgColor", min: 4.5 },
  { fg: "taskTextColor", bg: "taskBkgColor", min: 4.5 },
  { fg: "taskTextColor", bg: "activeTaskBkgColor", min: 4.5 },
  { fg: "taskTextColor", bg: "doneTaskBkgColor", min: 4.5 },
  { fg: "taskTextColor", bg: "critBkgColor", min: 4.5 },
  ...Array.from({ length: 12 }, (_, i) => ({ fg: `cScaleLabel${i}`, bg: `cScale${i}`, min: 4.5 })),
  ...Array.from({ length: 12 }, (_, i) => ({
    fg: "pieSectionTextColor",
    bg: `pie${i + 1}`,
    min: 3,
  })),
  ...Array.from({ length: 8 }, (_, i) => ({ fg: `gitBranchLabel${i}`, bg: `git${i}`, min: 3 })),
];

describe("mermaid 主题对比度", () => {
  for (const theme of getThemeRegistry().values()) {
    for (const mode of THEME_MODES) {
      it(`主题 ${theme.key}（${theme.name}）· ${mode}`, () => {
        const tokens = theme[mode].tokens as Record<string, string>;
        const config = buildMermaidTheme(word => tokens[word] ?? "", mode === "dark");
        expect(config).not.toBeNull();
        const vars = (config?.themeVariables ?? {}) as Record<string, string>;
        const failures = PAIRS.map(({ fg, bg, min }) => {
          const ratio = contrast(vars[fg], vars[bg]);
          return ratio >= min ? null : `${fg} 对 ${bg} = ${ratio.toFixed(2)}（要求 ≥ ${min}）`;
        }).filter(Boolean);
        expect(failures, failures.join("\n")).toEqual([]);
      });
    }
  }
});
