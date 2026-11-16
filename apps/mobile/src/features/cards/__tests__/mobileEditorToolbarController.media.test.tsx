import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor, Transforms, createEditor, type Descendant } from "slate";
import { ReactEditor } from "slate-react";
import { placeCaretAfterMedia } from "../editorToolbar/mediaActions";
import {
  renderControllerOn,
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
