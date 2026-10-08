/**
 * 主题 → 画布调色板。
 *
 * 画布读不到 CSS 变量，这里把 --tau-* 语义 token 解析成一组实色。
 * 两个约束决定了实现方式：
 *  1. token 值既有 hex 也有 rgba()（见 themes/*.theme.ts），而对比度只能在实色上算，
 *     所以半透明一律先合成到 bg-page 上；
 *  2. 主题共 6 族 × 明暗，画布上的节点与连线必须在每种组合下都看得见——
 *     达不到阈值就沿 OKLCH 的 L 轴拟合，规则与思维导图主题一致（MindThemeUtil）。
 */

import { contrast, fitTone, hexTone, oklch, type Tone } from "@tau/shared/color-utils";
import type { GraphPalette } from "./types";

/** 正文标签阈值（AA 小字） */
export const LABEL_MIN_CONTRAST = 4.5;
/** 图形元素阈值（节点、连线，AA 非文本） */
export const SHAPE_MIN_CONTRAST = 3;

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const FALLBACK: Rgba = { r: 128, g: 128, b: 128, a: 1 };

export function parseColor(input: string): Rgba {
  const value = input.trim();
  const hex = value.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    const digits = hex[1];
    const expand = (s: string) => parseInt(s.length === 1 ? s + s : s, 16);
    if (digits.length === 3 || digits.length === 4) {
      return {
        r: expand(digits[0]),
        g: expand(digits[1]),
        b: expand(digits[2]),
        a: digits.length === 4 ? expand(digits[3]) / 255 : 1,
      };
    }
    if (digits.length === 6 || digits.length === 8) {
      return {
        r: parseInt(digits.slice(0, 2), 16),
        g: parseInt(digits.slice(2, 4), 16),
        b: parseInt(digits.slice(4, 6), 16),
        a: digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1,
      };
    }
  }
  const parseAlpha = (raw: string | undefined) => {
    if (raw === undefined) return 1;
    const alpha = raw.endsWith("%") ? parseFloat(raw) / 100 : parseFloat(raw);
    return Number.isFinite(alpha) ? alpha : 1;
  };

  const rgb = value.match(/^rgba?\(([^)]+)\)$/i);
  if (rgb) {
    const parts = rgb[1].split(/[\s,/]+/).filter(Boolean);
    const channel = (raw: string) =>
      raw.endsWith("%") ? (parseFloat(raw) / 100) * 255 : parseFloat(raw);
    return {
      r: channel(parts[0]),
      g: channel(parts[1]),
      b: channel(parts[2]),
      a: parseAlpha(parts[3]),
    };
  }

  // 主题的 accent 族用 hsl 声明（见 themes/*.theme.ts 的派生函数），必须支持——
  // 漏掉它会让强调色整体退化成兜底灰，而这在浅色主题下不容易一眼看出来
  const hsl = value.match(/^hsla?\(([^)]+)\)$/i);
  if (hsl) {
    const parts = hsl[1].split(/[\s,/]+/).filter(Boolean);
    const h = ((parseFloat(parts[0]) % 360) + 360) % 360;
    const s = parseFloat(parts[1]) / 100;
    const l = parseFloat(parts[2]) / 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    const sector = Math.floor(h / 60) % 6;
    const table: Array<[number, number, number]> = [
      [c, x, 0],
      [x, c, 0],
      [0, c, x],
      [0, x, c],
      [x, 0, c],
      [c, 0, x],
    ];
    const [r, g, b] = table[sector];
    return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255, a: parseAlpha(parts[3]) };
  }

  return FALLBACK;
}

const toHex = ({ r, g, b }: Rgba) =>
  "#" +
  [r, g, b]
    .map(v =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, "0")
    )
    .join("");

