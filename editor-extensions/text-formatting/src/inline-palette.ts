import { TEXT_GRADIENT_PRESETS, type TextGradientPresetId } from "./text-gradient.ts";

/**
 * 行内着色的统一色板：字色、高亮、下划线共用这 7 个色相，各分明暗两档。
 * 是用户挑的内容色，不随主题族变化，只随明暗切换取值。
 * 高亮与下划线在文档里存色相 id；字色存具体色值（color / darkColor mark）。
 *
 * 渲染一律引用 styles.css 里按 [data-mode] 切换的 --ed-palette-* / --ed-gradient-* 变量，
 * 组件无需感知明暗；这里的具体色值供写入字色 mark 与导出使用，两边由 inline-palette 测试守护一致。
 */
export type { HighlightColor as InlinePaletteColor } from "./types.ts";
import type { HighlightColor as InlinePaletteColor } from "./types.ts";

export interface InlinePaletteEntry {
  id: InlinePaletteColor;
  label: string;
  light: string;
  dark: string;
}

export const INLINE_PALETTE: readonly InlinePaletteEntry[] = [
  { id: "gray", label: "灰色", light: "#8f959e", dark: "#9a9a9a" },
  { id: "red", label: "红色", light: "#e33a32", dark: "#fa7873" },
  { id: "orange", label: "橙色", light: "#e57d05", dark: "#f5a54a" },
  { id: "yellow", label: "黄色", light: "#dc9b04", dark: "#fcd456" },
  { id: "green", label: "绿色", light: "#2ea121", dark: "#6dd162" },
  { id: "blue", label: "蓝色", light: "#245bdb", dark: "#70a0ff" },
  { id: "purple", label: "紫色", light: "#6425d0", dark: "#a472fc" },
];

/** 高亮 = 同色相淡底 + 底线的混色比例；深色下底色略浓，免得淡底被暗纸吞掉（styles.css 同值） */
export const HIGHLIGHT_MIX = {
  light: { background: 16, line: 65 },
  dark: { background: 24, line: 75 },
} as const;

const PALETTE_BY_ID = new Map(INLINE_PALETTE.map(entry => [entry.id as string, entry]));

export const getInlinePaletteEntry = (id: unknown): InlinePaletteEntry | undefined =>
  typeof id === "string" ? PALETTE_BY_ID.get(id) : undefined;

/** 色相的 CSS 取值（随明暗切换）；未知 id 返回 undefined */
export const inlineInk = (id: unknown): string | undefined => {
  const entry = getInlinePaletteEntry(id);
  return entry && `var(--ed-palette-${entry.id})`;
};

/** 高亮的底色与底线（随明暗切换）；未知 id 返回 undefined */
export const inlineHighlight = (id: unknown): { background: string; line: string } | undefined => {
  const ink = inlineInk(id);
  if (!ink) return undefined;
  return {
    background: `color-mix(in srgb, ${ink} var(--ed-highlight-bg-mix), transparent)`,
    line: `color-mix(in srgb, ${ink} var(--ed-highlight-line-mix), transparent)`,
  };
};

/** 渐变字的 CSS 取值（随明暗切换） */
export const inlineGradient = (id: TextGradientPresetId) => `var(--ed-gradient-${id})`;

/** 渐变字的背景裁切样式（面板预览与触发器共用） */
export const gradientTextStyle = (id: TextGradientPresetId) => ({
  backgroundImage: inlineGradient(id),
  backgroundClip: "text",
  WebkitBackgroundClip: "text",
  color: "transparent",
});

const withAlpha = (hex: string, percent: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${percent / 100})`;
};

/** 导出用（公众号等不支持 CSS 变量的场景）：高亮的浅色版具体色值 */
export const exportHighlightColors = (
  id: unknown
): { background: string; line: string } | undefined => {
  const entry = getInlinePaletteEntry(id);
  if (!entry) return undefined;
  return {
    background: withAlpha(entry.light, HIGHLIGHT_MIX.light.background),
    line: withAlpha(entry.light, HIGHLIGHT_MIX.light.line),
  };
};

/** 字色存的是具体色值：按任一明暗档反查色相，用于面板标出当前值 */
export const findInlineColorByInk = (ink: unknown): InlinePaletteEntry | undefined => {
  if (typeof ink !== "string") return undefined;
  const value = ink.toLowerCase();
  return INLINE_PALETTE.find(entry => entry.light === value || entry.dark === value);
};

/** styles.css 色板数据块的期望内容（测试据此守护 CSS 与本表一致） */
export const inlinePaletteCssVars = (mode: "light" | "dark"): Record<string, string> => ({
  ...Object.fromEntries(INLINE_PALETTE.map(entry => [`--ed-palette-${entry.id}`, entry[mode]])),
  ...Object.fromEntries(
    Object.values(TEXT_GRADIENT_PRESETS).map(preset => [`--ed-gradient-${preset.id}`, preset[mode]])
  ),
  "--ed-highlight-bg-mix": `${HIGHLIGHT_MIX[mode].background}%`,
  "--ed-highlight-line-mix": `${HIGHLIGHT_MIX[mode].line}%`,
});
