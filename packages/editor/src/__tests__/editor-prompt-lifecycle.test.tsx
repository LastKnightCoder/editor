import { act, Activity, createRef } from "react";
import { createRoot } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { expect, it } from "vitest";
import { Editor, createEditorKit, createValueDocument, notifierOf, type EditorRef } from "../index";
import { createParagraph } from "../model/paragraph";
import usePromptStore from "../stores/usePromptStore";

it.each(["隐藏", "卸载", "只读", "换源"])("多编辑器下发起者%s会取消自己的输入", async scenario => {
  const kit = createEditorKit();
  const ref = createRef<EditorRef>();
  const otherRef = createRef<EditorRef>();
  const first = createValueDocument([createParagraph()], undefined, { lineage: "same" });
  const second = createValueDocument([createParagraph()], undefined, { lineage: "same" });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const render = (changed: boolean) =>
    act(async () =>
      root.render(
        <DndProvider backend={HTML5Backend}>
          <Editor ref={otherRef} kit={kit} initValue={[createParagraph()]} readonly={false} />
          <Activity mode={changed && scenario === "隐藏" ? "hidden" : "visible"}>
            {!(changed && scenario === "卸载") && (
              <Editor
                ref={ref}
                kit={kit}
                document={changed && scenario === "换源" ? second : first}
                readonly={changed && scenario === "只读"}
              />
            )}
          </Activity>
        </DndProvider>
      )
    );
  try {
    await render(false);
    const editor = ref.current?.getEditor();
    if (!editor) throw new Error("发起编辑器未挂载");
    let result!: Promise<string | null>;
    await act(async () => {
      result = notifierOf(editor).prompt({ title: "输入" });
    });
    expect(usePromptStore.getState().pending).not.toBeNull();
    await render(true);
    expect(usePromptStore.getState().pending).toBeNull();
    await expect(result).resolves.toBeNull();
    await render(false);
    expect(usePromptStore.getState().pending).toBeNull();
    const otherEditor = otherRef.current?.getEditor();
    if (!otherEditor) throw new Error("其他编辑器未挂载");
    let otherResult!: Promise<string | null>;
    await act(async () => {
      otherResult = notifierOf(otherEditor).prompt({ title: "其他编辑器" });
    });
    await render(true);
    expect(usePromptStore.getState().pending?.title).toBe("其他编辑器");
    await act(async () => usePromptStore.getState().settle("保留请求"));
    await expect(otherResult).resolves.toBe("保留请求");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("取消旧输入的信号不会结算后续请求", async () => {
  const controller = new AbortController();
  const store = usePromptStore.getState();
  const host = Symbol("test");
  store.attachHost(host);
  try {
    const first = store.request({ title: "旧输入", signal: controller.signal });
    const second = store.request({ title: "新输入" });
    await expect(first).resolves.toBeNull();
    controller.abort();
    expect(usePromptStore.getState().pending?.title).toBe("新输入");
    store.settle("结果");
    await expect(second).resolves.toBe("结果");
    await expect(store.request({ title: "已取消", signal: controller.signal })).resolves.toBeNull();
  } finally {
    store.detachHost(host);
  }
});
