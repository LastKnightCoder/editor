// 标题折叠动画写的是内联样式；挂载或展开后残留的内联 opacity 会压过宿主对块的样式
// （沉浸写作的段落聚焦因此在第一个标题之后全部失效）。
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Transforms, type Descendant } from "slate";
import { ReactEditor } from "slate-react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import { Editor, createEditorKit, type EditorRef } from "../../../index";
import { createDefaultEditorSlots, IEditorSlots } from "../../../services";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const text = (value: string) => [{ type: "formatted", text: value }];
const VALUE = [
  { type: "header", level: 2, children: text("标题") },
  { type: "paragraph", children: text("一") },
  { type: "paragraph", children: text("二") },
] as unknown as Descendant[];
const kit = createEditorKit({
  services: [register => register(IEditorSlots, createDefaultEditorSlots())],
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;
beforeEach(() => vi.useFakeTimers());
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  host?.remove();
  host = null;
  vi.useRealTimers();
});

async function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const reactRoot = createRoot(container);
  host = container;
  root = reactRoot;
  const ref: { current: EditorRef | null } = { current: null };
  await act(async () =>
    reactRoot.render(
      <DndProvider backend={HTML5Backend}>
        <Editor
          kit={kit}
          ref={value => {
            ref.current = value;
          }}
          initValue={VALUE}
          readonly={false}
        />
      </DndProvider>
    )
  );
  const editorRef = ref.current;
  if (!editorRef) throw new Error("编辑器未挂载");
  const editor = editorRef.getEditor();
  const sectionStyles = () =>
    editor.children.slice(1).map(node => ReactEditor.toDOMNode(editor, node).style.cssText);
  return { editor, sectionStyles };
}

describe("标题折叠的内联样式", () => {
  it("未折叠的标题挂载后，下方的块不带内联样式", async () => {
    const { sectionStyles } = await mount();
    await act(async () => vi.advanceTimersByTime(300));
    expect(sectionStyles()).toEqual(["", ""]);
  });

  it("折叠再展开，动画结束后内联样式全部清掉", async () => {
    const { editor, sectionStyles } = await mount();
    await act(async () => Transforms.setNodes(editor, { collapsed: true } as never, { at: [0] }));
    await act(async () => vi.advanceTimersByTime(300));
    await act(async () => Transforms.setNodes(editor, { collapsed: false } as never, { at: [0] }));
    await act(async () => vi.advanceTimersByTime(300));
    expect(sectionStyles().map(style => style.includes("opacity"))).toEqual([false, false]);
  });
});
