import { afterEach, describe, expect, it } from "vitest";
import type { Descendant, Editor } from "slate";

import {
  collectDocumentImages,
  openImageLightbox,
  useImageLightboxStore,
} from "../useImageLightboxStore";

const text = (value = "") => ({ type: "formatted", text: value });

const image = (url: string, extra: Record<string, unknown> = {}) => ({
  type: "image",
  url,
  children: [text()],
  ...extra,
});

const gallery = {
  type: "image-gallery",
  mode: 1,
  images: [
    { id: "a", url: "g1.png", desc: "营地的清晨" },
    { id: "b", url: "" },
    { id: "c", url: "g3.png" },
  ],
  children: [text()],
};

const inline = { type: "inline-image", url: "~/notes/icon.png", uuid: "u1", children: [text()] };

const doc = [
  image("a.png", { previewUrl: "a-cropped.png", description: "傍晚的山谷" }),
  { type: "paragraph", children: [text("前"), inline, text("后")] },
  image(""),
  gallery,
  { type: "blockquote", children: [image("quoted.png", { alt: "引用里的图" })] },
] as unknown as Descendant[];

afterEach(() => useImageLightboxStore.getState().close());

describe("collectDocumentImages", () => {
  it("按文档顺序收集图片块、行内图片、画廊每一张与嵌套块里的图，跳过空地址", () => {
    const items = collectDocumentImages(doc);
    expect(items.map(item => item.url)).toEqual([
      "a-cropped.png",
      "~/notes/icon.png",
      "g1.png",
      "g3.png",
      "quoted.png",
    ]);
  });

  it("图片块显示裁剪结果并带说明；没有替代文本时用文件名", () => {
    const [block, inlineItem, galleryItem] = collectDocumentImages(doc);
    expect(block).toMatchObject({ alt: "a.png", caption: "傍晚的山谷" });
    expect(inlineItem.alt).toBe("icon.png");
    expect(galleryItem).toMatchObject({ alt: "营地的清晨", caption: "营地的清晨" });
  });

  it("画廊的图记住在画廊里的原始序号", () => {
    const items = collectDocumentImages(doc).filter(item => item.source === gallery);
    expect(items.map(item => item.sourceIndex)).toEqual([0, 2]);
  });
});

describe("openImageLightbox", () => {
  const editor = { children: doc } as unknown as Editor;

  it("定位到点击的那张（画廊按序号）", () => {
    openImageLightbox(editor, gallery as never, 2);
    const state = useImageLightboxStore.getState();
    expect(state.editor).toBe(editor);
    expect(state.items[state.index].url).toBe("g3.png");
  });

  it("切换序号夹在范围内，关闭后清空", () => {
    openImageLightbox(editor, doc[0] as never);
    useImageLightboxStore.getState().setIndex(99);
    expect(useImageLightboxStore.getState().index).toBe(4);
    useImageLightboxStore.getState().close();
    expect(useImageLightboxStore.getState().items).toEqual([]);
  });

  it("文档里没有图片时不打开", () => {
    openImageLightbox({ children: [] } as unknown as Editor, doc[0] as never);
    expect(useImageLightboxStore.getState().editor).toBeNull();
  });
});
