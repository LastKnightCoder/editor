import type { ThemeMode } from "@tau/themes/react";

/** 纸外的背景：柔光 = 纸放在带晕光的底上；整张纸 = 不留背景，整张图就是纸 */
export type ExportBackdrop = "glow" | "paper";
export type ExportWidth = 375 | 600 | 800;
export type ExportPadding = "tight" | "normal" | "loose";

export interface ExportPreference {
  /** 未选过时为空，跟随应用当前主题族与明暗 */
  themeKey?: string;
  mode?: ThemeMode;
  backdrop: ExportBackdrop;
  width: ExportWidth;
  padding: ExportPadding;
  showTitle: boolean;
  showDate: boolean;
  showSignature: boolean;
}

export const DEFAULT_EXPORT_PREFERENCE: ExportPreference = {
  backdrop: "glow",
  width: 600,
  padding: "normal",
  showTitle: true,
  showDate: true,
  showSignature: true,
};

export const BACKDROP_OPTIONS: { value: ExportBackdrop; label: string }[] = [
  { value: "glow", label: "柔光" },
  { value: "paper", label: "整张纸" },
];

export const WIDTH_OPTIONS: { value: ExportWidth; label: string }[] = [
  { value: 375, label: "手机" },
  { value: 600, label: "标准" },
  { value: 800, label: "宽屏" },
];

export const PADDING_OPTIONS: { value: ExportPadding; label: string }[] = [
  { value: "tight", label: "紧凑" },
  { value: "normal", label: "标准" },
  { value: "loose", label: "宽松" },
];

const PADDING_PX: Record<ExportPadding, number> = { tight: 24, normal: 40, loose: 64 };

/** 375 宽时背景留白按比例收窄，避免纸面被挤得太窄 */
const NARROW_RATIO = 0.6;

export interface ExportLayout {
  /** 纸外背景留白（整张纸为 0） */
  outer: number;
  /** 纸内留白 */
  inner: number;
}

export function resolveExportLayout(
  backdrop: ExportBackdrop,
  width: ExportWidth,
  padding: ExportPadding
): ExportLayout {
  const narrow = width <= 375;
  const base = PADDING_PX[padding];
  if (backdrop === "paper") {
    return { outer: 0, inner: narrow ? 24 : Math.round(base * 1.1) };
  }
  return { outer: Math.round(base * (narrow ? NARROW_RATIO : 1)), inner: narrow ? 24 : 36 };
}

/**
 * 柔光第二道晕光取的 tag 色：与 accent 色相相邻，避免撞色或发灰。
 * 未登记的主题族回落 tag-3。
 */
const GLOW_TAG: Record<string, string> = {
  paper: "tag-5",
  ocean: "tag-3",
  mint: "tag-2",
  wisteria: "tag-5",
  sakura: "tag-3",
  ink: "tag-2",
};

const mix = (color: string, percent: number, base: string) =>
  `color-mix(in srgb, ${color} ${percent}%, ${base})`;

/**
 * 导出图片的背景，只消费 --tau-* 变量：挂在带 data-theme / data-mode 的节点上，
 * 由该主题的数据块取值。
 */
export function resolveExportBackground(
  backdrop: ExportBackdrop,
  themeKey: string,
  mode: ThemeMode
): string {
  if (backdrop === "paper") return "var(--tau-bg-surface)";
  const glow = `var(--tau-${GLOW_TAG[themeKey] ?? "tag-3"})`;
  const accent = "var(--tau-accent)";
  const page = "var(--tau-bg-page)";
  const sunken = "var(--tau-bg-sunken)";
  if (mode === "dark") {
    return [
      `radial-gradient(110% 80% at 0% 0%, ${mix(accent, 26, sunken)} 0%, transparent 62%)`,
      `radial-gradient(100% 80% at 100% 100%, ${mix(glow, 22, sunken)} 0%, transparent 65%)`,
      mix(page, 70, sunken),
    ].join(", ");
  }
  return [
    `radial-gradient(110% 80% at 0% 0%, ${mix(accent, 22, page)} 0%, transparent 62%)`,
    `radial-gradient(100% 80% at 100% 100%, ${mix(glow, 24, page)} 0%, transparent 65%)`,
    sunken,
  ].join(", ");
}

/** 去掉文件系统不接受的字符；空标题回落默认名 */
export function createExportFileName(title: string | undefined, now = new Date()): string {
  const cleaned = Array.from((title ?? "").replace(/[<>:"/\\|?*]/g, "_"))
    .filter(ch => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) !== 127)
    .join("")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim();
  if (cleaned) return `${cleaned}.png`;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `Tau-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.png`;
}

export function formatExportDate(date: Date): string {
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}
