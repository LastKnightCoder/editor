/**
 * 思维导图主题 = 配色（种子色相）× 风格（节点轻重）× 明暗。
 * 这里只存种子，具体色值由 MindThemeUtil 在 OKLCH 空间派生，并保证文字对比度 ≥ 4.5:1。
 * 着色按分支：同一条二级分支及其子孙共用一个色相，层级靠「实心 → 浅底 → 纯文字」区分。
 */

export interface MindHue {
  /** OKLCH 色相（度） */
  h: number;
  /** OKLCH 彩度，0 为纯灰 */
  c: number;
}

export interface MindPalette {
  id: string;
  label: string;
  root: MindHue;
  /** 分支色相，按二级节点顺序循环 */
  hues: MindHue[];
  /** 深色画布下根节点仍用深色实底（霓虹这类以深底为特征的配色） */
  rootAlwaysDark?: boolean;
}

export type MindThemeStyle = "solid" | "soft" | "outline";

export const MIND_THEME_STYLES: Array<{ value: MindThemeStyle; label: string }> = [
  { value: "solid", label: "实心" },
  { value: "soft", label: "浅底" },
  { value: "outline", label: "线框" },
];

const hues = (c: number, ...hs: number[]): MindHue[] => hs.map(h => ({ h, c }));

export const MIND_PALETTES: MindPalette[] = [
  {
    id: "ink",
    label: "墨白",
    root: { h: 260, c: 0.02 },
    hues: [{ h: 260, c: 0.012 }],
  },
  {
    id: "classic",
    label: "经典",
    root: { h: 265, c: 0.03 },
    hues: hues(0.15, 25, 55, 95, 145, 200, 255, 300),
  },
  {
    id: "mist",
    label: "晨雾",
    root: { h: 240, c: 0.035 },
    hues: [
      { h: 240, c: 0.05 },
      { h: 15, c: 0.05 },
      { h: 150, c: 0.045 },
      { h: 70, c: 0.045 },
      { h: 300, c: 0.045 },
      { h: 195, c: 0.045 },
    ],
  },
  {
    id: "ocean",
    label: "海洋",
    root: { h: 260, c: 0.08 },
    hues: [
      { h: 265, c: 0.13 },
      { h: 245, c: 0.12 },
      { h: 225, c: 0.1 },
      { h: 205, c: 0.1 },
      { h: 185, c: 0.09 },
    ],
  },
  {
    id: "autumn",
    label: "暖秋",
    root: { h: 45, c: 0.05 },
    hues: [
      { h: 40, c: 0.13 },
      { h: 60, c: 0.12 },
      { h: 100, c: 0.1 },
      { h: 25, c: 0.1 },
      { h: 75, c: 0.1 },
    ],
  },
  {
    id: "forest",
    label: "森林",
    root: { h: 150, c: 0.05 },
    hues: [
      { h: 140, c: 0.1 },
      { h: 165, c: 0.09 },
      { h: 110, c: 0.09 },
      { h: 85, c: 0.08 },
      { h: 60, c: 0.06 },
    ],
  },
  {
    id: "berry",
    label: "莓果",
    root: { h: 330, c: 0.06 },
    hues: [
      { h: 350, c: 0.15 },
      { h: 320, c: 0.14 },
      { h: 295, c: 0.13 },
      { h: 10, c: 0.13 },
      { h: 275, c: 0.11 },
    ],
  },
  {
    id: "neon",
    label: "霓虹",
    root: { h: 280, c: 0.04 },
    rootAlwaysDark: true,
    hues: [
      { h: 340, c: 0.24 },
      { h: 195, c: 0.15 },
      { h: 135, c: 0.2 },
      { h: 95, c: 0.18 },
      { h: 290, c: 0.22 },
      { h: 55, c: 0.19 },
    ],
  },
];

export const DEFAULT_THEME_ID = "classic";
export const DEFAULT_THEME_STYLE: MindThemeStyle = "solid";

/** DEFAULT_THEME_ID 必须指向 MIND_PALETTES 里的一项，兜底靠它 */
const DEFAULT_PALETTE = MIND_PALETTES.find(p => p.id === DEFAULT_THEME_ID) ?? MIND_PALETTES[0];

export function getPaletteById(id: string | undefined): MindPalette {
  return MIND_PALETTES.find(p => p.id === id) ?? DEFAULT_PALETTE;
}

export function isMindThemeStyle(v: unknown): v is MindThemeStyle {
  return v === "solid" || v === "soft" || v === "outline";
}
