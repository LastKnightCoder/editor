import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRef } from "react";
import { Descendant } from "slate";
import { ReactEditor } from "slate-react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import { Editor, type EditorRef } from "../index";
import { EditorServicesProvider } from "../contexts/EditorServicesContext";
import type { EditorServices } from "../types/services";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const createParagraph = (text: string): Descendant => ({
  type: "paragraph",
  children: [{ type: "formatted", text }],
});

const services = {
  theme: {
    current: () => "light",
    colors: () => ({
      hoverClass: "",
      activeClass: "",
      hoverTextClass: "",
      borderClass: "",
      hoverBorderClass: "",
      focusBorderClass: "",
      textClass: "",
      secondaryTextClass: "",
      activeTextClass: "",
      cardBorderClass: "",
      cardBgClass: "",
    }),
  },
} as unknown as EditorServices;

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

  it("外部设值前应先清理 selection，避免沿用旧叶子节点范围", async () => {
    const deselectSpy = vi.spyOn(ReactEditor, "deselect");
    const removeAllRanges = vi.fn();
    const getSelectionSpy = vi.spyOn(window, "getSelection").mockReturnValue({
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

    const ref = createRef<EditorRef>();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <DndProvider backend={HTML5Backend}>
          <EditorServicesProvider services={services}>
            <Editor
              ref={ref}
              initValue={[createParagraph("旧内容")]}
              readonly={false}
            />
          </EditorServicesProvider>
        </DndProvider>,
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

    await act(async () => {
      ref.current?.setEditorValue([createParagraph("新内容")]);
    });

    expect(deselectSpy).toHaveBeenCalledTimes(1);
    expect(getSelectionSpy).toHaveBeenCalled();
    expect(removeAllRanges).toHaveBeenCalledTimes(1);
    expect(ref.current?.getEditor().selection).toBeNull();
  });
});
