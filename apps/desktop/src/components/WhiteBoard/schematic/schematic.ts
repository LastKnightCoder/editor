/**
 * 白板页示意图：直接从页数据（元素树）生成一张简略的结构示意，替代真实截图。
 * 只保留结构与颜色——思维导图画成色块 + 连线、文本卡片画成若干灰条、媒体画成占位图标，
 * 不渲染具体内容，所以任何画布都能得到一张干净、稳定的预览；无需打开页面、无需缓存。
 *
 * 纯函数：元素 → 图元列表 + 视口。坐标都在画布坐标系；描边宽度以「输出像素」计，
 * 由组件用 non-scaling-stroke 渲染，缩放多少都保持细线。
 */

import type { BoardElement } from "@/components/WhiteBoard/types";
import { getThemeById, DEFAULT_THEME_ID } from "@/components/WhiteBoard/constants/mind-themes";
import { getThemeColorById } from "@/components/WhiteBoard/constants/theme-colors";
import { outlineToSvgPath } from "@/components/WhiteBoard/utils/HandwriteUtil";
import {
  getTextBandColor,
  getTextSurface,
  resolveTextStyle,
} from "@/components/WhiteBoard/constants/text-style";

/** 纯色，或由 CSS linear-gradient 解析出的渐变（文本卡片常用渐变底） */
export type SchematicFill =
  string | { angle: number; stops: Array<{ color: string; offset: number }> };

export type SchematicShape =
  | {
      kind: "rect";
      x: number;
      y: number;
      w: number;
      h: number;
      r: number;
      fill: SchematicFill;
      fillOpacity?: number;
      stroke?: string;
      /** 输出像素 */
      strokeWidth?: number;
    }
  | {
      kind: "path";
      d: string;
      fill?: string;
      fillOpacity?: number;
      stroke?: string;
      strokeOpacity?: number;
      /** 输出像素 */
      strokeWidth?: number;
      /** 归一化路径（0~1）放进元素框：translate(x y) scale(w h) */
      box?: { x: number; y: number; w: number; h: number };
    }
  | {
      /** 箭头端点的三角：尺寸按输出像素，组件按缩放换算 */
      kind: "arrowhead";
      x: number;
      y: number;
      angle: number;
      color: string;
    };

export interface Schematic {
  viewBox: { x: number; y: number; w: number; h: number };
  shapes: SchematicShape[];
}

/** 中性色走主题变量，深浅色自动适配 */
const INK = "var(--tau-ink-1)";
const LINE = "var(--tau-line-2)";

/** 视口下限（画布坐标）：内容很少时不无限放大，保持「一小块内容在画布上」的比例感 */
const MIN_VIEW_WIDTH = 900;
const PADDING_RATIO = 0.08;

type AnyElement = BoardElement & Record<string, any>;

const isColor = (value: unknown): value is string =>
  typeof value === "string" && value !== "" && value !== "none" && value !== "transparent";

const hasBox = (e: AnyElement) =>
  Number.isFinite(e.x) && Number.isFinite(e.y) && e.width > 0 && e.height > 0;

