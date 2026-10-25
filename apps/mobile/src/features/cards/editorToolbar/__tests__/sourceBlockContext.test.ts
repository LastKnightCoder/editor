import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditor, Editor, Transforms, type Descendant } from "slate";
import { ReactEditor } from "slate-react";
import { PenTool } from "lucide-react";
import type { PreviewEditorActions } from "@tau/editor-source-view/menu";

const registered = vi.hoisted(() => new Map<unknown, unknown>());
vi.mock("@tau/editor-source-view/menu", () => ({
  getPreviewEditorActions: (element: unknown) => registered.get(element),
}));

import { getEditingContextKey, resolveEditingContext } from "../editingContext";

/** 段落 [0]、TikZ 源码块 [1]、未登记动作的 void [2] */
function createSourceEditor(): Editor {
  const editor = createEditor();
  editor.isVoid = element => (element as { type?: string }).type !== "paragraph";
  editor.children = [
    { type: "paragraph", children: [{ type: "formatted", text: "前" }] },
    { type: "tikz", content: "\\draw", children: [{ type: "formatted", text: "" }] },
    { type: "unknown-void", children: [{ type: "formatted", text: "" }] },
  ] as unknown as Descendant[];
  return editor;
}

const actions = (): PreviewEditorActions => ({
  title: "TikZ",
  icon: PenTool,
  edit: vi.fn(),
  copySource: vi.fn(),
  readOnly: false,
});

afterEach(() => {
  registered.clear();
  vi.restoreAllMocks();
});

describe("源码块上下文识别", () => {
  it("选区折叠在登记了动作的块内时给出 source-block，带块登记的动作", () => {
    const editor = createSourceEditor();
    const tikz = actions();
    registered.set(editor.children[1], tikz);
    Transforms.select(editor, Editor.start(editor, [1]));
    const context = resolveEditingContext(editor, null);
    expect(context).toMatchObject({ kind: "source-block", path: [1] });
    expect(context.kind === "source-block" && context.actions).toBe(tikz);
    expect(getEditingContextKey(context)).toBe("source-block:1");
  });

  it("未登记动作的 void、展开选区、只读编辑器都不识别", () => {
    const editor = createSourceEditor();
    registered.set(editor.children[1], actions());
    Transforms.select(editor, Editor.start(editor, [2]));
    expect(resolveEditingContext(editor, null).kind).toBe("text");

    Transforms.select(editor, {
      anchor: Editor.start(editor, [0]),
      focus: Editor.end(editor, [1]),
    });
    expect(resolveEditingContext(editor, null).kind).toBe("selection");

    Transforms.select(editor, Editor.start(editor, [1]));
    vi.spyOn(ReactEditor, "isReadOnly").mockReturnValue(true);
    expect(resolveEditingContext(editor, null).kind).toBe("text");
  });

  it("块节点被替换后按新节点重新登记的动作识别", () => {
    const editor = createSourceEditor();
    Transforms.setNodes(editor, { content: "\\fill" } as never, { at: [1] });
    registered.set(editor.children[1], actions());
    Transforms.select(editor, Editor.start(editor, [1]));
    expect(resolveEditingContext(editor, null).kind).toBe("source-block");
  });
});
