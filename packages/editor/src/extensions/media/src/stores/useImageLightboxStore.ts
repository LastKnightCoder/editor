import { create } from "zustand";
import type { Descendant, Editor, Element } from "slate";

import { getElementResources } from "@tau/editor/api";
import {
  forEachContentResource,
  type ContentResourceDeclarations,
} from "@tau/db-schema/content-resources";

/** 灯箱里的一张图：来源节点 + 节点内序号（画廊的第几张），用于从点击处定位 */
export interface LightboxItem {
  url: string;
  alt: string;
  caption?: string;
  source: Element;
  sourceIndex: number;
}

export const fileNameOfUrl = (url: string) => {
  const name = url.split(/[?#]/)[0].split(/[\\/]/).filter(Boolean).pop() ?? "";
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
};

/**
 * 按文档顺序收集所有可预览的图片：按节点的资源声明取 kind 为 image 的资源，
 * 有显示版本（裁剪结果）时显示它；sourceIndex 是该节点里第几个图片位置。
 */
export function collectDocumentImages(
  nodes: readonly Descendant[],
  declarations: ContentResourceDeclarations
): LightboxItem[] {
  const items: LightboxItem[] = [];
  const counters = new Map<object, number>();
  forEachContentResource(nodes, declarations, ({ node, slot }) => {
    const { spec, owner, field } = slot;
    if (spec.kind !== "image") return;
    // 序号按资源位置计（含空地址），与节点里的数组下标一致
    const sourceIndex = counters.get(node) ?? 0;
    counters.set(node, sourceIndex + 1);
    const url = owner[field];
    if (typeof url !== "string" || !url) return;
    const text = (key?: string) => {
      const value = key ? owner[key] : undefined;
      return typeof value === "string" && value ? value : undefined;
    };
    items.push({
      url: text(spec.preview) ?? url,
      alt: text(spec.alt) ?? fileNameOfUrl(url),
      caption: text(spec.caption),
      source: node as unknown as Element,
      sourceIndex,
    });
  });
  return items;
}

interface LightboxState {
  /** 打开灯箱的编辑器：同屏多个编辑器时只由它渲染 */
  editor: Editor | null;
  items: LightboxItem[];
  index: number;
  open: (editor: Editor, source: Element, sourceIndex?: number) => void;
  setIndex: (index: number) => void;
  close: () => void;
}

export const useImageLightboxStore = create<LightboxState>(set => ({
  editor: null,
  items: [],
  index: 0,
  open: (editor, source, sourceIndex = 0) => {
    const items = collectDocumentImages(editor.children, getElementResources(editor));
    if (items.length === 0) return;
    const index = items.findIndex(
      item => item.source === source && item.sourceIndex === sourceIndex
    );
    set({ editor, items, index: Math.max(0, index) });
  },
  setIndex: index =>
    set(state => ({ index: Math.min(state.items.length - 1, Math.max(0, index)) })),
  close: () => set({ editor: null, items: [], index: 0 }),
}));

/** 打开灯箱并定位到点击的图片（画廊传第几张） */
export const openImageLightbox = (editor: Editor, source: Element, sourceIndex?: number) =>
  useImageLightboxStore.getState().open(editor, source, sourceIndex);
