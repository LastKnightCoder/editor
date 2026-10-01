import { act, Activity, createRef } from "react";
import { createRoot } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Editor as SlateEditor, Node, Transforms } from "slate";
import { expect, it } from "vitest";
import { Editor, createEditorKit, createValueDocument, type EditorRef } from "../index";
import { captureElementSubmission, createParagraph, createServiceId } from "../api";

it.each(["只读", "隐藏", "换源", "整体重设", "服务更换", "主题派生"])(
  "真实编辑器的%s影响原操作的有效期",
  async scenario => {
    const service = createServiceId<object>("test.submission-service");
    const kit = createEditorKit({ services: [register => register(service, {})] });
    const changedKit = kit.extend({ services: [register => register(service, {})] });
    const themedKit = kit.extend({
      theme: { mode: "light", themeKey: "test", token: () => "", subscribe: () => () => undefined },
    });
    const first = createValueDocument([createParagraph()], undefined, { lineage: "same" });
    const second = createValueDocument([createParagraph()], undefined, { lineage: "same" });
    const reset = createValueDocument([createParagraph()]);
    const ref = createRef<EditorRef>();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const render = (changed: boolean) =>
      act(async () =>
        root.render(
          <DndProvider backend={HTML5Backend}>
            <Activity mode={changed && scenario === "隐藏" ? "hidden" : "visible"}>
              <Editor
                ref={ref}
                document={
                  changed && scenario === "整体重设"
                    ? reset
                    : changed && scenario === "换源"
                      ? second
                      : first
                }
                kit={
                  changed && scenario === "服务更换"
                    ? changedKit
                    : changed && scenario === "主题派生"
                      ? themedKit
                      : kit
                }
                readonly={changed && scenario === "只读"}
              />
            </Activity>
          </DndProvider>
        )
      );
    try {
      await render(false);
      const editor = ref.current?.getEditor();
      if (!editor) throw new Error("编辑器未挂载");
      const target = editor.children[0];
      if (target.type !== "paragraph") throw new Error("段落未挂载");
      const operation = captureElementSubmission(editor, { element: target, services: [service] });
      await render(true);
      await render(false);
      if (scenario === "整体重设") expect(ref.current?.getEditor()).not.toBe(editor);
      else expect(ref.current?.getEditor()).toBe(editor);
      let outcome: ReturnType<typeof operation.commit> | undefined;
      await act(async () => {
        outcome = operation.commit(({ path }) => {
          Transforms.insertText(editor, "完成", { at: SlateEditor.start(editor, path) });
        });
      });
      expect(outcome?.status).toBe(scenario === "主题派生" ? "committed" : "discarded");
      expect(Node.string(editor)).toBe(scenario === "主题派生" ? "完成" : "");
      expect(editor.pathRefs().size).toBe(0);
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  }
);
