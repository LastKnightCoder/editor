import { act, Activity, createRef } from "react";
import { createRoot } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Transforms, type Descendant } from "slate";
import { expect, it, vi } from "vitest";
import { Editor, createEditorKit, type EditorRef } from "@tau/editor";
import { useLocalEditorDocument } from "../useLocalEditorDocument";

const paragraph = (text: string): Descendant => ({
  type: "paragraph",
  children: [{ type: "formatted", text }],
});

it("本地生成文档保留实例，停驻可恢复，换轮次隔离旧结果与撤销", async () => {
  const kit = createEditorKit();
  const onChange = vi.fn();
  const ref = createRef<EditorRef>();
  const sessions = new Set<ReturnType<typeof useLocalEditorDocument>>();
  let current: ReturnType<typeof useLocalEditorDocument> | undefined;
  function Harness({ id }: { id: string }) {
    const session = useLocalEditorDocument(id, onChange);
    sessions.add(session);
    current = session;
    return <Editor ref={ref} kit={kit} document={session.document} readonly={false} />;
  }
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const render = (id: string, hidden = false) =>
    act(async () =>
      root.render(
        <DndProvider backend={HTML5Backend}>
          <Activity mode={hidden ? "hidden" : "visible"}>
            <Harness id={id} />
          </Activity>
        </DndProvider>
      )
    );
  try {
    await render("第一轮");
    if (!current) throw new Error("文档未就绪");
    const first = current;
    await act(async () => first.updateContent([paragraph("生成正文")], "external"));
    const editor = ref.current?.getEditor();
    if (!editor) throw new Error("编辑器未就绪");
    expect(onChange).not.toHaveBeenCalled();
    await act(async () =>
      Transforms.insertText(editor, "编辑", { at: { path: [0, 0], offset: 4 } })
    );
    expect(onChange).toHaveBeenCalled();
    await render("第一轮", true);
    await act(async () =>
      first.updateContent([paragraph("生成正文编辑"), paragraph("后台增量")], "external")
    );
    await render("第一轮");
    expect(current).toBe(first);
    expect(ref.current?.getEditor()).toBe(editor);
    await act(async () => first.undo());
    expect(first.getContent()).toEqual([paragraph("生成正文"), paragraph("后台增量")]);
    await render("第二轮");
    expect(current).not.toBe(first);
    expect(ref.current?.getEditor()).not.toBe(editor);
    await act(async () => first.updateContent([paragraph("上一轮迟到结果")], "external"));
    expect(JSON.stringify(ref.current?.getEditor().children)).not.toContain("迟到结果");
    expect(current?.undoManager.undoStack).toHaveLength(0);
  } finally {
    await act(async () => root.unmount());
    for (const session of sessions) session.dispose();
    host.remove();
  }
});