/** 半透明前景合成到实色底上（source-over） */
export function flatten(foreground: string, background: string): string {
  const fg = parseColor(foreground);
  if (fg.a >= 1) return toHex(fg);
  const bg = parseColor(background);
  return toHex({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
}

/** 叠一层指定不透明度（辉光、降淡都靠它，不额外引入 token） */
export function withAlpha(color: string, alpha: number): string {
  const { r, g, b, a } = parseColor(color);
  const next = Math.min(1, Math.max(0, a * alpha));
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${next.toFixed(3)})`;
}

/**
 * 保证 color 相对 against 至少有 minRatio 的对比度；不够就沿 L 轴拟合。
 * 方向按底色明暗选：浅底压深、深底提亮。
 */
export function ensureContrast(color: string, against: string, minRatio: number): string {
  const tone = hexTone(flatten(color, against));
  const base = hexTone(flatten(against, against));
  if (contrast(tone, base) >= minRatio) return tone.hex;
  const { l, c, h } = toOklch(tone);
  const direction = base.luminance > 0.4 ? "darker" : "lighter";
  return fitTone(l, c, h, base, minRatio, direction).hex;
}

/**
 * sRGB → OKLCH。oklch.ts 只提供正向（OKLCH → sRGB），
 * 而拟合需要从既有 token 色出发，所以这里补上反向变换。
 */
function toOklch(tone: Tone): { l: number; c: number; h: number } {
  const srgb = tone.hex
    .replace("#", "")
    .match(/../g)!
    .map(part => parseInt(part, 16) / 255)
    .map(v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const [r, g, b] = srgb;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const okL = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const okA = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const okB = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const hue = (Math.atan2(okB, okA) * 180) / Math.PI;
  return { l: okL, c: Math.hypot(okA, okB), h: hue < 0 ? hue + 360 : hue };
}

/** 供测试注入：生产环境读 CSS 变量，测试直接给一张表 */
export type TokenReader = (word: string) => string;

/**
 * @param backdrop 画布实际坐在哪个底色上。缺省用 bg-page；宿主是 surface 卡
 *   （卡片库的图谱视图）时必须传实际底色，否则对比度是按错的底算的。
 */
export function createPalette(read: TokenReader, backdrop?: string): GraphPalette {
  const background = flatten(backdrop || read("bg-page"), "#ffffff");
  const accent = flatten(read("accent"), background);
  const ink1 = flatten(read("ink-1"), background);
  const ink2 = flatten(read("ink-2"), background);
  const ink3 = flatten(read("ink-3"), background);

  // 节点实底取 ink-2：先前用 ink-3 + 3:1 下限，实测在暖纸浅色下淡到几乎看不见
  //（节点是图谱的主体，不是辅助线），改按正文级对比度要求
  const nodeFill = ensureContrast(ink2, background, LABEL_MIN_CONTRAST);
  return {
    background,
    nodeFill,
    nodeStroke: withAlpha(background, 0.9),
    nodeFillHover: ensureContrast(accent, background, SHAPE_MIN_CONTRAST),
    nodeFillCurrent: ensureContrast(accent, background, SHAPE_MIN_CONTRAST),
    nodeStrokeCurrent: withAlpha(ensureContrast(accent, background, SHAPE_MIN_CONTRAST), 0.35),
    // 连线压淡（结构感靠密度而不是线本身）但必须读得出来：
    // 取 ink-3 而非 line-1（后者是描边级的极浅色，叠 0.2 透明度后等于没画）
    edge: withAlpha(ensureContrast(ink3, background, SHAPE_MIN_CONTRAST), 0.45),
    edgeHighlight: ensureContrast(accent, background, SHAPE_MIN_CONTRAST),
    label: ensureContrast(ink1, background, LABEL_MIN_CONTRAST),
    glow: withAlpha(ensureContrast(accent, background, SHAPE_MIN_CONTRAST), 0.28),
    fontFamily: read("font") || "sans-serif",
  };
}

/**
 * 主题色板：固定 10 个色相，按「色槽」取，而不是每个簇随机一个色相。
 *
 * 上一版按锚点哈希取色相，几十个簇就是几十种颜色，满屏五颜六色。现在：
 *  - 只有大主题有颜色（离线地图最多 10 个），子主题沿用父主题的色槽；
 *  - 10 个色相是手挑的：相邻色槽刻意拉开（暖冷交替），任意两个挨着的主题都分得开；
 *  - 彩度压低、明度统一，整体读起来是一套「调过的」颜色，不跟 accent 抢。
 * 同一色槽在不同主题族 × 明暗下取不同实色，但对比度永远拟合到达标。
 */
const TOPIC_HUES = [258, 38, 158, 350, 210, 88, 300, 18, 190, 128];

export function topicColor(slot: number, background: string): string {
  const base = hexTone(flatten(background, "#ffffff"));
  const hue = TOPIC_HUES[((slot % TOPIC_HUES.length) + TOPIC_HUES.length) % TOPIC_HUES.length];
  const light = base.luminance > 0.4;
  const tone = oklch(light ? 0.62 : 0.76, light ? 0.085 : 0.075, hue);
  return ensureContrast(tone.hex, base.hex, SHAPE_MIN_CONTRAST);
}

/** 兼容批次 3 的链接簇（离线地图不可用时的退化路径）：锚点哈希到同一套色板 */
export function clusterColor(anchor: number, background: string): string {
  return topicColor(Math.abs(anchor * 2654435761) % TOPIC_HUES.length, background);
}

/** 生产读法：从 <html> 的 computed style 取 --tau-<word> */
export function readThemeTokens(element: HTMLElement = document.documentElement): TokenReader {
  const style = getComputedStyle(element);
  return word => style.getPropertyValue(`--tau-${word}`).trim() || "#808080";
}

/**
 * 从元素向上找第一个不透明的 background-color —— 画布自身透明，
 * 真实底色取决于宿主（page 环境 / surface 卡 / 抽屉）。找不到就返回空串，
 * 由调用方退回 bg-page。
 */
export function resolveBackdrop(element: HTMLElement | null): string {
  let current: HTMLElement | null = element;
  while (current) {
    const color = getComputedStyle(current).backgroundColor;
    // 浏览器给的计算值是 rgba(0,0,0,0) 而不是 transparent；后者仍显式排除以防实现差异
    if (color && color !== "transparent" && parseColor(color).a > 0.95) return color;
    current = current.parentElement;
  }
  return "";
}
