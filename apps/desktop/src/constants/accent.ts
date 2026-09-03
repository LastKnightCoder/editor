/**
 * Accent 预设 — JS 侧唯一来源
 *
 * 与 styles/theme-colors.css 中 `:root[data-accent="*"]` 的 h/c/l 保持同源:
 * 此处的 hex 供 antd token、图表节点、tab 圆弧等需要 JS 色值的场景使用。
 * 新增/调整预设时两处必须同步。
 */

export const ACCENT_PRESETS = [
  "indigo",
  "violet",
  "rose",
  "emerald",
  "amber",
  "graphite",
] as const;

export type AccentPreset = (typeof ACCENT_PRESETS)[number];

export const DEFAULT_ACCENT: AccentPreset = "indigo";

export const ACCENT_LABELS: Record<AccentPreset, string> = {
  indigo: "靛蓝",
  violet: "紫罗兰",
  rose: "玫瑰",
  emerald: "翡翠",
  amber: "琥珀",
  graphite: "石墨",
};

/** oklch 输入,与 CSS 变量 --th-accent-h/c/l 同源 */
export const ACCENT_OKLCH: Record<
  AccentPreset,
  { h: number; c: number; l: number }
> = {
  indigo: { h: 265, c: 0.17, l: 0.55 },
  violet: { h: 295, c: 0.19, l: 0.56 },
  rose: { h: 15, c: 0.19, l: 0.58 },
  emerald: { h: 160, c: 0.135, l: 0.54 },
  amber: { h: 70, c: 0.15, l: 0.63 },
  graphite: { h: 255, c: 0.012, l: 0.52 },
};

/** antd / 图表等 JS 场景的主色(明/暗) */
export const ACCENT_COLORS: Record<AccentPreset, [string, string]> = {
  indigo: ["#4f46e5", "#818cf8"],
  violet: ["#7c3aed", "#a78bfa"],
  rose: ["#e11d48", "#fb7185"],
  emerald: ["#059669", "#34d399"],
  amber: ["#d97706", "#fbbf24"],
  graphite: ["#4b5563", "#9ca3af"],
};

/** 旧 backgroundType(gradient1~9 / solid)→ 新 accent 的迁移映射 */
export const LEGACY_BACKGROUND_TYPE_TO_ACCENT: Record<string, AccentPreset> = {
  gradient1: "violet",
  gradient2: "indigo",
  gradient3: "amber",
  gradient4: "emerald",
  gradient5: "rose",
  gradient6: "graphite",
  gradient7: "indigo",
  gradient8: "amber",
  gradient9: "rose",
  solid: "indigo",
};

export const isAccentPreset = (value: unknown): value is AccentPreset =>
  typeof value === "string" &&
  (ACCENT_PRESETS as readonly string[]).includes(value);