interface Ctx {
  dark: boolean;
  shapes: SchematicShape[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

function grow(ctx: Ctx, x: number, y: number, w = 0, h = 0) {
  const b = ctx.bounds;
  b.minX = Math.min(b.minX, x);
  b.minY = Math.min(b.minY, y);
  b.maxX = Math.max(b.maxX, x + w);
  b.maxY = Math.max(b.maxY, y + h);
}

/** `linear-gradient(310deg, #D6EBFF 6.86%, #E7FBF9 100%)` → 渐变；其它（含纯色）原样返回 */
export function parseFill(value: string): SchematicFill {
  const match = /^linear-gradient\((.*)\)$/i.exec(value.trim());
  if (!match) return value;
  // 按顶层逗号切分（rgb(...) 内部的逗号不切）
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  const body = match[1];
  for (let i = 0; i < body.length; i++) {
    if (body[i] === "(") depth++;
    else if (body[i] === ")") depth--;
    else if (body[i] === "," && depth === 0) {
      parts.push(body.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(body.slice(start).trim());

  let angle = 180;
  if (/^-?[\d.]+deg$/.test(parts[0])) angle = parseFloat(parts.shift()!);
  const stops = parts
    .map((part, i, all) => {
      const m = /^(.*?)\s+(-?[\d.]+)%$/.exec(part);
      const color = (m ? m[1] : part).trim();
      const offset = m ? parseFloat(m[2]) / 100 : all.length > 1 ? i / (all.length - 1) : 0;
      return { color, offset: Math.min(1, Math.max(0, offset)) };
    })
    .filter(stop => stop.color);
  if (!stops.length) return value;
  return stops.length === 1 ? stops[0].color : { angle, stops };
}

function themeColor(id: string | undefined, dark: boolean, fallback: string) {
  const pair = id ? getThemeColorById(id) : undefined;
  return pair ? (dark ? pair.dark : pair.light) : fallback;
}

/** 文本占位：若干圆角灰条，末行短一截 */
function textBars(ctx: Ctx, x: number, y: number, w: number, h: number, color = INK) {
  const lineHeight = 26;
  const barHeight = 8;
  const lines = Math.max(1, Math.min(6, Math.floor(h / lineHeight)));
  const top = y + (h - lines * lineHeight) / 2 + (lineHeight - barHeight) / 2;
  for (let i = 0; i < lines; i++) {
    const last = i === lines - 1 && lines > 1;
    ctx.shapes.push({
      kind: "rect",
      x,
      y: top + i * lineHeight,
      w: w * (last ? 0.58 : i % 2 ? 0.86 : 1),
      h: barHeight,
      r: barHeight / 2,
      fill: color,
      fillOpacity: 0.13,
    });
  }
}

function card(ctx: Ctx, e: AnyElement) {
  const r = Math.min(10, e.height / 4);
  // 富文本 / 卡片走语义样式（含旧色值换算）；白板引用等其它类型按白卡画
  const style =
    e.type === "richtext" || e.type === "card"
      ? resolveTextStyle(e as Parameters<typeof resolveTextStyle>[0])
      : { variant: "plain" as const };
  // 透明样式只画文字条
  const surface = getTextSurface(style);
  if (surface) {
    ctx.shapes.push({
      kind: "rect",
      x: e.x,
      y: e.y,
      w: e.width,
      h: e.height,
      r,
      fill: surface.background,
      stroke: surface.edge,
      strokeWidth: 1,
    });
  }
  const band = getTextBandColor(style);
  if (band) {
    ctx.shapes.push({
      kind: "rect",
      x: e.x,
      y: e.y,
      w: e.width,
      h: Math.min(10, e.height / 5),
      r: Math.min(4, r),
      fill: band,
    });
  }
  const pad = Math.min(18, e.width * 0.1, e.height * 0.2);
  textBars(ctx, e.x + pad, e.y + pad, e.width - pad * 2, e.height - pad * 2);
}

/** 媒体占位：浅底 + 居中的小图标 */
function media(ctx: Ctx, e: AnyElement, glyph: "image" | "video" | "audio" | "web") {
  const { x, y, width: w, height: h } = e;
  ctx.shapes.push({
    kind: "rect",
    x,
    y,
    w,
    h,
    r: Math.min(10, h / 6),
    fill: INK,
    fillOpacity: 0.07,
  });
  const s = Math.min(w, h) * 0.34;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const glyphFill = { fill: INK, fillOpacity: 0.16 };
  if (glyph === "image") {
    ctx.shapes.push({
      kind: "path",
      d: `M ${cx - s} ${cy + s * 0.6} L ${cx - s * 0.3} ${cy - s * 0.25} L ${cx + s * 0.1} ${cy + s * 0.2} L ${cx + s * 0.45} ${cy - s * 0.1} L ${cx + s} ${cy + s * 0.6} Z`,
      ...glyphFill,
    });
    const sun = s * 0.2;
    ctx.shapes.push({
      kind: "rect",
      x: cx + s * 0.35 - sun,
      y: cy - s * 0.65 - sun,
      w: sun * 2,
      h: sun * 2,
      r: sun,
      ...glyphFill,
    });
  } else if (glyph === "video") {
    const t = s * 0.55;
    ctx.shapes.push({
      kind: "path",
      d: `M ${cx - t * 0.7} ${cy - t} L ${cx + t} ${cy} L ${cx - t * 0.7} ${cy + t} Z`,
      ...glyphFill,
    });
  } else if (glyph === "audio") {
    const bars = [0.35, 0.8, 0.55, 1, 0.45, 0.7];
    const bw = (s * 2) / (bars.length * 2 - 1);
    bars.forEach((k, i) => {
      const bh = s * 1.2 * k;
      ctx.shapes.push({
        kind: "rect",
        x: cx - s + i * bw * 2,
        y: cy - bh / 2,
        w: bw,
        h: bh,
        r: bw / 2,
        ...glyphFill,
      });
    });
  } else {
    const bar = Math.min(28, h * 0.12);
    ctx.shapes.push({ kind: "rect", x, y, w, h: bar, r: Math.min(10, h / 6), ...glyphFill });
    textBars(ctx, x + w * 0.1, y + bar + h * 0.12, w * 0.8, Math.min(h * 0.5, 140));
  }
}

/* ───────── 思维导图 ───────── */

function mindTree(ctx: Ctx, root: AnyElement) {
  const theme = getThemeById(root.themeId || DEFAULT_THEME_ID);
  const colorOf = (level: number) =>
    level <= 1
      ? theme.root.background
      : (theme.palette[(level - 2) % theme.palette.length]?.background ?? theme.root.background);
  const nodes: SchematicShape[] = [];
  const lines: SchematicShape[] = [];

  const visit = (node: AnyElement) => {
    const { x, y, width: w, height: h } = node;
    const level = node.level ?? 1;
    const color = colorOf(level);
    grow(ctx, x, y, w, h);
    nodes.push({ kind: "rect", x, y, w, h, r: Math.min(h / 2, level <= 1 ? 14 : 10), fill: color });
    const text =
      level <= 1 ? theme.root.color : theme.palette[(level - 2) % theme.palette.length]?.color;
    const bar = Math.min(8, h * 0.18);
    nodes.push({
      kind: "rect",
      x: x + w * 0.22,
      y: y + (h - bar) / 2,
      w: w * 0.56,
      h: bar,
      r: bar / 2,
      fill: text ?? INK,
      fillOpacity: 0.45,
    });

    for (const child of (node.children ?? []) as AnyElement[]) {
      if (child?.type !== "mind-node" || !hasBox(child)) continue;
      const left = child.direction === "left";
      // 折叠的一侧整棵子树不画（它们还留着旧坐标，画出来会把示意图撑散）
      if (left ? node.isLeftFold : node.isRightFold) continue;
      const sx = left ? x : x + w;
      const sy = y + h / 2;
      const ex = left ? child.x + child.width : child.x;
      const ey = child.y + child.height / 2;
      const mx = (sx + ex) / 2;
      lines.push({
        kind: "path",
        d: `M ${sx} ${sy} C ${mx} ${sy} ${mx} ${ey} ${ex} ${ey}`,
        stroke: colorOf(child.level ?? level + 1),
        strokeWidth: 1.4,
      });
      visit(child);
    }
  };
  visit(root);
  // 连线压在节点下面
  ctx.shapes.push(...lines, ...nodes);
}

/* ───────── 箭头 ───────── */

function arrow(ctx: Ctx, e: AnyElement) {
  const points = (e.points ?? []) as Array<{ x: number; y: number }>;
  if (points.length < 2) return;
  points.forEach(p => grow(ctx, p.x, p.y));
  const color = themeColor(e.themeColorId, ctx.dark, INK);
  const first = points[0];
  const last = points[points.length - 1];
  let d: string;
  let from = points[points.length - 2];
  if (e.lineType === "curve" && e.midPoint) {
    const c = {
      x: 2 * e.midPoint.x - (first.x + last.x) / 2,
      y: 2 * e.midPoint.y - (first.y + last.y) / 2,
    };
    d = `M ${first.x} ${first.y} Q ${c.x} ${c.y} ${last.x} ${last.y}`;
    from = c;
  } else if (e.lineType === "orthogonal" && points.length === 2) {
    const mx = (first.x + last.x) / 2;
    d = `M ${first.x} ${first.y} H ${mx} V ${last.y} H ${last.x}`;
    from = { x: mx, y: last.y };
  } else {
    d = `M ${points.map(p => `${p.x} ${p.y}`).join(" L ")}`;
  }
  ctx.shapes.push({ kind: "path", d, stroke: color, strokeOpacity: 0.75, strokeWidth: 1 });
  if (e.target?.marker && e.target.marker !== "none") {
    const angle = Math.atan2(last.y - from.y, last.x - from.x);
    ctx.shapes.push({ kind: "arrowhead", x: last.x, y: last.y, angle, color });
  }
}

/* ───────── 分派 ───────── */

function element(ctx: Ctx, e: AnyElement) {
  if (!e || typeof e !== "object") return;
  if (e.type === "arrow") return arrow(ctx, e);
  if (!hasBox(e)) return;
  if (e.type === "mind-node") return mindTree(ctx, e);

  grow(ctx, e.x, e.y, e.width, e.height);
  switch (e.type) {
    case "richtext":
    case "card":
      return card(ctx, e);
    case "geometry": {
      const fill = isColor(e.fill) ? e.fill : undefined;
      const stroke = isColor(e.stroke) ? e.stroke : undefined;
      for (const d of (e.paths ?? []) as string[]) {
        ctx.shapes.push({
          kind: "path",
          d,
          fill,
          fillOpacity: fill ? (e.fillOpacity ?? 1) : undefined,
          stroke: stroke ?? (fill ? undefined : INK),
          strokeWidth: 1.2,
          box: { x: e.x, y: e.y, w: e.width, h: e.height },
        });
      }
      return;
    }
    case "handwrite": {
      if (!Array.isArray(e.outline) || e.outline.length === 0) return;
      ctx.shapes.push({
        kind: "path",
        d: outlineToSvgPath(e.outline),
        fill: themeColor(e.style?.themeColorId, ctx.dark, INK),
        fillOpacity: e.style?.opacity ?? 1,
        box: { x: e.x, y: e.y, w: e.width, h: e.height },
      });
      return;
    }
    case "frame":
      ctx.shapes.push({
        kind: "rect",
        x: e.x,
        y: e.y,
        w: e.width,
        h: e.height,
        r: e.borderRadius ?? 8,
        fill: isColor(e.backgroundColor) ? parseFill(e.backgroundColor) : INK,
        fillOpacity: isColor(e.backgroundColor) ? undefined : 0.03,
        stroke: isColor(e.borderColor) ? e.borderColor : LINE,
        strokeWidth: 1.2,
      });
      break;
    case "column":
      ctx.shapes.push({
        kind: "rect",
        x: e.x,
        y: e.y,
        w: e.width,
        h: e.height,
        r: e.borderRadius ?? 12,
        fill: INK,
        fillOpacity: 0.045,
        stroke: LINE,
        strokeWidth: 1,
      });
      ctx.shapes.push({
        kind: "rect",
        x: e.x + (e.padding ?? 16),
        y: e.y + 28,
        w: e.width * 0.42,
        h: 12,
        r: 6,
        fill: INK,
        fillOpacity: 0.22,
      });
      break;
    case "image":
      return media(ctx, e, "image");
    case "video":
      return media(ctx, e, "video");
    case "audio":
      return media(ctx, e, "audio");
    case "webview":
      return media(ctx, e, "web");
    case "whiteboard":
      return card(ctx, e);
    default:
      ctx.shapes.push({
        kind: "rect",
        x: e.x,
        y: e.y,
        w: e.width,
        h: e.height,
        r: 8,
        fill: INK,
        fillOpacity: 0.06,
      });
  }
  // 容器（frame / column）的子元素是绝对坐标，直接接着画
  for (const child of (e.children ?? []) as AnyElement[]) element(ctx, child);
}

/** 空画布返回 null（卡片显示「空白画布」） */
export function buildSchematic(
  elements: BoardElement[] | undefined,
  options: { aspect: number; dark: boolean }
): Schematic | null {
  if (!elements?.length) return null;
  const ctx: Ctx = {
    dark: options.dark,
    shapes: [],
    bounds: { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  };
  for (const e of elements) element(ctx, e as AnyElement);
  const { minX, minY, maxX, maxY } = ctx.bounds;
  if (!ctx.shapes.length || !Number.isFinite(minX) || !Number.isFinite(maxY)) return null;

  const pad = Math.max(maxX - minX, maxY - minY) * PADDING_RATIO + 24;
  let w = maxX - minX + pad * 2;
  let h = maxY - minY + pad * 2;
  // 扩成卡片比例、并保底尺寸，内容居中
  w = Math.max(w, h * options.aspect, MIN_VIEW_WIDTH);
  h = w / options.aspect;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return { viewBox: { x: cx - w / 2, y: cy - h / 2, w, h }, shapes: ctx.shapes };
}
