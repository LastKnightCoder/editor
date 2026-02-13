import { act, useEffect, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorRef } from "@tau/editor/src";
import {
  Editor,
  Element,
  Range,
  Text,
  createEditor,
  type BaseSelection,
  type Descendant,
} from "slate";
import { ReactEditor } from "slate-react";

import type { ContentLinkPickerResult } from "../editorExtensions/ContentLinkPickerSheet";
import {
  useMobileEditorToolbarController,
  type MobileEditorToolbarController,
} from "../editorToolbar/useMobileEditorToolbarController";

function createEditorRef(
  editor: Editor,
  options?: {
    isFocus?: () => boolean;
  },
): RefObject<EditorRef | null> {
  const ref: EditorRef = {
    focus: vi.fn(),
    deselect: vi.fn(),
    setEditorValue: vi.fn(),
    getEditor: () => editor,
    scrollHeaderIntoView: vi.fn(),
    isFocus: vi.fn(() => options?.isFocus?.() ?? true),
  };
  return {
    current: ref,
  };
}

function createFormattedEditor(
  text = "hello world",
  selection: BaseSelection = {
    anchor: { path: [0, 0], offset: 0 },
    focus: { path: [0, 0], offset: Math.min(5, text.length) },
  },
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

function createContentLinkEditor(): Editor {
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

function ControllerProbe(props: {
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

function hasContentLinkNode(editor: Editor): boolean {
  const [entry] = Editor.nodes(editor, {
    at: [],
    match: (node) =>
      !Editor.isEditor(node) &&
      Element.isElement(node) &&
      (node as { type?: string }).type === "content-link",
  });
  return !!entry;
}

function hasNodeType(editor: Editor, type: string): boolean {
  const [entry] = Editor.nodes(editor, {
    at: [],
    match: (node) =>
      !Editor.isEditor(node) &&
      Element.isElement(node) &&
      (node as { type?: string }).type === type,
  });
  return !!entry;
}

function hasTextMark(editor: Editor, mark: string): boolean {
  const [entry] = Editor.nodes(editor, {
    at: [],
    match: (node) => Text.isText(node) && Boolean((node as any)[mark]),
  });
  return !!entry;
}

function requireController(
  controller: MobileEditorToolbarController | null,
): MobileEditorToolbarController {
  if (!controller) {
    throw new Error("controller 未初始化");
  }
  return controller;
}

describe("useMobileEditorToolbarController", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    vi.spyOn(ReactEditor, "focus").mockImplementation(() => {});
    vi.spyOn(ReactEditor, "isFocused").mockReturnValue(false);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.innerHTML = "";
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("失焦后点击工具应恢复选区并生效", () => {
    const editor = createFormattedEditor();
    const editorRef = createEditorRef(editor);
    let latestController: MobileEditorToolbarController | null = null;

    act(() => {
      root.render(
        <ControllerProbe
          editorRef={editorRef}
          onController={(controller) => {
            latestController = controller;
          }}
        />,
      );
    });

    expect(latestController).toBeTruthy();
    if (!latestController) return;

    act(() => {
      latestController?.syncSelection();
    });

    editor.selection = null;

    act(() => {
      latestController?.executeAction("bold");
    });

    expect(ReactEditor.focus).toHaveBeenCalled();
    expect(editor.selection).toBeTruthy();
    const marks = Editor.marks(editor) as Record<string, unknown> | null;
    expect(marks?.bold).toBe(true);
  });

  it("content-link active 时应 unwrap，非 active 时应打开 picker 并 wrap", () => {
    const activeEditor = createContentLinkEditor();
    const activeEditorRef = createEditorRef(activeEditor);
    let latestController: MobileEditorToolbarController | null = null;

    act(() => {
      root.render(
        <ControllerProbe
          editorRef={activeEditorRef}
          onController={(controller) => {
            latestController = controller;
          }}
        />,
      );
    });

    expect(latestController).toBeTruthy();
    const activeController = requireController(latestController);

    expect(hasContentLinkNode(activeEditor)).toBe(true);
    act(() => {
      activeController.executeAction("content-link");
    });
    expect(hasContentLinkNode(activeEditor)).toBe(false);
    expect(activeController.isContentLinkPickerOpen).toBe(false);

    const inactiveEditor = createFormattedEditor("可链接文本", {
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 0], offset: 4 },
    });
    const inactiveEditorRef = createEditorRef(inactiveEditor);

    act(() => {
      root.render(
        <ControllerProbe
          editorRef={inactiveEditorRef}
          onController={(controller) => {
            latestController = controller;
          }}
        />,
      );
    });

    expect(latestController).toBeTruthy();
    const inactiveController = requireController(latestController);

    act(() => {
      inactiveController.syncSelection();
      inactiveController.executeAction("content-link");
    });
    expect(requireController(latestController).isContentLinkPickerOpen).toBe(
      true,
    );

    const result: ContentLinkPickerResult = {
      contentId: 88,
      contentType: "card",
      contentTitle: "卡片 88",
      refId: 88,
      displayText: "卡片 88",
    };

    act(() => {
      inactiveController.handleSelectContentLink(result);
    });

    expect(hasContentLinkNode(inactiveEditor)).toBe(true);
    expect(requireController(latestController).isContentLinkPickerOpen).toBe(
      false,
    );
  });

  it("应支持 underline/link/styled-text/color/highlight 动作", () => {
    let latestController: MobileEditorToolbarController | null = null;
    const mountController = (editor: Editor): MobileEditorToolbarController => {
      const editorRef = createEditorRef(editor);
      act(() => {
        root.render(
          <ControllerProbe
            editorRef={editorRef}
            onController={(controller) => {
              latestController = controller;
            }}
          />,
        );
      });
      return requireController(latestController);
    };

    const underlineEditor = createFormattedEditor("下划线能力");
    const underlineController = mountController(underlineEditor);
    act(() => {
      underlineController.syncSelection();
      underlineController.applyUnderlineStyle({ lineType: "dashed" });
    });
    expect(hasNodeType(underlineEditor, "underline")).toBe(true);

    const linkEditor = createFormattedEditor("链接能力");
    const linkController = mountController(linkEditor);
    act(() => {
      linkController.syncSelection();
      linkController.executeAction("link");
    });
    expect(hasNodeType(linkEditor, "link")).toBe(true);

    const styledTextEditor = createFormattedEditor("样式能力");
    const styledTextController = mountController(styledTextEditor);
    act(() => {
      styledTextController.syncSelection();
      styledTextController.executeAction("styled-text");
    });
    expect(hasNodeType(styledTextEditor, "styled-text")).toBe(true);

    const markEditor = createFormattedEditor("颜色高亮");
    const markController = mountController(markEditor);
    act(() => {
      markController.syncSelection();
      markController.applyColorMark("#e33a32", "#fa7873");
    });
    const marksAfterColor = Editor.marks(markEditor) as Record<
      string,
      unknown
    > | null;
    expect(marksAfterColor?.color).toBeFalsy();

    act(() => {
      markController.applyHighlightMark("yellow");
    });
    const marksAfterHighlight = Editor.marks(markEditor) as Record<
      string,
      unknown
    > | null;
    expect(marksAfterHighlight?.highlight).toBeTruthy();
  });

  it("应支持编辑器聚焦状态和依赖选区禁用态判断", () => {
    vi.useFakeTimers();
    const focusState = { value: true };
    const editor = createFormattedEditor("依赖选区", {
      anchor: { path: [0, 0], offset: 1 },
      focus: { path: [0, 0], offset: 1 },
    });
    const editorRef = createEditorRef(editor, {
      isFocus: () => focusState.value,
    });
    let latestController: MobileEditorToolbarController | null = null;

    act(() => {
      root.render(
        <ControllerProbe
          editorRef={editorRef}
          onController={(controller) => {
            latestController = controller;
          }}
        />,
      );
    });

    const controller = requireController(latestController);
    expect(controller.isEditorFocused).toBe(false);

    act(() => {
      controller.handleEditorFocus();
    });
    expect(requireController(latestController).isEditorFocused).toBe(true);
    expect(requireController(latestController).isActionDisabled("color")).toBe(
      true,
    );
    expect(requireController(latestController).isActionDisabled("kbd")).toBe(
      true,
    );
    expect(requireController(latestController).isActionDisabled("link")).toBe(
      false,
    );

    editor.selection = {
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 0], offset: 3 },
    };
    act(() => {
      controller.syncSelection();
    });
    expect(requireController(latestController).isActionDisabled("color")).toBe(
      false,
    );

    act(() => {
      controller.handleEditorBlur();
    });
    expect(requireController(latestController).isEditorFocused).toBe(true);
    act(() => {
      vi.advanceTimersByTime(120);
    });
    expect(requireController(latestController).isEditorFocused).toBe(true);

    focusState.value = false;
    act(() => {
      controller.handleEditorBlur();
    });
    expect(requireController(latestController).isEditorFocused).toBe(true);
    act(() => {
      vi.advanceTimersByTime(120);
    });
    expect(requireController(latestController).isEditorFocused).toBe(false);
    vi.useRealTimers();
  });

  it("blur 判定应优先识别编辑器 DOM 焦点", () => {
    vi.useFakeTimers();
    const editor = createFormattedEditor("安卓焦点判定", {
      anchor: { path: [0, 0], offset: 1 },
      focus: { path: [0, 0], offset: 1 },
    });
    const editorRef = createEditorRef(editor, {
      isFocus: () => false,
    });
    let latestController: MobileEditorToolbarController | null = null;

    act(() => {
      root.render(
        <ControllerProbe
          editorRef={editorRef}
          onController={(controller) => {
            latestController = controller;
          }}
        />,
      );
    });

    const controller = requireController(latestController);
    act(() => {
      controller.handleEditorFocus();
    });
    expect(requireController(latestController).isEditorFocused).toBe(true);

    const editorDom = document.createElement("div");
    const activeInput = document.createElement("input");
    editorDom.appendChild(activeInput);
    document.body.appendChild(editorDom);
    activeInput.focus();
    vi.spyOn(ReactEditor, "toDOMNode").mockReturnValue(
      editorDom as unknown as HTMLElement,
    );

    act(() => {
      controller.handleEditorBlur();
    });
    act(() => {
      vi.advanceTimersByTime(140);
    });

    expect(requireController(latestController).isEditorFocused).toBe(true);
    vi.useRealTimers();
  });

  it("clear-format 应支持光标态和选区态清除格式", () => {
    const collapsedEditor = createFormattedEditor("光标清除", {
      anchor: { path: [0, 0], offset: 2 },
      focus: { path: [0, 0], offset: 2 },
    });
    const collapsedEditorRef = createEditorRef(collapsedEditor);
    let latestController: MobileEditorToolbarController | null = null;

    act(() => {
      root.render(
        <ControllerProbe
          editorRef={collapsedEditorRef}
          onController={(controller) => {
            latestController = controller;
          }}
        />,
      );
    });
    const collapsedController = requireController(latestController);

    Editor.addMark(collapsedEditor, "bold", true);
    Editor.addMark(collapsedEditor, "highlight", "yellow");
    act(() => {
      collapsedController.executeAction("clear-format");
    });
    const collapsedMarks = Editor.marks(collapsedEditor) as Record<
      string,
      unknown
    > | null;
    expect(collapsedMarks?.bold).toBeFalsy();
    expect(collapsedMarks?.highlight).toBeFalsy();

    const expandedEditor = createEditor();
    expandedEditor.children = [
      {
        type: "paragraph",
        children: [
          {
            type: "underline",
            children: [
              {
                type: "formatted",
                text: "清除格式文本",
                bold: true,
                highlight: "yellow",
              },
            ],
          },
        ],
      },
    ] as unknown as Descendant[];
    expandedEditor.selection = {
      anchor: { path: [0, 0, 0], offset: 0 },
      focus: { path: [0, 0, 0], offset: 6 },
    };
    const expandedEditorRef = createEditorRef(expandedEditor);

    act(() => {
      root.render(
        <ControllerProbe
          editorRef={expandedEditorRef}
          onController={(controller) => {
            latestController = controller;
          }}
        />,
      );
    });
    const expandedController = requireController(latestController);

    act(() => {
      expandedController.executeAction("clear-format");
    });

    expect(expandedEditor.selection).toBeTruthy();
    if (expandedEditor.selection) {
      expect(Range.isCollapsed(expandedEditor.selection)).toBe(true);
    }
    expect(hasNodeType(expandedEditor, "underline")).toBe(false);
    expect(hasTextMark(expandedEditor, "bold")).toBe(false);
    expect(hasTextMark(expandedEditor, "highlight")).toBe(false);
    expect(Editor.string(expandedEditor, [])).toBe("清除格式文本");
  });
});
