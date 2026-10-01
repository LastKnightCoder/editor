import { IOpenerService } from "@tau/shared/host-services";
import { act, Activity, createRef, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Editor as SlateEditor, Transforms } from "slate";
import { useSlateStatic } from "slate-react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { expect, it, vi } from "vitest";
import { Editor, createEditorKit, type EditorKit, type EditorRef } from "../index";
import { defineExtension, type ExtensionLayerProps } from "../api";
import { IExtensionErrorReporter, useService } from "../services";

it("无服务的最小 Kit 可输入、清空回补段落，不安装产品能力", async () => {
  const kit = createEditorKit();
  const ref = createRef<EditorRef>();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <DndProvider backend={HTML5Backend}>
          <Editor ref={ref} kit={kit} initValue={[]} readonly={false} />
        </DndProvider>
      )
    );
    const editor = ref.current?.getEditor();
    if (!editor) throw new Error("编辑器未挂载");
    expect(host.querySelector("[data-slate-editor]")?.getAttribute("contenteditable")).toBe("true");
    await act(async () => {
      Transforms.select(editor, SlateEditor.start(editor, []));
      editor.insertText("基础输入");
    });
    expect(SlateEditor.string(editor, [])).toBe("基础输入");
    expect(kit.elementTypes).toEqual(["paragraph"]);
    expect(kit.assembly.layers).toEqual([]);
    expect(editor.commands?.execute("tau.mark.bold")).toBe(false);
    await act(async () => Transforms.removeNodes(editor, { at: [0] }));
    expect(editor.children).toEqual([
      { type: "paragraph", children: [{ type: "formatted", text: "" }] },
    ]);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("根 UI 可读 Slate 和派生服务，错误隔离，隐藏/卸载清理", async () => {
  const mounted = vi.fn();
  const cleanup = vi.fn();
  const report = vi.fn();
  const parentOpen = vi.fn();
  const childOpen = vi.fn();
  function Layer({ readOnly }: ExtensionLayerProps) {
    const editor = useSlateStatic();
    const opener = useService(IOpenerService);
    useEffect(() => {
      mounted(editor);
      return cleanup;
    }, [editor]);
    return (
      <button data-layer onClick={() => opener.open("test")}>
        {String(readOnly)}
      </button>
    );
  }
  function Broken(): never {
    throw new Error("扩展 UI 失败");
  }
  const kit = createEditorKit({
    extensions: [
      defineExtension({ id: "test.broken", layers: [Broken] }),
      defineExtension({ id: "test.layer", layers: [Layer] }),
    ],
    services: [
      register => register(IOpenerService, { open: parentOpen }),
      register => register(IExtensionErrorReporter, { report }),
    ],
  });
  const derived = kit.extend({
    services: [register => register(IOpenerService, { open: childOpen })],
  });
  const ref = createRef<EditorRef>();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const render = (current: EditorKit, hidden = false) =>
    act(async () =>
      root.render(
        <DndProvider backend={HTML5Backend}>
          <Activity mode={hidden ? "hidden" : "visible"}>
            <Editor ref={ref} kit={current} initValue={[]} readonly />
          </Activity>
        </DndProvider>
      )
    );
  try {
    await render(kit);
    const editor = ref.current?.getEditor();
    if (!editor) throw new Error("编辑器未挂载");
    expect(host.querySelector("[data-layer]")?.textContent).toBe("true");
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({
        extension: "test.broken",
        phase: "render",
      })
    );
    expect(mounted).toHaveBeenCalledTimes(1);
    await render(derived);
    expect(ref.current?.getEditor()).toBe(editor);
    expect(mounted).toHaveBeenCalledTimes(1);
    await act(async () => (host.querySelector("[data-layer]") as HTMLButtonElement).click());
    expect(parentOpen).not.toHaveBeenCalled();
    expect(childOpen).toHaveBeenCalledWith("test");
    await render(derived, true);
    expect(cleanup).toHaveBeenCalledTimes(1);
    await render(derived);
    expect(mounted).toHaveBeenCalledTimes(2);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
  expect(cleanup).toHaveBeenCalledTimes(2);
});
