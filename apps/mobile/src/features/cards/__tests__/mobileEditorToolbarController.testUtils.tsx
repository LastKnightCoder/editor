import { act, useEffect, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { vi } from "vitest";
import type { EditorRef } from "@tau/editor";
import { Editor, Element, createEditor, type BaseSelection, type Descendant } from "slate";
import { ReactEditor } from "slate-react";
import {
  useMobileEditorToolbarController,
  type MobileEditorToolbarController,
} from "../editorToolbar/useMobileEditorToolbarController";

/** useMobileEditorToolbarController 各分主题测试文件共用的 setup 与 fixture（vi.mock 仍留在各测试文件顶层） */

export function createEditorRef(
  editor: Editor,
  options?: {
    isFocus?: () => boolean;
  }
): RefObject<EditorRef | null> {
  const ref: EditorRef = {
    focus: vi.fn(),
    deselect: vi.fn(),
    getEditor: () => editor,
    getEditableElement: () => null,
    isFocus: vi.fn(() => options?.isFocus?.() ?? true),
  };
  return {
    current: ref,
  };
}

export function createFormattedEditor(
  text = "hello world",
  selection: BaseSelection = {
    anchor: { path: [0, 0], offset: 0 },
    focus: { path: [0, 0], offset: Math.min(5, text.length) },
  }
): Editor {
  const editor = createEditor();
  editor.children = [
    {
      type: "paragraph",
      children: [
        {
          type: "formatted",
          text,
        },
      ],
    },
  ] as unknown as Descendant[];
  editor.selection = selection;
  return editor;
}

export function createContentLinkEditor(): Editor {
  const editor = createEditor();
  editor.children = [
    {
      type: "paragraph",
      children: [
        {
          type: "content-link",
          contentId: 100,
          contentType: "card",
          contentTitle: "引用内容",
          refId: 12,
          children: [{ type: "formatted", text: "引用" }],
        },
      ],
    },
  ] as unknown as Descendant[];
  editor.selection = {
    anchor: { path: [0, 0, 0], offset: 0 },
    focus: { path: [0, 0, 0], offset: 2 },
  };
  return editor;
}

export function createListEditor(
  listType: "bulleted-list" | "check-list",
  selection: BaseSelection
): Editor {
  const itemType = listType === "check-list" ? "check-list-item" : "list-item";
  const editor = createEditor();
  editor.children = [
    {
      type: listType,
      children: ["第一项", "第二项"].map(text => ({
        type: itemType,
        children: [{ type: "paragraph", children: [{ type: "formatted", text }] }],
      })),
    },
  ] as unknown as Descendant[];
  editor.selection = selection;
  return editor;
}

export function ControllerProbe(props: {
  editorRef: RefObject<EditorRef | null>;
  onController: (controller: MobileEditorToolbarController) => void;
}) {
  const controller = useMobileEditorToolbarController({
    editorRef: props.editorRef,
  });
  useEffect(() => {
    props.onController(controller);
  }, [controller, props]);
  return null;
}

export function hasContentLinkNode(editor: Editor): boolean {
  const [entry] = Editor.nodes(editor, {
    at: [],
    match: node =>
      !Editor.isEditor(node) &&
      Element.isElement(node) &&
      (node as { type?: string }).type === "content-link",
  });
  return !!entry;
}

export function hasNodeType(editor: Editor, type: string): boolean {
  const [entry] = Editor.nodes(editor, {
    at: [],
    match: node =>
      !Editor.isEditor(node) &&
      Element.isElement(node) &&
      (node as { type?: string }).type === type,
  });
  return !!entry;
}

export function requireController(
  controller: MobileEditorToolbarController | null
): MobileEditorToolbarController {
  if (!controller) {
    throw new Error("controller 未初始化");
  }
  return controller;
}

export function setupToolbarControllerHost(): Root {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  vi.spyOn(ReactEditor, "focus").mockImplementation(() => {});
  vi.spyOn(ReactEditor, "isFocused").mockReturnValue(false);
  vi.spyOn(ReactEditor, "blur").mockImplementation(() => {});
  // 底部面板延迟一拍挂载（openSheetNextTick），用 fake timer 同步推进断言
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  return root;
}

export function teardownToolbarControllerHost(root: Root): void {
  act(() => {
    root.unmount();
  });
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.restoreAllMocks();
}

export function renderControllerOn(
  root: Root,
  editor: Editor
): () => MobileEditorToolbarController {
  const editorRef = createEditorRef(editor);
  let latestController: MobileEditorToolbarController | null = null;
  act(() => {
    root.render(
      <ControllerProbe
        editorRef={editorRef}
        onController={controller => {
          latestController = controller;
        }}
      />
    );
  });
  return () => requireController(latestController);
}
