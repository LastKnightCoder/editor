/**
 * PDF 标注的纯逻辑：颜色（写进 PDF 的数据色 ↔ 界面语义类）、样式、摘录、页码与位置、对话引用。
 * 不依赖 React 与引擎实例，单测见 __tests__/annotationModel.test.ts。
 */

import { PdfAnnotationSubtype, PdfBlendMode, type PdfAnnotationObject } from "@embedpdf/models";
import type { MessageContentItem } from "@tau/shared";
import { EHighlightColor, type PdfAnnotation } from "@/types";
import { richTextPlainText } from "@/utils/richTextText";

/** 新建可选的 5 色（粉色只保留给旧标注显示） */
export const PICKABLE_COLORS = [
  EHighlightColor.Yellow,
  EHighlightColor.Red,
  EHighlightColor.Green,
  EHighlightColor.Blue,
  EHighlightColor.Purple,
] as const;

interface ColorSpec {
  label: string;
  /** 写进 PDF 标注对象的颜色：属于文件数据，不随主题变化 */
  pdfHex: string;
  /** 界面上的色块 / 竖条 / 图钉，映射到主题数据色（与微信读书划线同一套对应） */
  swatch: string;
  text: string;
  border: string;
  areaFill: string;
}

export const COLOR_SPECS: Record<EHighlightColor, ColorSpec> = {
  [EHighlightColor.Yellow]: {
    label: "黄",
    pdfHex: "#fde58b",
    swatch: "bg-tag-4",
    text: "text-tag-4",
    border: "border-tag-4",
    areaFill: "bg-tag-4/15",
  },
  [EHighlightColor.Red]: {
    label: "红",
    pdfHex: "#ffb3b3",
    swatch: "bg-tag-5",
    text: "text-tag-5",
    border: "border-tag-5",
    areaFill: "bg-tag-5/15",
  },
  [EHighlightColor.Green]: {
    label: "绿",
    pdfHex: "#b2f1b7",
    swatch: "bg-tag-1",
    text: "text-tag-1",
    border: "border-tag-1",
    areaFill: "bg-tag-1/15",
  },
  [EHighlightColor.Blue]: {
    label: "蓝",
    pdfHex: "#b8d3ff",
    swatch: "bg-tag-2",
    text: "text-tag-2",
    border: "border-tag-2",
    areaFill: "bg-tag-2/15",
  },
  [EHighlightColor.Purple]: {
    label: "紫",
    pdfHex: "#dcb8ff",
    swatch: "bg-tag-3",
    text: "text-tag-3",
    border: "border-tag-3",
    areaFill: "bg-tag-3/15",
  },
  [EHighlightColor.Pink]: {
    label: "粉",
    pdfHex: "#ffc4e1",
    swatch: "bg-tag-5",
    text: "text-tag-5",
    border: "border-tag-5",
    areaFill: "bg-tag-5/15",
  },
};

const ALL_COLORS = Object.keys(COLOR_SPECS) as EHighlightColor[];

