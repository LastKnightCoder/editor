import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor, Element, Node, Transforms } from "slate";
import { ReactEditor } from "slate-react";
import type { ContentLinkPickerResult } from "../editorExtensions/ContentLinkPickerSheet";
import type { MobileEditorToolbarController } from "../editorToolbar/useMobileEditorToolbarController";
import {
  ControllerProbe,
  createContentLinkEditor,
  createEditorRef,
  createFormattedEditor,
  hasContentLinkNode,
  hasNodeType,
  requireController,
  setupToolbarControllerHost,
  teardownToolbarControllerHost,
} from "./mobileEditorToolbarController.testUtils";

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

describe("useMobileEditorToolbarController", () => {
  let root: Root;

  beforeEach(() => {
    root = setupToolbarControllerHost();
  });

  afterEach(() => {
    teardownToolbarControllerHost(root);
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
    inactiveEditor.isInline = element => element.type === "content-link";
    Transforms.setNodes(inactiveEditor, { bold: true }, { at: [0, 0] });
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

    expect(Node.get(inactiveEditor, [0, 1])).toMatchObject({
      type: "content-link",
      children: [{ text: "可链接文", bold: true }],
    });
    expect(Node.get(inactiveEditor, [0, 2])).toMatchObject({ text: "本", bold: true });
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
});
