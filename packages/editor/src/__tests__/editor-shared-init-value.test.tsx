// 同一份初始内容交给多个编辑器：每个编辑器必须持有独立的节点对象，
// 否则 Slate 的 NODE_TO_PARENT 被后渲染的编辑器覆盖，先渲染的编辑器 findPath 抛错。
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { Descendant } from "slate";
import { ReactEditor } from "slate-react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import { Editor, createEditorKit } from "../index";
import { createDefaultEditorSlots } from "@tau/editor-media/slots";
import { IEditorSlots } from "@tau/editor-media/services";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const kit = createEditorKit({
  services: [register => register(IEditorSlots, createDefaultEditorSlots())],
});

describe("Editor 初始内容归实例独占", () => {
  let root: Root | null = null;

  afterEach(async () => {
    await act(async () => root?.unmount());
    root = null;
    document.body.innerHTML = "";
  });

  it("两个编辑器共用一份 initValue 时各自 findPath 正常", async () => {
    const shared: Descendant[] = [
      { type: "paragraph", children: [{ type: "formatted", text: "共享" }] },
    ];
    const editors: ReactEditor[] = [];
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(
        <DndProvider backend={HTML5Backend}>
          {[0, 1].map(index => (
            <Editor
              key={index}
              kit={kit}
              initValue={shared}
              onInit={editor => editors.push(editor as ReactEditor)}
            />
          ))}
        </DndProvider>
      );
    });

    expect(editors).toHaveLength(2);
    for (const editor of editors) {
      expect(editor.children[0]).not.toBe(shared[0]);
      expect(ReactEditor.findPath(editor, editor.children[0])).toEqual([0]);
    }
    expect(editors[0].children[0]).not.toBe(editors[1].children[0]);
  });
});