function hexToRgb(hex: string): [number, number, number] | null {
  const raw = hex.trim().replace(/^#/, "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map(ch => ch + ch)
          .join("")
      : raw;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

/** 标注对象上的颜色 → 最接近的色名（引擎默认色、其他阅读器写入的颜色也能归到某一档） */
export function colorFromHex(hex: unknown): EHighlightColor | null {
  if (typeof hex !== "string") return null;
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const exact = ALL_COLORS.find(c => COLOR_SPECS[c].pdfHex === hex.toLowerCase());
  if (exact) return exact;
  let best: EHighlightColor | null = null;
  let bestDistance = Infinity;
  for (const color of ALL_COLORS) {
    const target = hexToRgb(COLOR_SPECS[color].pdfHex);
    if (!target) continue;
    const distance = target.reduce((sum, v, i) => sum + (v - rgb[i]) ** 2, 0);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = color;
    }
  }
  return best;
}

/** 一条标注记录的颜色：区域标注看记录，文本标注看写进 PDF 的颜色，缺省为黄 */
export function annotationColor(record: PdfAnnotation): EHighlightColor {
  if (record.type === "area") return record.color ?? EHighlightColor.Yellow;
  const fromObject = colorFromHex((record.annotation as { color?: unknown }).color);
  return fromObject ?? record.color ?? EHighlightColor.Yellow;
}

/* ───────── 样式 ───────── */

export type MarkupStyle = "highlight" | "underline" | "squiggly" | "strikeout";

const SUBTYPE_STYLE: Partial<Record<PdfAnnotationSubtype, MarkupStyle>> = {
  [PdfAnnotationSubtype.HIGHLIGHT]: "highlight",
  [PdfAnnotationSubtype.UNDERLINE]: "underline",
  [PdfAnnotationSubtype.SQUIGGLY]: "squiggly",
  [PdfAnnotationSubtype.STRIKEOUT]: "strikeout",
};

export const STYLE_LABEL: Record<MarkupStyle, string> = {
  highlight: "高亮",
  underline: "下划线",
  squiggly: "波浪线",
  strikeout: "删除线",
};

export function markupStyleOf(annotation: PdfAnnotationObject): MarkupStyle | null {
  return SUBTYPE_STYLE[annotation.type as PdfAnnotationSubtype] ?? null;
}

export function isTextMarkup(annotation: PdfAnnotationObject): boolean {
  return markupStyleOf(annotation) !== null;
}

/** 新建只给高亮 / 下划线；返回写进 PDF 的对象字段 */
export function markupDefaults(style: "highlight" | "underline", color: EHighlightColor) {
  return style === "highlight"
    ? {
        type: PdfAnnotationSubtype.HIGHLIGHT,
        color: COLOR_SPECS[color].pdfHex,
        opacity: 1,
        blendMode: PdfBlendMode.Multiply,
      }
    : {
        type: PdfAnnotationSubtype.UNDERLINE,
        color: COLOR_SPECS[color].pdfHex,
        opacity: 1,
      };
}

/** 已有标注切换高亮 / 下划线的补丁（波浪线、删除线切换时一律转成高亮） */
export function toggleStylePatch(current: MarkupStyle): Partial<PdfAnnotationObject> {
  return current === "highlight"
    ? ({
        type: PdfAnnotationSubtype.UNDERLINE,
        blendMode: undefined,
      } as Partial<PdfAnnotationObject>)
    : ({
        type: PdfAnnotationSubtype.HIGHLIGHT,
        blendMode: PdfBlendMode.Multiply,
      } as Partial<PdfAnnotationObject>);
}

/* ───────── 摘录、页码、位置 ───────── */

/** 文本标注的原文：引擎写在 custom.text，旧数据写在 contents */
export function annotationText(annotation?: PdfAnnotationObject): string {
  if (!annotation) return "";
  const custom = annotation.custom as { text?: unknown } | undefined;
  const text = typeof custom?.text === "string" ? custom.text : (annotation.contents ?? "");
  return text.replace(/\s+/g, " ").trim();
}

export function annotationPage(record: PdfAnnotation): number {
  const index =
    record.type === "area" ? (record.areaData?.pageIndex ?? 0) : (record.annotation.pageIndex ?? 0);
  return index + 1;
}

export interface PageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 标注在页面上的矩形（PDF 坐标，未乘缩放） */
export function annotationRect(record: PdfAnnotation): PageRect | null {
  if (record.type === "area") return record.areaData?.rect ?? null;
  const rect = record.annotation.rect;
  if (!rect) return null;
  return { x: rect.origin.x, y: rect.origin.y, width: rect.size.width, height: rect.size.height };
}

export function noteText(record: PdfAnnotation): string {
  const first = record.notes?.[0]?.note;
  return first ? richTextPlainText(first).trim() : "";
}

export function hasNote(record: PdfAnnotation): boolean {
  return noteText(record).length > 0;
}

/** 列表 / 边注里展示的摘录 */
export function annotationSnippet(record: PdfAnnotation): string {
  if (record.type === "area") return `区域截图 · 第 ${annotationPage(record)} 页`;
  return annotationText(record.annotation) || `第 ${annotationPage(record)} 页标注`;
}

/** 按页、再按页内纵向位置排序 */
export function sortAnnotations(records: PdfAnnotation[]): PdfAnnotation[] {
  return [...records].sort((a, b) => {
    const page = annotationPage(a) - annotationPage(b);
    if (page !== 0) return page;
    return (annotationRect(a)?.y ?? 0) - (annotationRect(b)?.y ?? 0);
  });
}

export type AnnotationFilter = "all" | "notes" | EHighlightColor;

export function filterAnnotations(
  records: PdfAnnotation[],
  filter: AnnotationFilter
): PdfAnnotation[] {
  if (filter === "all") return records;
  if (filter === "notes") return records.filter(hasNote);
  return records.filter(record => annotationColor(record) === filter);
}

/* ───────── 页边图钉 ───────── */

export interface PinSlot {
  record: PdfAnnotation;
  /** 页内纵向位置（已乘缩放，像素） */
  top: number;
}

/** 同一页的笔记图钉：对齐到标注顶端，挤在一起时向下错开 */
export function layoutPins(records: PdfAnnotation[], scale: number, pinSize: number, gap = 4) {
  const slots: PinSlot[] = [];
  let lastBottom = -Infinity;
  for (const record of sortAnnotations(records)) {
    const rect = annotationRect(record);
    if (!rect) continue;
    const top = Math.max(rect.y * scale, lastBottom + gap);
    slots.push({ record, top });
    lastBottom = top + pinSize;
  }
  return slots;
}

/* ───────── 对话引用 ───────── */

export interface PdfQuote {
  kind: "selection" | "annotation" | "area";
  pageNumber: number;
  text: string;
  /** 区域截图（已上传的地址） */
  imageUrl?: string;
}

export function quoteSource(quote: PdfQuote): string {
  const kind = quote.kind === "area" ? "区域截图" : quote.kind === "annotation" ? "标注" : "选区";
  return `第 ${quote.pageNumber} 页 · ${kind}`;
}

/** 把引用并入用户消息：原文作为引用块放在问题前面，截图作为图片附件 */
export function applyQuote(content: MessageContentItem[], quote: PdfQuote): MessageContentItem[] {
  const quoteLines = [
    `> ${quoteSource(quote)}`,
    ...(quote.text ? quote.text.split(/\n+/).map(line => `> ${line}`) : []),
  ].join("\n");
  const textIndex = content.findIndex(item => item.type === "text");
  const next = [...content];
  if (textIndex >= 0) {
    const item = next[textIndex] as Extract<MessageContentItem, { type: "text" }>;
    next[textIndex] = { ...item, text: `${quoteLines}\n\n${item.text}` };
  } else {
    next.unshift({ type: "text", text: quoteLines });
  }
  if (quote.imageUrl) {
    next.push({ type: "image", image: quote.imageUrl, path: quote.imageUrl });
  }
  return next;
}
