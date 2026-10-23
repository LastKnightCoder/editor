import { describe, expect, it, vi } from "vitest";
import { createEditor, Editor, Transforms, type Descendant } from "slate";

import type { MediaEditingContext } from "../editingContext";
import {
  convertInlineImageToBlock,
  cycleMediaAlign,
  deleteMedia,
  getImageAppearanceState,
  getInlineImageSize,
  placeCaretAfterMedia,
  setImageAppearance,
  setInlineImageSize,
} from "../mediaActions";

const VOID_TYPES = ["image", "inline-image", "video", "audio", "webview"];

function createMediaEditor(children: unknown[]): Editor {
  const editor = createEditor();
  editor.isInline = element => (element as { type?: string }).type === "inline-image";
  editor.isVoid = element => VOID_TYPES.includes((element as { type?: string }).type ?? "");
  editor.children = children as Descendant[];
  return editor;
}

const voidNode = (type: string, extra: Record<string, unknown> = {}) => ({
  type,
  ...extra,
  children: [{ type: "formatted", text: "" }],
});
const paragraph = (text: string) => ({
  type: "paragraph",
  children: [{ type: "formatted", text }],
});

function contextAt(editor: Editor, path: number[]): MediaEditingContext {
  const [element] = Editor.node(editor, path);
  return {
    kind: "media",
    mediaType: (element as { type: MediaEditingContext["mediaType"] }).type,
    element: element as MediaEditingContext["element"],
    path,
    captionEditing: false,
  };
}

describe("placeCaretAfterMedia", () => {
  it("下一块是文本块时落到它的开头", () => {
    const editor = createMediaEditor([voidNode("image"), paragraph("正文")]);
    placeCaretAfterMedia(editor, contextAt(editor, [0]));
    expect(editor.selection?.anchor).toEqual({ path: [1, 0], offset: 0 });
    expect(editor.children).toHaveLength(2);
  });

  it("下一块是 void 或不存在时插入空段落", () => {
    const editor = createMediaEditor([voidNode("image"), voidNode("video")]);
    placeCaretAfterMedia(editor, contextAt(editor, [0]));
    expect(editor.children).toHaveLength(3);
    expect((editor.children[1] as { type: string }).type).toBe("paragraph");
    expect(editor.selection?.anchor.path).toEqual([1, 0]);

    placeCaretAfterMedia(editor, contextAt(editor, [2]));
    expect(editor.children).toHaveLength(4);
    expect(editor.selection?.anchor.path).toEqual([3, 0]);
  });

  it("行内图片落到它后面", () => {
    const editor = createMediaEditor([
      {
        type: "paragraph",
        children: [
          { type: "formatted", text: "前" },
          voidNode("inline-image", { url: "a.png" }),
          { type: "formatted", text: "后" },
        ],
      },
    ]);
    placeCaretAfterMedia(editor, contextAt(editor, [0, 1]));
    expect(editor.selection?.anchor).toEqual({ path: [0, 2], offset: 0 });
  });
});

describe("行内图片", () => {
  const inlineEditor = (width?: number, height?: number) =>
    createMediaEditor([
      {
        type: "paragraph",
        children: [
          { type: "formatted", text: "前" },
          voidNode("inline-image", { url: "a.png", alt: "图", width, height }),
          { type: "formatted", text: "后" },
        ],
      },
      paragraph("下一段"),
    ]);

  it("三档高度按原比例设置宽度，并能识别当前档位", () => {
    const editor = inlineEditor(64, 32);
    setInlineImageSize(editor, contextAt(editor, [0, 1]), 2);
    const node = Editor.node(editor, [0, 1])[0] as { width: number; height: number };
    expect(node).toMatchObject({ width: 64, height: 32 });
    setInlineImageSize(editor, contextAt(editor, [0, 1]), 3);
    expect(Editor.node(editor, [0, 1])[0]).toMatchObject({ width: 96, height: 48 });
    expect(getInlineImageSize(contextAt(editor, [0, 1]))).toBe(3);
  });

  it("转为大图：在所在段落之后插入图片块并选中，行内节点移除", () => {
    const editor = inlineEditor();
    convertInlineImageToBlock(editor, contextAt(editor, [0, 1]));
    expect(editor.children).toHaveLength(3);
    expect(editor.children[1]).toMatchObject({ type: "image", url: "a.png", alt: "图" });
    expect(JSON.stringify(editor.children[0])).not.toContain("inline-image");
    expect(editor.selection?.anchor.path).toEqual([1, 0]);
  });

  it("删除直接移除行内节点", () => {
    const editor = inlineEditor();
    deleteMedia(editor, contextAt(editor, [0, 1]));
    expect(JSON.stringify(editor.children[0])).not.toContain("inline-image");
  });
});

describe("命令与外观", () => {
  it("对齐按 左 → 中 → 右 循环，经扩展命令写入", () => {
    const editor = createMediaEditor([voidNode("image", { align: "right" })]);
    const execute = vi.fn();
    (editor as unknown as { commands: { execute: typeof execute } }).commands = { execute };
    const context = contextAt(editor, [0]);
    cycleMediaAlign(editor, context);
    expect(execute).toHaveBeenCalledWith(
      "tau.image.set-align",
      { align: "left" },
      context.element,
      [0]
    );
  });

  it("块级媒体删除走内核删除命令", () => {
    const editor = createMediaEditor([voidNode("video")]);
    const execute = vi.fn();
    (editor as unknown as { commands: { execute: typeof execute } }).commands = { execute };
    deleteMedia(editor, contextAt(editor, [0]));
    expect(execute).toHaveBeenCalledWith("tau.block.delete", undefined, expect.anything(), [0]);
  });

  it("外观：未单独设置时跟随默认，「跟随设置」清除节点上的圆角与阴影", () => {
    const editor = createMediaEditor([voidNode("image", { borderRadius: "md", shadow: "none" })]);
    expect(getImageAppearanceState(contextAt(editor, [0]), undefined)).toEqual({
      rounded: true,
      shadow: false,
      followsDefault: false,
    });
    setImageAppearance(editor, contextAt(editor, [0]), "default");
    const context = contextAt(editor, [0]);
    expect(context.element).not.toHaveProperty("borderRadius");
    expect(getImageAppearanceState(context, { borderRadius: "sm", shadow: "md" })).toEqual({
      rounded: true,
      shadow: true,
      followsDefault: true,
    });
  });
});

it("节点已被替换时按元素引用重新定位，找不到就不操作", () => {
  const editor = createMediaEditor([paragraph("a"), voidNode("image")]);
  const context = contextAt(editor, [1]);
  Transforms.removeNodes(editor, { at: [0] });
  // 图片移到了 [0]，原路径失效
  placeCaretAfterMedia(editor, { ...context, path: [5] });
  expect(editor.children).toHaveLength(1);
});
