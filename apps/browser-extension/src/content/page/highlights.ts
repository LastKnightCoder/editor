/**
 * 高亮渲染：CSS Custom Highlight API，不改页面 DOM（不会打乱 React / Vue 页面）。
 * 每种颜色注册一个 Highlight；::highlight 样式必须写在页面文档里（shadow root 内的不生效）。
 * 颜色是用户选的内容色，取编辑器行内色板的浅色取值，不随主题变化。
 */
import { HIGHLIGHT_COLORS, type HighlightColor } from "@tau/shared/browser-companion";

/** 与编辑器 INLINE_PALETTE 浅色一致；高亮 = 同色相淡底 + 底线 */
export const HIGHLIGHT_HEX: Record<HighlightColor, string> = {
  yellow: "#dc9b04",
  green: "#2ea121",
  blue: "#245bdb",
  purple: "#6425d0",
  red: "#e33a32",
};

const alpha = (hex: string, percent: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${percent / 100})`;
};

const nameOf = (color: HighlightColor) => `tau-hl-${color}`;
const FLASH = "tau-hl-flash";
const STYLE_ID = "tau-companion-highlights";

export const highlightSupported = () =>
  typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight === "function";

export class HighlightLayer {
  private readonly layers = new Map<HighlightColor, Highlight>();
  private flash: Highlight | null = null;

  constructor(private readonly doc: Document = document) {
    if (!highlightSupported()) return;
    for (const color of HIGHLIGHT_COLORS) {
      const highlight = new Highlight();
      this.layers.set(color, highlight);
      CSS.highlights.set(nameOf(color), highlight);
    }
    this.flash = new Highlight();
    this.flash.priority = 1;
    CSS.highlights.set(FLASH, this.flash);
    if (!doc.getElementById(STYLE_ID)) {
      const style = doc.createElement("style");
      style.id = STYLE_ID;
      style.textContent = [
        ...HIGHLIGHT_COLORS.map(
          color =>
            `::highlight(${nameOf(color)}){background-color:${alpha(HIGHLIGHT_HEX[color], 22)};text-decoration:underline 2px ${alpha(HIGHLIGHT_HEX[color], 70)};text-underline-offset:3px}`
        ),
        `::highlight(${FLASH}){background-color:${alpha(HIGHLIGHT_HEX.yellow, 45)}}`,
      ].join("\n");
      (doc.head ?? doc.documentElement).append(style);
    }
  }

  /** 整体重画：标注不多（单页上限 5000），直接按当前集合重建 */
  render(items: Array<{ color: HighlightColor; range: Range }>): void {
    for (const layer of this.layers.values()) layer.clear();
    for (const item of items) this.layers.get(item.color)?.add(item.range);
  }

  /** 定位后短暂加亮，让人看清是哪一处 */
  pulse(range: Range, durationMs = 1400): void {
    if (!this.flash) return;
    this.flash.clear();
    this.flash.add(range);
    setTimeout(() => this.flash?.delete(range), durationMs);
  }

  dispose(): void {
    if (!highlightSupported()) return;
    for (const color of HIGHLIGHT_COLORS) CSS.highlights.delete(nameOf(color));
    CSS.highlights.delete(FLASH);
    this.doc.getElementById(STYLE_ID)?.remove();
  }
}

/** 点击位置命中的文本点（Highlight API 没有事件，靠点位比对 Range） */
export function caretAt(
  doc: Document,
  x: number,
  y: number
): { node: Node; offset: number } | null {
  const withPosition = doc as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const position = withPosition.caretPositionFromPoint?.(x, y);
  if (position) return { node: position.offsetNode, offset: position.offset };
  const range = withPosition.caretRangeFromPoint?.(x, y);
  return range ? { node: range.startContainer, offset: range.startOffset } : null;
}

export function rangeContainsPoint(range: Range, point: { node: Node; offset: number }): boolean {
  try {
    return range.isPointInRange(point.node, point.offset) && !range.collapsed;
  } catch {
    return false;
  }
}
