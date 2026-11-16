import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor, Transforms } from "slate";
import { ReactEditor } from "slate-react";
import { mobileContentPlugins } from "../../../app/plugins/content";
import type { MobileEditorToolbarController } from "../editorToolbar/useMobileEditorToolbarController";
import {
  ControllerProbe,
  createEditorRef,
  createFormattedEditor,
  hasNodeType,
  renderControllerOn,
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

  function renderController(editor: Editor) {
    return renderControllerOn(root, editor);
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

  it("文字转语音：插入面板与选中文字各自锁定写入位置，下一拍打开面板，关闭释放", () => {
    const editor = createFormattedEditor("第一段文字");
    const getController = renderController(editor);

    act(() => {
      getController().openTtsForSelection();
    });
    expect(getController().ttsTarget).toBeNull();
    act(() => vi.runAllTimers());
    const selectionTarget = getController().ttsTarget;
    expect(selectionTarget?.intent).toEqual({ kind: "after-selection", text: "第一段文字" });

    act(() => {
      getController().closeTts();
    });
    expect(getController().ttsTarget).toBeNull();
    expect(selectionTarget?.signal.aborted).toBe(true);

    act(() => {
      Transforms.select(editor, { path: [0, 0], offset: 2 });
      getController().handleSelectInsertItem("tts");
      vi.runAllTimers();
    });
    expect(getController().ttsTarget?.intent).toEqual({ kind: "insert" });
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
});
