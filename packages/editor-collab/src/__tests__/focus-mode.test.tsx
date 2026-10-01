import { act } from "react";
import { createRoot } from "react-dom/client";
import { it, expect } from "vitest";
import { Editor as SlateEditor, Transforms, Node, Element } from "slate";
import { ReactEditor } from "slate-react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Awareness } from "y-protocols/awareness";
import { createSharedDocument } from "@tau/collaboration";
import { Editor, createEditorKit } from "@tau/editor";
import { createDefaultEditorSlots } from "@tau/editor-media/slots";
import { IEditorSlots } from "@tau/editor-media/services";
import { focusRoleOf } from "../../../editor/src/components/FocusPath/focusPath";
import { createYjsDocument } from "../document";
import type { EditorCollaborationBinding } from "../types";

// 聚焦模式（focusMode）在协作文档下的回归：Yjs 同步整体替换节点对象，按 findPath 判断会卡住过期标记。
// 随机混合换行 / 输入 / 删除 / 移动光标，每步核对 DOM 标记与选区推导的角色一致。
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const kit = createEditorKit({
  services: [register => register(IEditorSlots, createDefaultEditorSlots())],
});
const p = (text: string) => ({ type: "paragraph", children: [{ text }] });

for (const mode of ["local", "shared"] as const) {
  it(`${mode} 模式：标记始终跟随选区`, async () => {
    const privateNodes = new Map();
    const content = [
      p("A"),
      p("B"),
      p("C"),
      { type: "header", level: 2, children: [{ text: "H" }] },
      p("D"),
      p("E"),
    ];
    const doc = createSharedDocument(
      { title: "t", content, bannerBg: "", bannerPosition: "center" } as never,
      privateNodes,
      mode
    );
    const binding: EditorCollaborationBinding = {
      mode,
      doc,
      awareness: new Awareness(doc),
      origin: {},
      privateNodes,
      uploadResource: async () => "",
      resolveResource: async url => url,
    };
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    let editor: SlateEditor | null = null;
    const documentSource = createYjsDocument(binding);
    await act(async () =>
      root.render(
        <DndProvider backend={HTML5Backend}>
          <Editor
            kit={kit}
            document={documentSource}
            readonly={false}
            focusMode
            onInit={v => (editor = v)}
          />
        </DndProvider>
      )
    );
    const ed = editor as unknown as SlateEditor;
    let seed = 11;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    const problems: string[] = [];
    for (let step = 0; step < 150; step++) {
      const blocks = ed.children.length;
      const op = rnd(5);
      await act(async () => {
        if (op === 0) Transforms.select(ed, SlateEditor.start(ed, [rnd(blocks)]));
        else if (op === 1 && ed.selection) ed.insertBreak();
        else if (op === 2 && ed.selection) ed.insertText("x");
        else if (op === 3 && ed.selection) ed.deleteBackward("character");
        else if (op === 4) Transforms.select(ed, SlateEditor.end(ed, [rnd(blocks)]));
      });
      await act(async () => {
        await new Promise(r => setTimeout(r, 0));
      });
      const at = ed.selection?.focus.path;
      for (const [node, path] of Node.nodes(ed)) {
        if (!Element.isElement(node)) continue;
        let dom: HTMLElement;
        try {
          dom = ReactEditor.toDOMNode(ed as ReactEditor, node);
        } catch {
          continue;
        }
        const expected = focusRoleOf(ed, node, at);
        const actual = dom.hasAttribute("data-focus-unit")
          ? "unit"
          : dom.hasAttribute("data-focus-path")
            ? "path"
            : null;
        if (expected !== actual)
          problems.push(
            `step ${step} op ${op} at ${JSON.stringify(at)} el ${JSON.stringify(path)} "${Node.string(node).slice(0, 6)}" exp ${expected} act ${actual}`
          );
      }
    }
    await act(async () => root.unmount());
    expect(problems).toEqual([]);
  });
}
