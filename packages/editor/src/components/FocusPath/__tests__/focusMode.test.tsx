import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { Transforms, type Descendant, type Path } from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import { Editor, createEditorKit, type EditorRef } from "../../../index";
import { createDefaultEditorSlots, IEditorSlots } from "../../../services";
import { FOCUS_PATH_ATTR, FOCUS_UNIT_ATTR } from "../focusPath";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const p = (text: string) => ({ type: "paragraph", children: [{ type: "formatted", text }] });
const VALUE = [
  p("P0"),
  p("P1"),
  { type: "highlight-block", color: "red", children: [p("H0"), p("H1")] },
] as unknown as Descendant[];
const kit = createEditorKit({
  services: [register => register(IEditorSlots, createDefaultEditorSlots())],
});

let root: Root | null = null;
let container: HTMLDivElement | null = null;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

async function mount(focusMode = true) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const reactRoot = createRoot(host);
  container = host;
  root = reactRoot;
  const ref: { current: EditorRef | null } = { current: null };
  const render = (enabled: boolean) =>
    reactRoot.render(
      <DndProvider backend={HTML5Backend}>
        <Editor
          kit={kit}
          ref={value => {
            ref.current = value;
          }}
          initValue={VALUE}
          readonly={false}
          focusMode={enabled}
        />
      </DndProvider>
    );
  await act(async () => render(focusMode));
  const editorRef = ref.current;
  if (!editorRef) throw new Error("编辑器未挂载");
  const editor = editorRef.getEditor();
  const select = (path: Path) => act(async () => Transforms.select(editor, { path, offset: 0 }));
  /** 带标记的元素文本：path 链与聚焦单元 */
  const marks = () => {
    const text = (attr: string) =>
      [...host.querySelectorAll(`[${attr}]`)].map(el => el.textContent);
    return { path: text(FOCUS_PATH_ATTR), unit: text(FOCUS_UNIT_ATTR) };
  };
  return { editor, select, marks, setFocusMode: (on: boolean) => act(async () => render(on)) };
}

describe("Editor focusMode", () => {
  it("段落：只有光标所在段落在链上", async () => {
    const { select, marks } = await mount();
    await select([1, 0]);
    expect(marks()).toEqual({ path: ["P1"], unit: ["P1"] });
    await select([0, 0]);
    expect(marks()).toEqual({ path: ["P0"], unit: ["P0"] });
  });

  it("容器块：外层块与里面的当前段落在链上，块内其他段落不在", async () => {
    const { select, marks } = await mount();
    await select([2, 1, 0]);
    expect(marks()).toEqual({ path: ["H0H1", "H1"], unit: ["H1"] });
    await select([1, 0]);
    expect(marks()).toEqual({ path: ["P1"], unit: ["P1"] });
  });

  it("输入引起的重渲染不丢标记", async () => {
    const { editor, select, marks } = await mount();
    await select([0, 0]);
    await act(async () => editor.insertText("x"));
    expect(marks()).toEqual({ path: ["xP0"], unit: ["xP0"] });
  });

  it("关闭聚焦模式后不再标记", async () => {
    const { select, marks, setFocusMode } = await mount();
    await select([1, 0]);
    await setFocusMode(false);
    expect(marks()).toEqual({ path: [], unit: [] });
  });
});
