import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import WhiteBoard from "../WhiteBoard";
import { defineWhiteboardExtension, type WhiteboardAPI } from "../extensions/api";
import { useWhiteboardAPI } from "../extensions/runtime";
import { createInteractionExtension, createClipboardExtension } from "../extensions/builtins";
import { createRichTextExtension } from "../extensions/builtins";
import { createServiceRegistry } from "../extensions";
import {
  IWhiteboardRichText,
  embeddedTextOptions,
  type WhiteboardTextEditorProps,
} from "../extensions/text";
import { useBoard } from "../hooks/useBoard";
import type Board from "../Board";

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

it.each([
  ["Delete", 46],
  ["Backspace", 8],
] as const)("点击画布元素后 %s 删除并清空选区", async (key, keyCode) => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  );
  let api!: WhiteboardAPI;
  function Capture() {
    api = useWhiteboardAPI();
    return null;
  }
  const extensions = [
    createInteractionExtension(),
    createClipboardExtension(),
    defineWhiteboardExtension({
      id: "test.shape",
      create: () => ({
        elements: [
          {
            type: "test.shape",
            render: ({ element }) => (
              <rect
                data-test-shape
                x={element.x}
                y={element.y}
                width={element.width}
                height={element.height}
              />
            ),
          },
        ],
        layers: [{ id: "test.capture", position: "outside", component: Capture }],
      }),
    }),
  ];
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <WhiteBoard
          extensions={extensions}
          initData={[{ id: "shape", type: "test.shape", x: 10, y: 10, width: 100, height: 80 }]}
          initViewPort={{ minX: 0, minY: 0, width: 800, height: 600, zoom: 1 }}
          showToolbar={false}
          showAttributeSetter={false}
          showStatusBar={false}
        />
      )
    );
    const shape = host.querySelector("[data-test-shape]")!;
    await act(async () => {
      for (const type of ["pointerdown", "pointerup"]) {
        const event = new MouseEvent(type, {
          bubbles: true,
          clientX: 30,
          clientY: 30,
          button: 0,
          buttons: type === "pointerdown" ? 1 : 0,
        });
        Object.defineProperty(event, "pointerId", { value: 1 });
        shape.dispatchEvent(event);
      }
    });
    expect(api.selection.selectedElements.map(node => node.id)).toEqual(["shape"]);
    expect(document.activeElement).toBe(host.querySelector("[data-whiteboard-root]"));
    await act(async () =>
      document.activeElement!.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key, keyCode, which: keyCode })
      )
    );
    expect(api.children).toEqual([]);
    expect(api.selection.selectedElements).toEqual([]);
  } finally {
    await act(async () => root.unmount());
  }
});

it.each(["blur", "unmount"])("富文本退出编辑（%s）后释放标记，编辑中不删除画布元素", async mode => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  );
  let board!: Board;
  function Capture() {
    board = useBoard();
    return null;
  }
  function TextEditor({ onFocus, onBlur }: WhiteboardTextEditorProps) {
    return <input data-test-editor onFocus={onFocus} onBlur={onBlur} />;
  }
  const extensions = [
    createInteractionExtension(),
    createRichTextExtension(),
    defineWhiteboardExtension({
      id: "test.capture",
      create: () => ({
        layers: [{ id: "test.capture.layer", position: "outside", component: Capture }],
      }),
    }),
  ];
  const text = {
    id: "text",
    type: "richtext",
    x: 10,
    y: 10,
    width: 200,
    height: 100,
    maxWidth: 200,
    maxHeight: 100,
    content: [],
  };
  const shape = { id: "shape", type: "unknown", x: 300, y: 10, width: 100, height: 80 };
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <WhiteBoard
          extensions={extensions}
          services={createServiceRegistry(register =>
            register(IWhiteboardRichText, { Editor: TextEditor, kit: embeddedTextOptions.kit })
          )}
          initData={[text, shape]}
          initSelection={{ selectedElements: [shape], selectArea: null }}
          initViewPort={{ minX: 0, minY: 0, width: 800, height: 600, zoom: 1 }}
          showToolbar={false}
          showAttributeSetter={false}
          showStatusBar={false}
        />
      )
    );
    const editor = host.querySelector<HTMLInputElement>("[data-test-editor]")!;
    await act(async () => editor.focus());
    expect(board.isEditingElements).toEqual(["text"]);
    await act(async () =>
      editor.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Delete", keyCode: 46, which: 46 })
      )
    );
    expect(board.children).toHaveLength(2);
    const canvas = host.querySelector<HTMLElement>("[data-whiteboard-root]")!;
    if (mode === "unmount") {
      await act(async () =>
        board.apply(
          { type: "set_viewport", properties: { minX: 0 }, newProperties: { minX: 2000 } },
          false
        )
      );
      expect(host.querySelector("[data-test-editor]")).toBeNull();
      expect(board.isEditingElements).toEqual([]);
    } else {
      await act(async () => canvas.focus());
      expect(board.isEditingElements).toEqual([]);
      await act(async () =>
        canvas.dispatchEvent(
          new KeyboardEvent("keydown", { bubbles: true, key: "Delete", keyCode: 46, which: 46 })
        )
      );
      expect(board.children.some(node => node.id === "shape")).toBe(false);
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 120));
      });
      expect(board.children).toEqual([]);
      expect(board.isEditingElements).toEqual([]);
    }
  } finally {
    await act(async () => root.unmount());
  }
});
