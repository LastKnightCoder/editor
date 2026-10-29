import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { Node, type Descendant } from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Editor, createEditorKit, type EditorRef } from "@tau/editor";
import {
  dictationPreviewExtension,
  getDictationPreview,
  setDictationPreview,
  splitPreviewText,
} from "../dictationPreview";

const roots: Array<{ root: Root; container: HTMLElement }> = [];
afterEach(async () => {
  for (const { root, container } of roots.splice(0)) {
    await act(async () => root.unmount());
    container.remove();
  }
});

const value: Descendant[] = [
  { type: "paragraph", children: [{ type: "formatted", text: "开头结尾" }] } as never,
];

const mount = async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push({ root, container });
  const ref = createRef<EditorRef>();
  const kit = createEditorKit({ extensions: [dictationPreviewExtension] });
  await act(async () => {
    root.render(
      <DndProvider backend={HTML5Backend}>
        <Editor ref={ref} kit={kit} readonly={false} initValue={value} />
      </DndProvider>
    );
  });
  return { container, editor: ref.current!.getEditor() };
};

const docText = (children: Descendant[]) => children.map(node => Node.string(node)).join("\n");

describe("splitPreviewText", () => {
  it("末尾 6 字为尾句，其余为定稿", () => {
    expect(splitPreviewText("今天天气不错我们出去走走")).toEqual({
      stable: "今天天气不错",
      tail: "我们出去走走",
    });
  });

  it("不足尾句长度时全部为尾句", () => {
    expect(splitPreviewText("你好")).toEqual({ stable: "", tail: "你好" });
    expect(splitPreviewText("")).toEqual({ stable: "", tail: "" });
  });

  it("支持自定义尾句长度", () => {
    expect(splitPreviewText("abcdef", 2)).toEqual({ stable: "abcd", tail: "ef" });
    expect(splitPreviewText("abc", 0)).toEqual({ stable: "abc", tail: "" });
  });
});

describe("dictationPreviewExtension", () => {
  it("在插入点渲染预览，尾句单独包裹，且不写入文档", async () => {
    const { container, editor } = await mount();
    const before = JSON.stringify(editor.children);
    await act(async () => {
      setDictationPreview(editor, {
        point: { path: [0, 0], offset: 2 },
        stable: "中间",
        tail: "补充",
        cancel: false,
      });
    });
    const preview = container.querySelector<HTMLElement>("[data-dictation-preview]");
    expect(preview).toBeTruthy();
    expect(preview?.textContent).toBe("中间补充");
    expect(preview?.getAttribute("contenteditable")).toBe("false");
    expect(preview?.classList.contains("is-cancel")).toBe(false);
    expect(preview?.querySelector(".dictation-preview-tail")?.textContent).toBe("补充");
    expect(getDictationPreview(editor)?.stable).toBe("中间");
    expect(JSON.stringify(editor.children)).toBe(before);
    expect(docText(editor.children)).toBe("开头结尾");
  });

  it("cancel=true 时带 is-cancel，设为 null 后消失", async () => {
    const { container, editor } = await mount();
    const point = { path: [0, 0], offset: 4 };
    await act(async () => {
      setDictationPreview(editor, { point, stable: "", tail: "取消", cancel: true });
    });
    expect(container.querySelector("[data-dictation-preview]")?.classList).toContain("is-cancel");

    await act(async () => setDictationPreview(editor, null));
    expect(container.querySelector("[data-dictation-preview]")).toBeNull();
    expect(getDictationPreview(editor)).toBeNull();
    expect(docText(editor.children)).toBe("开头结尾");
  });
});
