import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditor, Editor, Transforms, type Descendant } from "slate";
import { ReactEditor } from "slate-react";

import { getEditingContextKey, resolveEditingContext } from "../editingContext";

/** 图片 [0]、含行内图片的段落 [1]、视频 [2] */
function createMediaEditor(): Editor {
  const editor = createEditor();
  editor.isInline = element => (element as { type?: string }).type === "inline-image";
  editor.isVoid = element =>
    ["image", "inline-image", "video"].includes((element as { type?: string }).type ?? "");
  editor.children = [
    { type: "image", url: "a.png", children: [{ type: "formatted", text: "" }] },
    {
      type: "paragraph",
      children: [
        { type: "formatted", text: "前" },
        { type: "inline-image", url: "b.png", children: [{ type: "formatted", text: "" }] },
        { type: "formatted", text: "后" },
      ],
    },
    { type: "video", src: "c.mp4", children: [{ type: "formatted", text: "" }] },
  ] as unknown as Descendant[];
  return editor;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("媒体上下文识别", () => {
  it("选区折叠在块级媒体 void 内时给出 media 上下文", () => {
    const editor = createMediaEditor();
    Transforms.select(editor, Editor.start(editor, [0]));
    const context = resolveEditingContext(editor, null);
    expect(context).toMatchObject({ kind: "media", mediaType: "image", path: [0] });
    expect(getEditingContextKey(context)).toBe("media:0");

    Transforms.select(editor, Editor.start(editor, [2]));
    expect(resolveEditingContext(editor, null)).toMatchObject({ mediaType: "video", path: [2] });
  });

  it("行内图片取最内层的媒体节点", () => {
    const editor = createMediaEditor();
    Transforms.select(editor, Editor.start(editor, [1, 1]));
    expect(resolveEditingContext(editor, null)).toMatchObject({
      kind: "media",
      mediaType: "inline-image",
      path: [1, 1],
    });
  });

  it("展开选区优先于媒体，普通文字为通用模式", () => {
    const editor = createMediaEditor();
    Transforms.select(editor, {
      anchor: Editor.start(editor, [0]),
      focus: Editor.end(editor, [1]),
    });
    expect(resolveEditingContext(editor, null).kind).toBe("selection");
    Transforms.select(editor, { path: [1, 0], offset: 1 });
    expect(resolveEditingContext(editor, null).kind).toBe("text");
  });

  it("只读时不识别媒体", () => {
    const editor = createMediaEditor();
    Transforms.select(editor, Editor.start(editor, [0]));
    vi.spyOn(ReactEditor, "isReadOnly").mockReturnValue(true);
    expect(resolveEditingContext(editor, null).kind).toBe("text");
  });

  it("焦点在图片说明里时给出说明编辑上下文，与选区位置无关", () => {
    const editor = createMediaEditor();
    Transforms.select(editor, { path: [1, 0], offset: 0 });
    const elementDom = document.createElement("div");
    elementDom.setAttribute("data-slate-node", "element");
    elementDom.innerHTML = '<div data-media-caption="true"><div tabindex="0">说明</div></div>';
    document.body.appendChild(elementDom);
    vi.spyOn(ReactEditor, "toSlateNode").mockReturnValue(editor.children[0]);
    vi.spyOn(ReactEditor, "findPath").mockReturnValue([0]);
    const input = elementDom.querySelector<HTMLElement>("[tabindex]")!;
    input.focus();
    const context = resolveEditingContext(editor, document.activeElement);
    expect(context).toMatchObject({ kind: "media", mediaType: "image", captionEditing: true });
    expect(getEditingContextKey(context)).toBe("media:0:caption");
  });
});
