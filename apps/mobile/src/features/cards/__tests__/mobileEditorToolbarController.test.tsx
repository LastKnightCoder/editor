import { act, useEffect, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorRef } from "@tau/editor";
import {
  Editor,
  Element,
  Transforms,
  createEditor,
  type BaseSelection,
  type Descendant,
} from "slate";
import { ReactEditor } from "slate-react";
import { mobileContentPlugins } from "../../../app/plugins/content";

const { openLocalMediaPickerMock, openMediaUrlInputMock } = vi.hoisted(() => ({
  openLocalMediaPickerMock: vi.fn(),
  openMediaUrlInputMock: vi.fn(),
}));
const openLinkPanel = vi.hoisted(() => vi.fn());
vi.mock("@tau/editor/extensions/link", async importOriginal => ({
  ...(await importOriginal<typeof import("@tau/editor/extensions/link")>()),
  openLinkPanel,
}));
vi.mock("@tau/editor/extensions/media", async importOriginal => ({
  ...(await importOriginal<typeof import("@tau/editor/extensions/media")>()),
  openLocalMediaPicker: (...args: unknown[]) => openLocalMediaPickerMock(...args),
  openMediaUrlInput: (...args: unknown[]) => openMediaUrlInputMock(...args),
}));

const reservation = vi.hoisted(() => ({
  reserve: vi.fn(),
  releaseWhenKeyboardShown: vi.fn(),
  releaseNow: vi.fn(),
}));
vi.mock("../../../components/KeyboardViewportProvider", async importOriginal => ({
  ...(await importOriginal<typeof import("../../../components/KeyboardViewportProvider")>()),
  useKeyboardReservation: () => reservation,
}));

