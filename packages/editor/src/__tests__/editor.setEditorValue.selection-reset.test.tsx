import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRef } from "react";
import { Descendant } from "slate";
import { ReactEditor } from "slate-react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import { Editor, createEditorKit, type EditorRef } from "../index";
import { createDefaultEditorSlots } from "@tau/editor-media/slots";
import { IEditorSlots } from "@tau/editor-media/services";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const createParagraph = (text: string): Descendant => ({
  type: "paragraph",
  children: [{ type: "formatted", text }],
});

const kit = createEditorKit({
  services: [register => register(IEditorSlots, createDefaultEditorSlots())],
});

describe("Editor.setEditorValue", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(async () => {
    vi.restoreAllMocks();
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    root = null;
    container?.remove();
    container = null;
    document.body.innerHTML = "";
  });

  const renderEditor = async (onChange = vi.fn()) => {
    const ref = createRef<EditorRef>();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <DndProvider backend={HTML5Backend}>
          <Editor
            kit={kit}
            ref={ref}
            initValue={[createParagraph("旧内容")]}
            readonly={false}
            onChange={onChange}
          />
        </DndProvider>
      );
    });

    const slateEditor = ref.current?.getEditor();
    expect(slateEditor).toBeTruthy();

    act(() => {
      slateEditor!.selection = {
        anchor: { path: [0, 0], offset: 0 },
        focus: { path: [0, 0], offset: 2 },
      };
    });

    return { ref, slateEditor: slateEditor!, onChange };
  };

  it("外部设值前应先清理 selection，避免沿用旧叶子节点范围", async () => {
    const removeAllRanges = vi.fn();
    const { ref, slateEditor } = await renderEditor();
    const editorElement = ReactEditor.toDOMNode(slateEditor, slateEditor);
    const selectionNode = editorElement.firstChild;

    const getSelectionSpy = vi.spyOn(window, "getSelection").mockReturnValue({
      anchorNode: selectionNode,
      focusNode: selectionNode,
      removeAllRanges,
      rangeCount: 1,
      getRangeAt: () =>
        ({
          getBoundingClientRect: () => ({
            top: 0,
            bottom: 0,
            left: 0,
            width: 0,
            height: 0,
            right: 0,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          }),
        }) as Range,
    } as unknown as Selection);

    await act(async () => {
      ref.current?.setEditorValue([createParagraph("新内容")]);
    });

    expect(getSelectionSpy).toHaveBeenCalled();
    expect(removeAllRanges).toHaveBeenCalledTimes(1);
    expect(ref.current?.getEditor().selection).toBeNull();
  });

  it("外部设值不应清理其他 editor 或元素内的 DOM selection", async () => {
    const reactEditorDeselectSpy = vi.spyOn(ReactEditor, "deselect");
    const removeAllRanges = vi.fn();
    const { ref } = await renderEditor();
    const externalSelectionHost = document.createElement("div");
    externalSelectionHost.textContent = "其他编辑器里的选区";
    document.body.appendChild(externalSelectionHost);
    const selectionNode = externalSelectionHost.firstChild;

    const getSelectionSpy = vi.spyOn(window, "getSelection").mockReturnValue({
      anchorNode: selectionNode,
      focusNode: selectionNode,
      removeAllRanges,
      rangeCount: 1,
      getRangeAt: () =>
        ({
          getBoundingClientRect: () => ({
            top: 0,
            bottom: 0,
            left: 0,
            width: 0,
            height: 0,
            right: 0,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          }),
        }) as Range,
    } as unknown as Selection);

    await act(async () => {
      ref.current?.setEditorValue([createParagraph("新内容")]);
    });

    expect(getSelectionSpy).toHaveBeenCalled();
    expect(reactEditorDeselectSpy).not.toHaveBeenCalled();
    expect(removeAllRanges).not.toHaveBeenCalled();
    expect(ref.current?.getEditor().selection).toBeNull();
  });

  it("外部设值触发的 Slate onChange 不应继续调用业务 onChange", async () => {
    const onChange = vi.fn();
    const { ref } = await renderEditor(onChange);
    onChange.mockClear();

    await act(async () => {
      ref.current?.setEditorValue([createParagraph("外部同步内容")]);
    });

    expect(onChange).not.toHaveBeenCalled();
  });
});
