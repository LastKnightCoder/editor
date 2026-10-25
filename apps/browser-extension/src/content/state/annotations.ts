/**
 * 本页标注：锚点 ↔ Range 的维护、渲染与保存。Range 不进 store（不可序列化，DOM 变了会失效），
 * 只在这里按 id 缓存；store 里放可展示的标注列表与「找不到原文」的 id。
 */
import {
  HIGHLIGHT_COLORS,
  type HighlightColor,
  type WebAnnotation,
} from "@tau/shared/browser-companion";
import { anchorToRange, createAnchor } from "../page/anchor";
import { buildTextIndex, type TextIndex } from "../page/text-index";
import { caretAt, HighlightLayer, rangeContainsPoint } from "../page/highlights";
import { getState, setState } from "./store";

const randomId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(12)), byte =>
    byte.toString(16).padStart(2, "0")
  ).join("");

export class PageAnnotations {
  private index: TextIndex | null = null;
  private readonly ranges = new Map<string, Range>();
  private readonly layer: HighlightLayer;

  constructor(
    private readonly exclude: Element,
    private readonly persist: (items: WebAnnotation[]) => Promise<void>
  ) {
    this.layer = new HighlightLayer(document);
  }

  private textIndex(): TextIndex {
    return (this.index ??= buildTextIndex(document.body, this.exclude));
  }

  /** 页面结构变化后重建索引并重新定位全部标注 */
  relocate(): void {
    this.index = null;
    const index = this.textIndex();
    this.ranges.clear();
    const unlocated: string[] = [];
    for (const item of getState().annotations) {
      // 没有锚点（早期划线）时按原文在页面里找
      const anchor = item.anchor ?? {
        quote: { exact: item.text, prefix: "", suffix: "" },
        position: { start: -1, end: -1 },
      };
      const range = anchorToRange(index, anchor);
      if (range) this.ranges.set(item.id, range);
      else unlocated.push(item.id);
    }
    setState(state => ({
      unlocated,
      annotations: this.sortByPosition(state.annotations),
      layoutVersion: state.layoutVersion + 1,
    }));
    this.render();
  }

  replaceAll(items: WebAnnotation[]): void {
    setState({ annotations: items });
    this.relocate();
  }

  private render(): void {
    this.layer.render(
      getState()
        .annotations.filter(item => this.ranges.has(item.id))
        .map(item => ({ color: item.color, range: this.ranges.get(item.id)! }))
    );
  }

  private sortByPosition(items: WebAnnotation[]): WebAnnotation[] {
    const position = (item: WebAnnotation) => {
      const range = this.ranges.get(item.id);
      return range ? (item.anchor?.position.start ?? 0) : Number.MAX_SAFE_INTEGER;
    };
    return [...items].sort((a, b) => position(a) - position(b));
  }

  create(range: Range, color: HighlightColor, note = ""): WebAnnotation | null {
    const anchor = createAnchor(this.textIndex(), range);
    if (!anchor || !anchor.quote.exact.trim()) return null;
    const item: WebAnnotation = {
      id: randomId(),
      color,
      text: anchor.quote.exact.replace(/\s+/g, " ").trim(),
      note,
      anchor,
      createdAt: Date.now(),
    };
    const located = anchorToRange(this.textIndex(), anchor);
    if (located) this.ranges.set(item.id, located);
    setState(state => ({
      annotations: this.sortByPosition([...state.annotations, item]),
      layoutVersion: state.layoutVersion + 1,
    }));
    this.render();
    void this.save();
    return item;
  }

  update(id: string, patch: Partial<Pick<WebAnnotation, "color" | "note">>): void {
    if (patch.color && !HIGHLIGHT_COLORS.includes(patch.color)) return;
    setState(state => ({
      annotations: state.annotations.map(item => (item.id === id ? { ...item, ...patch } : item)),
      layoutVersion: state.layoutVersion + 1,
    }));
    this.render();
    void this.save();
  }

  remove(id: string): void {
    this.ranges.delete(id);
    setState(state => ({
      annotations: state.annotations.filter(item => item.id !== id),
      unlocated: state.unlocated.filter(item => item !== id),
      selection: state.selection?.annotationId === id ? null : state.selection,
      pinnedNoteId: state.pinnedNoteId === id ? null : state.pinnedNoteId,
      editingNoteId: state.editingNoteId === id ? null : state.editingNoteId,
      layoutVersion: state.layoutVersion + 1,
    }));
    this.render();
    void this.save();
  }

  private save(): Promise<void> {
    return this.persist(getState().annotations).catch(() => {});
  }

  rangeOf(id: string): Range | undefined {
    return this.ranges.get(id);
  }

  /** 点击处命中的标注（后加的在上面） */
  hitTest(x: number, y: number): string | null {
    const point = caretAt(document, x, y);
    if (!point) return null;
    const items = getState().annotations;
    for (let i = items.length - 1; i >= 0; i -= 1) {
      const range = this.ranges.get(items[i].id);
      if (range && rangeContainsPoint(range, point)) {
        // caret 落在高亮之后的同一点也会命中，再用矩形确认
        const inside = [...range.getClientRects()].some(
          rect => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
        );
        if (inside) return items[i].id;
      }
    }
    return null;
  }

  scrollTo(id: string): void {
    const range = this.ranges.get(id);
    if (!range) return;
    const element = range.startContainer.parentElement;
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
    this.layer.pulse(range);
  }

  pulse(range: Range): void {
    this.layer.pulse(range);
  }

  dispose(): void {
    this.layer.dispose();
  }
}