import type { ContentLinkPickerResult } from "../editorExtensions/ContentLinkPickerSheet";
import { placeCaretAfterMedia } from "../editorToolbar/mediaActions";
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
    expect(requireController(latestController).contentLinkPickerIntent).toEqual({
      mode: "insert",
      text: "可链接文",
    });

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

  it("光标在引用内：进入引用模式，更换只改目标不改文字，预览关闭后恢复焦点", () => {
    const editor = createContentLinkEditor();
    editor.selection = {
      anchor: { path: [0, 0, 0], offset: 1 },
      focus: { path: [0, 0, 0], offset: 1 },
    };
    let latestController: MobileEditorToolbarController | null = null;
    act(() => {
      root.render(
        <ControllerProbe
          editorRef={createEditorRef(editor)}
          onController={controller => {
            latestController = controller;
          }}
        />
      );
    });
    act(() => {
      requireController(latestController).syncSelection();
    });
    expect(requireController(latestController).editingContext).toMatchObject({
      kind: "content-link",
      path: [0, 0],
    });

    act(() => {
      requireController(latestController).retargetContentLink();
      vi.runAllTimers();
    });
    expect(requireController(latestController).isContentLinkPickerOpen).toBe(true);
    expect(requireController(latestController).contentLinkPickerIntent).toEqual({
      mode: "replace",
      text: "引用",
    });

    act(() => {
      requireController(latestController).handleSelectContentLink({
        contentId: 200,
        contentType: "article",
        contentTitle: "新文章",
        refId: 7,
        displayText: "新文章",
      });
    });
    expect(editor.children[0]).toMatchObject({
      children: [
        {
          type: "content-link",
          contentId: 200,
          contentType: "article",
          contentTitle: "新文章",
          refId: 7,
          children: [{ text: "引用" }],
        },
      ],
    });

    vi.mocked(ReactEditor.focus).mockClear();
    act(() => {
      requireController(latestController).openContentLinkPreview();
      vi.runAllTimers();
    });
    expect(requireController(latestController).contentLinkPreview).toEqual({
      contentId: 200,
      contentType: "article",
      contentTitle: "新文章",
      refId: 7,
    });
    expect(reservation.releaseNow).toHaveBeenCalled();

    act(() => {
      requireController(latestController).closeContentLinkPreview();
    });
    expect(requireController(latestController).contentLinkPreview).toBeNull();
    expect(ReactEditor.focus).toHaveBeenCalled();
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
    });

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
    // 扩充的桌面 slash 菜单子集：块结构 / 高级块
    insertCase("tabs", "tabs");
    insertCase("details", "detail");
    insertCase("highlight-block", "highlight-block");
    insertCase("callout", "callout");
    insertCase("math", "block-math");
    insertCase("mermaid", "mermaid");
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

  function renderController(editor: Editor) {
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

  function createListEditor(
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

  it("打开面板：保存选区、预留高度并收起键盘；面板期间失焦仍显示配件栏", () => {
    reservation.reserve.mockClear();
    const editor = createFormattedEditor();
    const savedSelection = editor.selection;
    const getController = renderController(editor);

    act(() => {
      getController().handleEditorFocus();
    });
    act(() => {
      getController().openPanel("style", 280);
    });
    act(() => {
      getController().handleEditorBlur();
    });

    const controller = getController();
    expect(reservation.reserve).toHaveBeenCalledWith(280);
    expect(ReactEditor.blur).toHaveBeenCalled();
    expect(controller.activePanel).toBe("style");
    expect(controller.panelSelection).toEqual(savedSelection);
    expect(controller.isEditorFocused).toBe(false);
    expect(controller.isToolbarVisible).toBe(true);

    // 切换到另一面板不再重复预留
    act(() => {
      getController().togglePanel("insert", 280);
    });
    expect(getController().activePanel).toBe("insert");
    expect(reservation.reserve).toHaveBeenCalledTimes(1);
  });

  it("同一面板再点回到键盘：恢复选区并聚焦，等键盘弹出后释放预留", () => {
    reservation.releaseWhenKeyboardShown.mockClear();
    const editor = createFormattedEditor();
    const savedSelection = editor.selection;
    const getController = renderController(editor);

    act(() => {
      getController().openPanel("insert", 280);
    });
    editor.selection = null;
    vi.mocked(ReactEditor.focus).mockClear();

    act(() => {
      getController().togglePanel("insert", 280);
    });
    // 回键盘触发的 focus 不再走点正文路径
    act(() => {
      getController().handleEditorFocus();
    });

    expect(editor.selection).toEqual(savedSelection);
    expect(ReactEditor.focus).toHaveBeenCalled();
    expect(getController().activePanel).toBeNull();
    expect(getController().isToolbarVisible).toBe(true);
    expect(reservation.releaseWhenKeyboardShown).toHaveBeenCalledTimes(1);
  });

  it("面板打开时点正文：只关面板，不恢复选区也不主动聚焦", () => {
    reservation.releaseWhenKeyboardShown.mockClear();
    const editor = createFormattedEditor();
    const getController = renderController(editor);

    act(() => {
      getController().openPanel("style", 280);
    });
    const tappedSelection = {
      anchor: { path: [0, 0], offset: 8 },
      focus: { path: [0, 0], offset: 8 },
    };
    editor.selection = tappedSelection;
    vi.mocked(ReactEditor.focus).mockClear();

    act(() => {
      getController().handleEditorFocus();
    });

    expect(getController().activePanel).toBeNull();
    expect(getController().isEditorFocused).toBe(true);
    expect(editor.selection).toEqual(tappedSelection);
    expect(ReactEditor.focus).not.toHaveBeenCalled();
    expect(reservation.releaseWhenKeyboardShown).toHaveBeenCalledTimes(1);
  });

  it("语音面板：inputmode=none 下重新聚焦，点正文只移动插入点，关闭时恢复键盘", () => {
    const editable = document.createElement("div");
    const editor = createFormattedEditor();
    const editorRef = createEditorRef(editor);
    editorRef.current!.getEditableElement = () => editable;
    let latest: MobileEditorToolbarController | null = null;
    act(() => {
      root.render(<ControllerProbe editorRef={editorRef} onController={c => (latest = c)} />);
    });
    const getController = () => requireController(latest);
    vi.mocked(ReactEditor.focus).mockClear();

    act(() => {
      getController().openPanel("voice", 280);
    });
    expect(editable.getAttribute("inputmode")).toBe("none");

    act(() => {
      getController().handleEditorFocus();
    });
    expect(getController().activePanel).toBe("voice");

    act(() => {
      getController().closePanel({ showKeyboard: true, restoreSelection: true });
    });
    expect(editable.hasAttribute("inputmode")).toBe(false);
    expect(getController().activePanel).toBeNull();
  });

  it("从语音面板切到 Aa 面板：去掉 inputmode", () => {
    const editable = document.createElement("div");
    const editor = createFormattedEditor();
    const editorRef = createEditorRef(editor);
    editorRef.current!.getEditableElement = () => editable;
    let latest: MobileEditorToolbarController | null = null;
    act(() => {
      root.render(<ControllerProbe editorRef={editorRef} onController={c => (latest = c)} />);
    });
    act(() => {
      requireController(latest).openPanel("voice", 280);
    });
    act(() => {
      requireController(latest).openPanel("style", 280);
    });
    expect(requireController(latest).activePanel).toBe("style");
    expect(editable.hasAttribute("inputmode")).toBe(false);
  });

  it("runInPanel 与面板期间的配件栏动作作用于面板选区且不聚焦", () => {
    const editor = createFormattedEditor();
    const getController = renderController(editor);

    act(() => {
      getController().openPanel("style", 280);
    });
    editor.selection = null;
    vi.mocked(ReactEditor.focus).mockClear();

    act(() => {
      getController().runInPanel(panelEditor => {
        Editor.addMark(panelEditor, "italic", true);
        Transforms.select(panelEditor, {
          anchor: { path: [0, 0], offset: 0 },
          focus: { path: [0, 0], offset: 2 },
        });
      });
    });
    expect(Editor.marks(editor)).toMatchObject({ italic: true });
    expect(getController().panelSelection).toEqual({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 0], offset: 2 },
    });

    editor.selection = null;
    act(() => {
      getController().executeAction("bold");
    });
    expect(editor.children).toMatchObject([
      { children: [{ text: "he", italic: true, bold: true }, { text: "llo", italic: true }, {}] },
    ]);
    expect(ReactEditor.focus).not.toHaveBeenCalled();
  });

  it("插入面板内插入块：作用于面板选区且不聚焦，面板选区同步为插入后的选区", () => {
    const editor = createFormattedEditor();
    const getController = renderController(editor);

    act(() => {
      getController().openPanel("insert", 280);
    });
    editor.selection = null;
    vi.mocked(ReactEditor.focus).mockClear();

    act(() => {
      getController().handleSelectInsertItem("divider");
    });
    expect(hasNodeType(editor, "divide-line")).toBe(true);
    expect(ReactEditor.focus).not.toHaveBeenCalled();
    const insertedSelection = editor.selection;
    expect(insertedSelection).toBeTruthy();
    expect(getController().panelSelection).toEqual(insertedSelection);

    act(() => {
      getController().closePanel({ showKeyboard: true, restoreSelection: true });
    });
    expect(editor.selection).toEqual(insertedSelection);
    expect(ReactEditor.focus).toHaveBeenCalled();
    expect(getController().activePanel).toBeNull();
  });

  it("插件插入沿用面板保存选区，插入后更新选区且不唤起键盘", () => {
    const editor = createFormattedEditor("hello", {
      anchor: { path: [0, 0], offset: 2 },
      focus: { path: [0, 0], offset: 2 },
    });
    const onClick = vi.fn((target: Editor) => Transforms.insertText(target, "ABC"));
    vi.spyOn(mobileContentPlugins, "extensions", "get").mockReturnValue([
      {
        id: "test.abc",
        apiVersion: 1,
        blockPanel: [
          { title: "ABC", keywords: ["music"], description: "乐谱", icon: () => null, onClick },
        ],
      },
    ]);
    const getController = renderController(editor);
    expect(getController().pluginInsertItems).toEqual([]);
    act(() => getController().openPanel("insert", 280));
    expect(getController().pluginInsertItems[0].keywords).toEqual(["music"]);
    act(() => Transforms.deselect(editor));
    vi.mocked(ReactEditor.focus).mockClear();
    act(() => getController().pluginInsertItems[0].run());
    expect(Editor.string(editor, [0])).toBe("heABCllo");
    expect(getController().panelSelection?.anchor.offset).toBe(5);
    expect(ReactEditor.focus).not.toHaveBeenCalled();
    const action = getController().pluginInsertItems[0].run;
    vi.spyOn(ReactEditor, "isReadOnly").mockReturnValue(true);
    act(() => action());
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("exitEditing 关面板、立即释放预留并失焦", () => {
    reservation.releaseNow.mockClear();
    const editor = createFormattedEditor();
    const getController = renderController(editor);

    act(() => {
      getController().openPanel("style", 280);
    });
    vi.mocked(ReactEditor.blur).mockClear();
    vi.mocked(ReactEditor.isFocused).mockReturnValue(true);
    act(() => {
      getController().exitEditing();
    });

    expect(getController().activePanel).toBeNull();
    expect(reservation.releaseNow).toHaveBeenCalled();
    expect(ReactEditor.blur).toHaveBeenCalled();
  });

  it("editingContext 随选区刷新，collapseSelectionToFocus 折叠到焦点端", () => {
    const editor = createFormattedEditor();
    const getController = renderController(editor);

    act(() => {
      getController().syncSelection();
    });
    expect(getController().editingContext.kind).toBe("selection");

    act(() => {
      getController().collapseSelectionToFocus();
    });
    expect(editor.selection).toEqual({
      anchor: { path: [0, 0], offset: 5 },
      focus: { path: [0, 0], offset: 5 },
    });
    expect(getController().editingContext.kind).toBe("text");
  });

  it("缩进按最内层列表项类型选命令，在列表项开头执行后回到原选区", () => {
    const caret = {
      anchor: { path: [0, 1, 0, 0], offset: 2 },
      focus: { path: [0, 1, 0, 0], offset: 2 },
    };
    const editor = createListEditor("bulleted-list", caret);
    const selectionsAtExecute: BaseSelection[] = [];
    const execute = vi.fn<(id: string) => boolean>(() => {
      selectionsAtExecute.push(editor.selection);
      return true;
    });
    editor.commands = { execute };
    const getController = renderController(editor);

    act(() => {
      getController().indent();
    });
    expect(execute).toHaveBeenCalledWith("tau.list-item.indent");
    expect(selectionsAtExecute[0]).toEqual({
      anchor: { path: [0, 1, 0, 0], offset: 0 },
      focus: { path: [0, 1, 0, 0], offset: 0 },
    });
    expect(editor.selection).toEqual(caret);
    expect(getController().canIndent).toBe(true);

    const checkEditor = createListEditor("check-list", caret);
    const checkExecute = vi.fn<(id: string) => boolean>(() => true);
    checkEditor.commands = { execute: checkExecute };
    const getCheckController = renderController(checkEditor);
    act(() => {
      getCheckController().outdent();
    });
    expect(checkExecute).toHaveBeenCalledWith("tau.check-list.outdent");
  });

  it("光标不在列表项内时缩进不执行命令", () => {
    const editor = createFormattedEditor();
    const execute = vi.fn<(id: string) => boolean>(() => true);
    editor.commands = { execute };
    const getController = renderController(editor);

    act(() => {
      getController().indent();
    });
    expect(execute).not.toHaveBeenCalled();
  });
  it("getCurrentBlockKind 取最内层相关块类型，面板打开时按面板选区", () => {
    const paragraph = (text: string) => ({
      type: "paragraph",
      children: [{ type: "formatted", text }],
    });
    const list = (listType: string, itemType: string, text: string) => ({
      type: listType,
      children: [{ type: itemType, children: [paragraph(text)] }],
    });
    const editor = createEditor();
    editor.children = [
      paragraph("正文"),
      { type: "header", level: 1, children: [{ type: "formatted", text: "一" }] },
      { type: "header", level: 3, children: [{ type: "formatted", text: "三" }] },
      list("bulleted-list", "list-item", "无序"),
      list("numbered-list", "list-item", "编号"),
      list("check-list", "check-list-item", "待办"),
      { type: "blockquote", children: [paragraph("引用")] },
      { type: "blockquote", children: [list("numbered-list", "list-item", "引用内列表")] },
      { type: "header", level: 4, children: [{ type: "formatted", text: "四" }] },
      { type: "code-block", children: [{ type: "formatted", text: "code" }] },
    ] as unknown as Descendant[];
    const caretAt = (path: number[]): BaseSelection => ({
      anchor: { path, offset: 0 },
      focus: { path, offset: 0 },
    });
    editor.selection = caretAt([0, 0]);
    const getController = renderController(editor);

    const cases: Array<[number[], string]> = [
      [[0, 0], "paragraph"],
      [[1, 0], "h1"],
      [[2, 0], "h3"],
      [[3, 0, 0, 0], "bulleted-list"],
      [[4, 0, 0, 0], "numbered-list"],
      [[5, 0, 0, 0], "check-list"],
      [[6, 0, 0], "quote"],
      [[7, 0, 0, 0, 0], "numbered-list"],
      [[8, 0], "other"],
      [[9, 0], "other"],
    ];
    for (const [path, kind] of cases) {
      editor.selection = caretAt(path);
      act(() => {
        getController().syncSelection();
      });
      expect(getController().getCurrentBlockKind(), path.join(".")).toBe(kind);
    }

    editor.selection = caretAt([1, 0]);
    act(() => {
      getController().openPanel("style", 280);
    });
    // 面板打开期间编辑器选区被清空，仍按面板选区判断
    editor.selection = null;
    act(() => {
      getController().handleEditorBlur();
    });
    expect(getController().getCurrentBlockKind()).toBe("h1");
  });

  it("getCurrentMarks 含刚应用到选区与光标处的样式，无选区为 null", () => {
    const editor = createFormattedEditor("hello", {
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 0], offset: 5 },
    });
    const getController = renderController(editor);
    act(() => {
      getController().applyHighlightMark("green");
    });
    expect(getController().getCurrentMarks()).toMatchObject({ highlight: "green" });
    // 光标处应用的待输入样式同样计入
    act(() => {
      getController().applyColorMark("#e33a32", "#fa7873");
    });
    expect(getController().getCurrentMarks()).toMatchObject({
      highlight: "green",
      color: "#e33a32",
    });
    editor.selection = null;
    act(() => {
      getController().syncSelection();
    });
    expect(getController().getCurrentMarks()).toBeNull();
  });

  describe("编辑上下文", () => {
    function createTableDoc(selection: BaseSelection): Editor {
      const editor = createEditor();
      editor.children = [
        { type: "paragraph", children: [{ type: "formatted", text: "intro" }] },
        {
          type: "table",
          children: [0, 1, 2].map(row => ({
            type: "table-row",
            children: [0, 1].map(col => ({
              type: "table-cell",
              children: [{ type: "formatted", text: `r${row}c${col}` }],
            })),
          })),
        },
        {
          type: "code-block",
          uuid: "code-1",
          language: "ts",
          code: "",
          children: [{ type: "formatted", text: "" }],
        },
      ] as unknown as Descendant[];
      editor.selection = selection;
      return editor;
    }

    const caret = (path: number[], offset = 1): NonNullable<BaseSelection> => ({
      anchor: { path, offset },
      focus: { path, offset },
    });

    it("光标在表格给出 table 上下文；手动退回后按 text，离开该表格即恢复", () => {
      const editor = createTableDoc(caret([1, 1, 0, 0]));
      const getController = renderController(editor);
      act(() => {
        getController().syncSelection();
      });
      expect(getController().editingContext).toMatchObject({
        kind: "table",
        row: 1,
        col: 0,
        rowCount: 3,
        colCount: 2,
      });

      act(() => {
        getController().dismissEditingContext();
      });
      expect(getController().editingContext.kind).toBe("text");

      // 同一表格内换单元格仍保持退回
      act(() => {
        Transforms.select(editor, caret([1, 2, 1, 0]));
        getController().syncSelection();
      });
      expect(getController().editingContext.kind).toBe("text");

      act(() => {
        Transforms.select(editor, caret([0, 0]));
        getController().syncSelection();
      });
      expect(getController().editingContext.kind).toBe("text");

      act(() => {
        Transforms.select(editor, caret([1, 0, 0, 0]));
        getController().syncSelection();
      });
      expect(getController().editingContext.kind).toBe("table");
    });

    it("runTableAction 作用于光标所在表格并刷新上下文", () => {
      const editor = createTableDoc(caret([1, 1, 1, 0]));
      const getController = renderController(editor);
      act(() => {
        getController().runTableAction("insert-row-below");
      });
      expect(getController().editingContext).toMatchObject({ kind: "table", row: 2, rowCount: 4 });
      act(() => {
        getController().runTableAction("cycle-align");
      });
      expect(getController().getTableColumnAlign()).toBe("center");
    });

    it("表格菜单打开期间动作作用于保存的选区，关闭时恢复选区并聚焦", () => {
      const editor = createTableDoc(caret([1, 1, 0, 0]));
      const getController = renderController(editor);
      act(() => {
        getController().openTableMenu();
        vi.runAllTimers();
      });
      expect(getController().isTableMenuOpen).toBe(true);
      expect(getController().isToolbarVisible).toBe(true);

      // 菜单遮罩让编辑器失焦，Slate 选区可能丢失
      editor.selection = null;
      vi.mocked(ReactEditor.focus).mockClear();
      act(() => {
        getController().runTableAction("move-row-down");
      });
      expect(ReactEditor.focus).not.toHaveBeenCalled();
      expect(Editor.string(editor, [1, 2, 0])).toBe("r1c0");

      editor.selection = null;
      act(() => {
        getController().closeTableMenu();
      });
      expect(getController().isTableMenuOpen).toBe(false);
      expect(ReactEditor.focus).toHaveBeenCalled();
      expect((editor.selection as BaseSelection)?.anchor.path).toEqual([1, 2, 0, 0]);
    });

    it("焦点进入代码块 textarea 时 Slate 失焦仍显示配件栏，离开后一帧收起", () => {
      const editor = createTableDoc(caret([0, 0]));
      const elementDom = document.createElement("div");
      elementDom.setAttribute("data-slate-node", "element");
      elementDom.innerHTML = '<textarea class="code-block-shiki-input"></textarea>';
      document.body.appendChild(elementDom);
      vi.spyOn(ReactEditor, "toSlateNode").mockReturnValue(editor.children[2]);
      vi.spyOn(ReactEditor, "findPath").mockReturnValue([2]);
      const frames: FrameRequestCallback[] = [];
      vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
        frames.push(callback);
        return frames.length;
      });

      const getController = renderController(editor);
      act(() => {
        getController().handleEditorFocus();
      });
      const textarea = elementDom.querySelector("textarea");
      act(() => {
        textarea?.focus();
        getController().handleEditorBlur();
      });
      expect(getController().isEditorFocused).toBe(false);
      expect(getController().editingContext).toMatchObject({ kind: "code", uuid: "code-1" });
      expect(getController().isToolbarVisible).toBe(true);

      act(() => {
        textarea?.blur();
      });
      // focusout 后等一帧再判
      expect(getController().isToolbarVisible).toBe(true);
      act(() => {
        frames.splice(0).forEach(callback => callback(0));
      });
      expect(getController().editingContext.kind).toBe("text");
      expect(getController().isToolbarVisible).toBe(false);
    });
  });

  describe("媒体上下文", () => {
    function createImageDoc(): Editor {
      const editor = createEditor();
      editor.isVoid = element => (element as { type?: string }).type === "image";
      editor.children = [
        { type: "image", url: "a.png", children: [{ type: "formatted", text: "" }] },
        { type: "paragraph", children: [{ type: "formatted", text: "正文" }] },
      ] as unknown as Descendant[];
      editor.selection = {
        anchor: { path: [1, 0], offset: 1 },
        focus: { path: [1, 0], offset: 1 },
      };
      return editor;
    }

    it("选中图片：收起键盘但配件栏保持显示；「键盘」把光标放到图片后并聚焦", () => {
      const editor = createImageDoc();
      const getController = renderController(editor);
      vi.mocked(ReactEditor.isFocused).mockReturnValue(true);
      act(() => {
        getController().handleEditorFocus();
      });
      act(() => {
        Transforms.select(editor, Editor.start(editor, [0]));
        getController().syncSelection();
      });
      expect(getController().editingContext).toMatchObject({ kind: "media", mediaType: "image" });
      expect(ReactEditor.blur).toHaveBeenCalled();
      vi.mocked(ReactEditor.isFocused).mockReturnValue(false);
      act(() => {
        getController().handleEditorBlur();
      });
      expect(getController().isEditorFocused).toBe(false);
      expect(getController().isToolbarVisible).toBe(true);

      const context = getController().editingContext;
      if (context.kind !== "media") throw new Error("应为媒体上下文");
      act(() => {
        getController().focusAfterVoid(editor => placeCaretAfterMedia(editor, context));
      });
      expect(editor.selection?.anchor).toEqual({ path: [1, 0], offset: 0 });
      expect(ReactEditor.focus).toHaveBeenCalled();
      expect(getController().editingContext.kind).toBe("text");
    });

    it("块选择请求转给宿主登记的监听，未登记时返回 false", () => {
      const getController = renderController(createImageDoc());
      expect(getController().requestBlockSelection(0)).toBe(false);
      const listener = vi.fn();
      act(() => {
        getController().setBlockSelectionListener(listener);
      });
      expect(getController().requestBlockSelection(0)).toBe(true);
      expect(listener).toHaveBeenCalledWith(0);
    });
  });
});
