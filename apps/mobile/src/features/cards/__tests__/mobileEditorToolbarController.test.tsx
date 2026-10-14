import { act, useEffect, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorRef } from "@tau/editor";
import { Editor, Element, createEditor, type BaseSelection, type Descendant } from "slate";
import { ReactEditor } from "slate-react";

const { openLocalMediaPickerMock, openMediaUrlInputMock } = vi.hoisted(() => ({
  openLocalMediaPickerMock: vi.fn(),
  openMediaUrlInputMock: vi.fn(),
}));
const openLinkPanel = vi.hoisted(() => vi.fn());
vi.mock("@tau/editor-link", async importOriginal => ({
  ...(await importOriginal<typeof import("@tau/editor-link")>()),
  openLinkPanel,
}));
vi.mock("@tau/editor-media", async importOriginal => ({
  ...(await importOriginal<typeof import("@tau/editor-media")>()),
  openLocalMediaPicker: (...args: unknown[]) => openLocalMediaPickerMock(...args),
  openMediaUrlInput: (...args: unknown[]) => openMediaUrlInputMock(...args),
}));

import type { ContentLinkPickerResult } from "../editorExtensions/ContentLinkPickerSheet";
import { restoreSelectionAndFocus } from "../editorToolbar/toolbarActions";
import {
  useMobileEditorToolbarController,
  type MobileEditorToolbarController,
} from "../editorToolbar/useMobileEditorToolbarController";

function createEditorRef(
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

function createFormattedEditor(
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
    match: node =>
      !Editor.isEditor(node) &&
      Element.isElement(node) &&
      (node as { type?: string }).type === "content-link",
  });
  return !!entry;
}

function hasNodeType(editor: Editor, type: string): boolean {
  const [entry] = Editor.nodes(editor, {
    at: [],
    match: node =>
      !Editor.isEditor(node) &&
      Element.isElement(node) &&
      (node as { type?: string }).type === type,
  });
  return !!entry;
}

