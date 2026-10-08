import type { ColumnColor } from "../types/column";

/**
 * 富文本 / 卡片的外观：只存语义（样式 + 色调），颜色全部取主题 token，
 * 随主题族与明暗切换。内边距、圆角、阴影由这里统一给定，不开放给用户。
 *
 * - none   透明：无底无框，只有文字
 * - plain  白卡：surface 实底 + 发丝线
 * - band   色带：白卡 + 顶部 tag 色带（与 Column 色带同高同色）
 * - tinted 柔色：tag-soft 底 + 同色系淡边
 */
export type TextVariant = "none" | "plain" | "band" | "tinted";
/** 色调与 Column 共用同一组标签色，色相顺序一致 */
export type TextTone = ColumnColor;

export interface TextStyle {
  variant: TextVariant;
  tone?: TextTone;
}

export const TEXT_TONES: Array<{ value: TextTone; label: string; solid: string; soft: string }> = [
  { value: "green", label: "绿", solid: "var(--tau-tag-1)", soft: "var(--tau-tag-1-soft)" },
  { value: "blue", label: "蓝", solid: "var(--tau-tag-2)", soft: "var(--tau-tag-2-soft)" },
  { value: "purple", label: "紫", solid: "var(--tau-tag-3)", soft: "var(--tau-tag-3-soft)" },
  { value: "yellow", label: "黄", solid: "var(--tau-tag-4)", soft: "var(--tau-tag-4-soft)" },
  { value: "red", label: "红", solid: "var(--tau-tag-5)", soft: "var(--tau-tag-5-soft)" },
];

export const TEXT_BOX = {
  radius: 6,
  paddingX: 16,
  paddingY: 12,
  bandHeight: 3,
} as const;

export const TEXT_COLORS = {
  ink: "var(--tau-ink-1)",
  surface: "var(--tau-bg-surface)",
  line: "color-mix(in srgb, var(--tau-ink-1) 11%, transparent)",
} as const;

export const DEFAULT_RICHTEXT_STYLE: TextStyle = { variant: "none" };

export interface TextBoxPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export function getTextBoxPadding(style: TextStyle): TextBoxPadding {
  const { paddingX, paddingY, bandHeight } = TEXT_BOX;
  return {
    top: paddingY + (style.variant === "band" && style.tone ? bandHeight : 0),
    right: paddingX,
    bottom: paddingY,
    left: paddingX,
  };
}

export const toCssPadding = (p: TextBoxPadding) =>
  `${p.top}px ${p.right}px ${p.bottom}px ${p.left}px`;

const toneOf = (tone?: TextTone) => TEXT_TONES.find(t => t.value === tone);

/**
 * 底板的底色与发丝线色；none 返回 null。卡片不用阴影，只靠发丝线分层。
 * sketchEdge：手绘模式下的墨迹框色——发丝线太淡，墨迹需要可辨的颜色（D-107）
 */
export function getTextSurface(
  style: TextStyle
): { background: string; edge: string; sketchEdge: string } | null {
  if (style.variant === "none") return null;
  const tone = toneOf(style.tone);
  if (style.variant === "tinted" && tone) {
    return {
      background: tone.soft,
      edge: `color-mix(in srgb, ${tone.solid} 22%, transparent)`,
      sketchEdge: tone.solid,
    };
  }
  return {
    background: TEXT_COLORS.surface,
    edge: TEXT_COLORS.line,
    sketchEdge: "var(--tau-ink-3)",
  };
}

/** 顶部色带颜色；非 band 或无色调返回 null */
export function getTextBandColor(style: TextStyle): string | null {
  if (style.variant !== "band") return null;
  return toneOf(style.tone)?.solid ?? null;
}

/** 旧版硬编码色值 → 新样式（取色值里第一个 hex 就近映射） */
const LEGACY_BACKGROUND_MAP: Record<string, TextStyle> = {
  "#ff6a63": { variant: "tinted", tone: "red" },
  "#ffa02c": { variant: "tinted", tone: "yellow" },
  "#f4d63b": { variant: "tinted", tone: "yellow" },
  "#24b079": { variant: "tinted", tone: "green" },
  "#865cc2": { variant: "tinted", tone: "purple" },
  "#3f71fb": { variant: "tinted", tone: "blue" },
  "#ffe0fc": { variant: "tinted", tone: "red" },
  "#f3ffd0": { variant: "tinted", tone: "yellow" },
  "#d9f9f3": { variant: "tinted", tone: "green" },
  "#d6ebff": { variant: "tinted", tone: "blue" },
  "#eddeff": { variant: "tinted", tone: "purple" },
  "#cccae9": { variant: "tinted", tone: "purple" },
};
const LEGACY_TOP_COLOR_MAP: Record<string, TextTone> = {
  "#f7ce66": "yellow",
  "#f24a6e": "red",
  "#20ceae": "green",
  "#9770f6": "purple",
};

const firstHex = (value?: string) => value?.match(/#[0-9a-f]{3,8}\b/i)?.[0].toLowerCase();
const isTransparent = (value?: string) => !value || value === "transparent" || value === "none";

interface TextStyleSource {
  type: string;
  variant?: TextVariant;
  tone?: TextTone;
  /** @deprecated 旧版字段，仅用于换算 */
  background?: string;
  /** @deprecated 旧版字段，仅用于换算 */
  topColor?: string;
}

/** 读出元素的有效样式：新字段优先，否则由旧色值换算，都没有则取类型默认 */
export function resolveTextStyle(element: TextStyleSource): TextStyle {
  if (element.variant) return { variant: element.variant, tone: element.tone };

  const fallback = DEFAULT_RICHTEXT_STYLE;
  const { background, topColor } = element;

  if (!isTransparent(topColor)) {
    const tone = LEGACY_TOP_COLOR_MAP[firstHex(topColor) ?? ""];
    return tone ? { variant: "band", tone } : { variant: "plain" };
  }
  if (background === undefined) return fallback;
  if (isTransparent(background)) return { variant: "none" };
  return LEGACY_BACKGROUND_MAP[firstHex(background) ?? ""] ?? { variant: "plain" };
}

/** 选中新样式时一并清掉的旧版外观字段 */
export const LEGACY_TEXT_STYLE_KEYS = [
  "background",
  "topColor",
  "color",
  "theme",
  "shadowSize",
  "paddingWidth",
  "paddingHeight",
] as const;
