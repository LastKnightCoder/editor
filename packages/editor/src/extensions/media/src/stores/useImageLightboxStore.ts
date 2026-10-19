import { create } from "zustand";
import type { Descendant, Editor, Element } from "slate";

import type { ImageElement, ImageGalleryElement, InlineImageElement } from "../types";

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

/** 按文档顺序收集所有可预览的图片：图片块（显示裁剪结果）、画廊每一张、行内图片 */
export function collectDocumentImages(nodes: readonly Descendant[]): LightboxItem[] {
  const items: LightboxItem[] = [];
  const walk = (children: readonly Descendant[]) => {
    for (const node of children) {
      if (!("type" in node)) continue;
      if (node.type === "image") {
        const image = node as ImageElement;
        if (image.url) {
          items.push({
            url: image.previewUrl || image.url,
            alt: image.alt || fileNameOfUrl(image.url),
            caption: image.description || undefined,
            source: image,
            sourceIndex: 0,
          });
        }
        continue;
      }
      if (node.type === "image-gallery") {
        (node as ImageGalleryElement).images.forEach((item, index) => {
          if (item.url) {
            items.push({
              url: item.url,
              alt: item.desc || fileNameOfUrl(item.url),
              caption: item.desc || undefined,
              source: node as Element,
              sourceIndex: index,
            });
          }
        });
        continue;
      }
      if (node.type === "inline-image") {
        const image = node as InlineImageElement;
        if (image.url) {
          items.push({
            url: image.url,
            alt: image.alt || fileNameOfUrl(image.url),
            source: image,
            sourceIndex: 0,
          });
        }
        continue;
      }
      if ("children" in node && Array.isArray(node.children)) {
        walk(node.children as Descendant[]);
      }
    }
  };
  walk(nodes);
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
    const items = collectDocumentImages(editor.children);
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