function requireController(
  controller: MobileEditorToolbarController | null
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
    vi.spyOn(ReactEditor, "blur").mockImplementation(() => {});
    // 底部面板延迟一拍挂载（openSheetNextTick），用 fake timer 同步推进断言
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.innerHTML = "";
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("恢复选区时也应把原生焦点放回编辑器", () => {
    const editor = createFormattedEditor();
    const editorElement = document.createElement("div");
    editorElement.setAttribute("contenteditable", "true");
    document.body.appendChild(editorElement);
    vi.spyOn(ReactEditor, "toDOMNode").mockReturnValue(editorElement);

    restoreSelectionAndFocus(editor, editor.selection);

    expect(document.activeElement).toBe(editorElement);
  });

  it("失焦后点击工具应恢复选区并生效", () => {
    const editor = createFormattedEditor();
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
          onController={controller => {
            latestController = controller;
          }}
        />
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
          onController={controller => {
            latestController = controller;
          }}
        />
      );
    });

    expect(latestController).toBeTruthy();
    const inactiveController = requireController(latestController);

    act(() => {
      inactiveController.syncSelection();
      inactiveController.executeAction("content-link");
      vi.runAllTimers();
    });
    expect(requireController(latestController).isContentLinkPickerOpen).toBe(true);

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
    expect(requireController(latestController).isContentLinkPickerOpen).toBe(false);
  });

  it("应支持 underline/link/styled-text/color/highlight 动作", () => {
    let latestController: MobileEditorToolbarController | null = null;
    const mountController = (editor: Editor): MobileEditorToolbarController => {
      const editorRef = createEditorRef(editor);
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
    // 链接改由浮层输入地址后才成链，不再预插空链接
    expect(openLinkPanel).toHaveBeenCalledWith(linkEditor);
    expect(hasNodeType(linkEditor, "link")).toBe(false);

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
    const marksAfterColor = Editor.marks(markEditor) as Record<string, unknown> | null;
    expect(marksAfterColor?.color).toBeFalsy();

    act(() => {
      markController.applyGradientMark("ocean");
    });
    const marksAfterGradient = Editor.marks(markEditor) as Record<string, unknown> | null;
    expect(marksAfterGradient?.textGradient).toBe("ocean");

    act(() => {
      markController.applyHighlightMark("yellow");
    });
    const marksAfterHighlight = Editor.marks(markEditor) as Record<string, unknown> | null;
    expect(marksAfterHighlight?.highlight).toBeTruthy();
  });

  it("applyHeadingLevel 应显式设定/清除标题级别", () => {
    const editor = createFormattedEditor("标题级别");
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
    const controller = requireController(latestController);

    const getHeaderLevel = (): number | undefined => {
      const [entry] = Editor.nodes(editor, {
        at: [],
        match: node =>
          !Editor.isEditor(node) &&
          Element.isElement(node) &&
          (node as { type?: string }).type === "header",
      });
      return entry ? (entry[0] as { level?: number }).level : undefined;
    };

    act(() => {
      controller.syncSelection();
      controller.applyHeadingLevel(3);
    });
    expect(getHeaderLevel()).toBe(3);

    act(() => {
      controller.applyHeadingLevel(1);
    });
    expect(getHeaderLevel()).toBe(1);

    act(() => {
      controller.applyHeadingLevel("paragraph");
    });
    expect(getHeaderLevel()).toBeUndefined();
    expect(hasNodeType(editor, "paragraph")).toBe(true);
  });

  it("插入面板应分发媒体选择与块插入，行内标记复用 executeAction", () => {
    let latestController: MobileEditorToolbarController | null = null;
    const mountController = (editor: Editor): MobileEditorToolbarController => {
      const editorRef = createEditorRef(editor);
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
      return requireController(latestController);
    };

    // 媒体类：分发到共享包选图入口（拍照带 capture）
    const mediaEditor = createFormattedEditor("媒体分发");
    const mediaController = mountController(mediaEditor);
    act(() => {
      mediaController.syncSelection();
      mediaController.handleOpenInsertSheet();
      vi.runAllTimers();
    });
    expect(requireController(latestController).isInsertSheetOpen).toBe(true);

    openLocalMediaPickerMock.mockClear();
    act(() => {
      mediaController.handleSelectInsertItem("image");
    });
    expect(openLocalMediaPickerMock).toHaveBeenCalledWith(mediaEditor, "image", undefined, {
      capture: false,
      onComplete: expect.any(Function),
    });

    act(() => {
      mediaController.handleSelectInsertItem("camera");
    });
    expect(openLocalMediaPickerMock).toHaveBeenCalledWith(mediaEditor, "image", undefined, {
      capture: true,
      onComplete: expect.any(Function),
    });

    // 网络媒体：唤起媒体扩展的 URL 输入弹窗
    act(() => {
      mediaController.handleSelectInsertItem("video-url");
    });
    expect(openMediaUrlInputMock).toHaveBeenCalledWith(mediaEditor, "video");

    // 块插入类：各自独立编辑器验证（插入后选区进入新块，会互相影响）
    const insertCase = (
      kind: Parameters<MobileEditorToolbarController["handleSelectInsertItem"]>[0],
      nodeType: string
    ) => {
      const editor = createFormattedEditor(`插入${kind}`);
      const controller = mountController(editor);
      act(() => {
        controller.syncSelection();
        controller.handleSelectInsertItem(kind);
      });
      expect(hasNodeType(editor, nodeType)).toBe(true);
    };
    insertCase("table", "table");
    insertCase("check-list", "check-list");
    insertCase("divider", "divide-line");
    insertCase("kbd", "kbd");
    // 扩充的桌面 slash 菜单子集：块结构 / 高级块
    insertCase("image-gallery", "image-gallery");
    insertCase("tabs", "tabs");
    insertCase("details", "detail");
    insertCase("highlight-block", "highlight-block");
    insertCase("callout", "callout");
    insertCase("math", "block-math");
    insertCase("mermaid", "mermaid");

    const sheetController = requireController(latestController);
    act(() => {
      sheetController.handleCloseInsertSheet();
    });
    expect(requireController(latestController).isInsertSheetOpen).toBe(false);
  });

  it("handleInsertImage 应直达选图入口", () => {
    const editor = createFormattedEditor("直达选图");
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
    const controller = requireController(latestController);

    openLocalMediaPickerMock.mockClear();
    act(() => {
      controller.syncSelection();
      controller.handleInsertImage();
    });
    expect(openLocalMediaPickerMock).toHaveBeenCalledWith(editor, "image", undefined, {
      onComplete: expect.any(Function),
    });
  });

  it("应支持编辑器聚焦状态和依赖选区禁用态判断", () => {
    const editor = createFormattedEditor("依赖选区", {
      anchor: { path: [0, 0], offset: 1 },
      focus: { path: [0, 0], offset: 1 },
    });
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

    const controller = requireController(latestController);
    expect(controller.isEditorFocused).toBe(false);

    act(() => {
      controller.handleEditorFocus();
    });
    expect(requireController(latestController).isEditorFocused).toBe(true);
    expect(requireController(latestController).isActionDisabled("color")).toBe(true);
    expect(requireController(latestController).isActionDisabled("kbd")).toBe(true);
    expect(requireController(latestController).isActionDisabled("link")).toBe(false);

    editor.selection = {
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 0], offset: 3 },
    };
    act(() => {
      controller.syncSelection();
    });
    expect(requireController(latestController).isActionDisabled("color")).toBe(false);

    act(() => {
      controller.handleEditorBlur();
    });
    expect(requireController(latestController).isEditorFocused).toBe(false);
  });
});
