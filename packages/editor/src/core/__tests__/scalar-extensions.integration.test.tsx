import { act, createRef, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Editor as SlateEditor, Node, type Descendant, type Element } from "slate";
import { ReactEditor } from "slate-react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { expect, it } from "vitest";
import { Editor, createEditorKit, type EditorExtension, type EditorRef } from "../index";
import { IOverlayBackDismiss, type OverlayBackDismissProps } from "../api";
import linkExtension from "@tau/editor/extensions/link";
import commentExtension from "@tau/editor/extensions/comment";
import annotationExtension from "@tau/editor/extensions/annotation";

async function mount(extension: EditorExtension, node: Element, readonly: boolean) {
  const dismissals = new Set<() => void>();
  function Layer({ onDismiss }: OverlayBackDismissProps) {
    useEffect(() => {
      dismissals.add(onDismiss);
      return () => {
        dismissals.delete(onDismiss);
      };
    }, [onDismiss]);
    return null;
  }
  const kit = createEditorKit({
    extensions: [extension],
    services: [register => register(IOverlayBackDismiss, { Layer })],
  });
  const ref = createRef<EditorRef>(),
    host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const value = [{ type: "paragraph", children: [node] }] as Descendant[];
  await act(async () =>
    root.render(
      <DndProvider backend={HTML5Backend}>
        <Editor ref={ref} kit={kit} readonly={readonly} initValue={value} />
      </DndProvider>
    )
  );
  const editor = ref.current?.getEditor();
  if (!editor) throw new Error("编辑器未挂载");
  return {
    editor,
    host,
    dismissals,
    dispose: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

it("链接保留 Slate DOM 引用，挂载不主动弹出浮层或改写正文", async () => {
  const view = await mount(
    linkExtension,
    {
      type: "link",
      url: "https://example.com",
      children: [{ type: "formatted", text: "标签" }],
    },
    false
  );
  try {
    const [entry] = SlateEditor.nodes(view.editor, { at: [], match: node => node.type === "link" });
    expect(ReactEditor.toDOMNode(view.editor, entry[0]).tagName).toBe("A");
    expect(Node.string(view.editor)).toBe("标签");
    expect([
      ...SlateEditor.nodes(view.editor, { at: [], match: node => node.type === "link" }),
    ]).toHaveLength(1);
    expect(view.dismissals.size).toBe(0);
  } finally {
    await view.dispose();
  }
});

it("只读空批注不自动解包，查看与返回不改写文档", async () => {
  const view = await mount(
    commentExtension,
    {
      type: "comment",
      uuid: "comment",
      comments: [],
      children: [{ type: "formatted", text: "正文" }],
    },
    true
  );
  try {
    const before = JSON.stringify(view.editor.children);
    const trigger = view.host.querySelector('[aria-label="添加批注"]') as HTMLSpanElement;
    expect(trigger).toBeTruthy();
    await act(async () => trigger.click());
    expect(view.dismissals.size).toBe(1);
    await act(async () => [...view.dismissals][0]());
    expect(view.dismissals.size).toBe(0);
    expect(JSON.stringify(view.editor.children)).toBe(before);
  } finally {
    await view.dispose();
  }
});

it("只读注释可查看并经宿主返回关闭，保留原内容", async () => {
  const view = await mount(
    annotationExtension,
    {
      type: "annotation",
      content: "说明",
      children: [{ type: "formatted", text: "" }],
    },
    true
  );
  try {
    const before = JSON.stringify(view.editor.children);
    const trigger = view.host.querySelector("span.absolute") as HTMLSpanElement;
    await act(async () => trigger.click());
    expect(view.dismissals.size).toBe(1);
    await act(async () => [...view.dismissals][0]());
    expect(view.dismissals.size).toBe(0);
    expect(JSON.stringify(view.editor.children)).toBe(before);
  } finally {
    await view.dispose();
  }
});
