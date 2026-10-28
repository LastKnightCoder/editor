import { act, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { EditorRef } from "@tau/editor";
import { createEditor, Editor, Node, Transforms, type Descendant } from "slate";
import { ReactEditor } from "slate-react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  canMentionAtSelection,
  captureContentMention,
  useContentMention,
  type ContentMentionRequest,
} from "../editorExtensions/useContentMention";

const target = { contentId: 10, contentType: "plugin-entity", contentTitle: "引用", refId: 2 };
const at = (offset: number) => ({ path: [0, 0], offset });

function editorWith(text: string) {
  const editor = createEditor();
  editor.isInline = node => ["content-link", "link"].includes(node.type);
  editor.children = [
    { type: "paragraph", children: [{ type: "formatted", text }] },
  ] as Descendant[];
  Transforms.select(editor, at(text.length));
  return editor;
}

beforeEach(() => {
  vi.spyOn(ReactEditor, "isReadOnly").mockReturnValue(false);
});
afterEach(() => {
  vi.restoreAllMocks();
});

it("只替换原@，范围前后新增文字均保留，取消保留输入", () => {
  const editor = editorWith("ab@cd");
  const request = captureContentMention(editor, { anchor: at(2), focus: at(3) }, () => true);
  Transforms.insertText(editor, "NEW", { at: at(3) });
  Transforms.insertText(editor, "BEFORE", { at: at(0) });
  expect(request.select(target)).toBe(true);
  expect(Node.string(editor)).toBe("BEFOREab引用NEWcd");
  expect(request.signal.aborted).toBe(true);
  expect(Editor.rangeRefs(editor).size).toBe(0);
  const cancelled = editorWith("@");
  const pending = captureContentMention(cancelled, { anchor: at(0), focus: at(1) }, () => true);
  pending.cancel();
  expect(pending.select(target)).toBe(false);
  expect(Node.string(cancelled)).toBe("@");
});

it("原@被替换或文档身份变化时拒绝选择，不删除后来输入", () => {
  const editor = editorWith("a@b");
  const request = captureContentMention(editor, { anchor: at(1), focus: at(2) }, () => true);
  Transforms.delete(editor, { at: { anchor: at(1), focus: at(2) } });
  Transforms.insertText(editor, "后来输入", { at: at(1) });
  expect(request.select(target)).toBe(false);
  expect(Node.string(editor)).toBe("a后来输入b");
  let documentKey: object = {};
  const original = documentKey;
  const other = editorWith("@");
  const pending = captureContentMention(
    other,
    { anchor: at(0), focus: at(1) },
    () => documentKey === original
  );
  documentKey = {};
  expect(pending.select(target)).toBe(false);
  expect(Node.string(other)).toBe("@");
});

it("变成只读后即使原@仍在也不能提交", () => {
  const editor = editorWith("@");
  const request = captureContentMention(editor, { anchor: at(0), focus: at(1) }, () => true);
  vi.mocked(ReactEditor.isReadOnly).mockReturnValue(true);
  expect(request.select(target)).toBe(false);
  expect(Node.string(editor)).toBe("@");
});

it.each(["code-block", "link", "content-link"])("%s 内不会触发@", type => {
  const editor = editorWith("");
  editor.children = [{ type, children: [{ type: "formatted", text: "" }] }] as Descendant[];
  expect(canMentionAtSelection(editor)).toBe(false);
});

it("行内代码、只读和展开选区不触发@", () => {
  const editor = editorWith("code");
  Transforms.setNodes(editor, { code: true } as never, { at: [0, 0] });
  expect(canMentionAtSelection(editor)).toBe(false);
  Transforms.unsetNodes(editor, "code", { at: [0, 0] });
  vi.mocked(ReactEditor.isReadOnly).mockReturnValue(true);
  expect(canMentionAtSelection(editor)).toBe(false);
  vi.mocked(ReactEditor.isReadOnly).mockReturnValue(false);
  Transforms.select(editor, { anchor: at(0), focus: at(2) });
  expect(canMentionAtSelection(editor)).toBe(false);
});

function Probe(props: Parameters<typeof useContentMention>[0]) {
  useContentMention(props);
  return null;
}

it("真实beforeinput触发选择器，中文输入法提交不误触，隐藏取消保留@", async () => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
  const host = document.createElement("div");
  const editable = document.createElement("div");
  editable.setAttribute("data-slate-editor", "true");
  editable.setAttribute("contenteditable", "true");
  document.body.append(host, editable);
  const root: Root = createRoot(host);
  const editor = editorWith("");
  const editorRef: RefObject<EditorRef | null> = {
    current: {
      getEditor: () => editor,
      getEditableElement: () => editable,
      focus: vi.fn(),
      deselect: vi.fn(),
      isFocus: () => true,
    },
  };
  const documentKey = {};
  const requests: ContentMentionRequest[] = [];
  const render = (enabled: boolean, key: unknown = documentKey) =>
    act(() =>
      root.render(
        <Probe
          editorRef={editorRef}
          documentKey={key}
          enabled={enabled}
          onRequest={request => requests.push(request)}
        />
      )
    );
  const input = (inputType = "insertText", isComposing = false) =>
    act(() => {
      editable.dispatchEvent(
        new InputEvent("beforeinput", { bubbles: true, inputType, data: "@", isComposing })
      );
      Transforms.insertText(editor, "@");
    });
  try {
    render(true);
    act(() => editable.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })));
    input();
    act(() =>
      editable.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "@" }))
    );
    input();
    act(() => vi.advanceTimersToNextFrame());
    expect(requests).toHaveLength(0);
    input("insertCompositionText");
    act(() => vi.advanceTimersToNextFrame());
    expect(requests).toHaveLength(0);
    input();
    act(() => vi.advanceTimersToNextFrame());
    expect(requests).toHaveLength(1);
    const text = Node.string(editor);
    render(false);
    expect(requests[0].signal.aborted).toBe(true);
    expect(requests[0].select(target)).toBe(false);
    expect(Node.string(editor)).toBe(text);
    render(true);
    input();
    render(true, {});
    act(() => vi.advanceTimersToNextFrame());
    expect(requests).toHaveLength(1);
  } finally {
    act(() => root.unmount());
    host.remove();
    editable.remove();
    vi.useRealTimers();
  }
});
