import type { CSSProperties } from "react";

export type PageMarginPreset = "narrow" | "medium" | "wide";

export const DEFAULT_PAGE_MARGIN: PageMarginPreset = "medium";

/** 右侧留白达到该像素值时，常驻大纲直接落在右留白内；低于此值收纳为 Popover 按钮 */
export const OUTLINE_MARGIN_MIN_WIDTH = 176;

/** 正文最小保底可读宽度：窄窗或打开停靠栏时，留白优先收缩让位 */
export const PAGE_MARGIN_MIN_TEXT_WIDTH = 540;

/** 最小呼吸留白下限：任何尺寸下都不贴死纸边 */
export const PAGE_MARGIN_FLOOR = 32;

export interface PageMarginSpec {
  readonly id: PageMarginPreset;
  /** 单侧留白占可用纸宽的理想比例（0~1） */
  readonly ratio: number;
  /** 大屏单侧留白上限（px），超出后余量全部归正文 */
  readonly cap: number;
}

export const PAGE_MARGIN_SPECS: readonly PageMarginSpec[] = [
  { id: "narrow", ratio: 0.06, cap: 80 },
  { id: "medium", ratio: 0.16, cap: 220 },
  { id: "wide", ratio: 0.22, cap: 280 },
];

export function normalizePageMargin(value: unknown): PageMarginPreset {
  if (value === "narrow" || value === "medium" || value === "wide") return value;
  return DEFAULT_PAGE_MARGIN;
}

export function getPageMarginSpec(preset: PageMarginPreset): PageMarginSpec {
  return PAGE_MARGIN_SPECS.find(item => item.id === preset) ?? PAGE_MARGIN_SPECS[1];
}

/**
 * 计算给定可用纸宽下的单侧留白像素值（与 CSS clamp 公式严格等价，供大纲常驻/收纳判定复用）。
 */
export function computePageMargin(paperWidth: number, preset: PageMarginPreset): number {
  const { ratio, cap } = getPageMarginSpec(preset);
  if (!Number.isFinite(paperWidth) || paperWidth <= 0) return PAGE_MARGIN_FLOOR;
  const maxForReadable = Math.max(PAGE_MARGIN_FLOOR, (paperWidth - PAGE_MARGIN_MIN_TEXT_WIDTH) / 2);
  const raw = Math.min(paperWidth * ratio, maxForReadable);
  return Math.round(Math.max(PAGE_MARGIN_FLOOR, Math.min(cap, raw)));
}

/** 给定纸面内宽与留白档位，判断右侧留白是否足以直接承载常驻大纲列 */
export function outlineFitsInPageMargin(paperWidth: number, preset: PageMarginPreset): boolean {
  return computePageMargin(paperWidth, preset) >= OUTLINE_MARGIN_MIN_WIDTH;
}

/** 将留白档位对应的 CSS 变量写入根节点，由所有纸面容器经 cqi 零 JS 实时响应 */
export function applyPageMargin(preset: PageMarginPreset): void {
  const { ratio, cap } = getPageMarginSpec(preset);
  const root = document.documentElement;
  root.style.setProperty("--tau-page-margin-ratio", `${Math.round(ratio * 100)}cqi`);
  root.style.setProperty("--tau-page-margin-cap", `${cap}px`);
}

/**
 * 纸面滚动视口（须带 `@container`）内可用的单侧留白 CSS 表达式：
 * 最小呼吸底线 32px，窄窗优先保底正文 540px，宽屏按档位封顶（80 / 220 / 280px）。
 */
export const PAGE_MARGIN_CSS = `clamp(${PAGE_MARGIN_FLOOR}px, min(var(--tau-page-margin-ratio, 16cqi), calc((100cqi - ${PAGE_MARGIN_MIN_TEXT_WIDTH}px) / 2)), var(--tau-page-margin-cap, 220px))`;

/** 严格对称三列布局（左留白 | 居中正文 | 右留白），常驻大纲落在第 3 列 */
export const SYMMETRIC_PAGE_GRID_STYLE: CSSProperties = {
  gridTemplateColumns: `${PAGE_MARGIN_CSS} minmax(0, 1fr) ${PAGE_MARGIN_CSS}`,
};

/** 仅需左右对称留白的单列场景（页头对齐、卡片详情、视频笔记等） */
export const PAGE_MARGIN_INLINE_STYLE: CSSProperties = {
  paddingInline: PAGE_MARGIN_CSS,
};
