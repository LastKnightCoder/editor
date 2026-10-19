import { act, createRef, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { expect, it } from "vitest";
import { Editor, createEditorKit, type EditorRef } from "@tau/editor";
import { IOverlayBackDismiss, type OverlayBackDismissProps } from "@tau/editor/api";
import { IResourceService } from "@tau/shared/host-services";
import { imageGallery, EGalleryMode } from "../index";
import { IEditorSlots } from "../../services";
import { createDefaultEditorSlots } from "../../slots";
import { imageGalleryActionsMap } from "../extensions/image-gallary/utils/menu";

it("图库设置接宿主返回仲裁，只读时拒绝打开并关闭已有编辑层", async () => {
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
    extensions: [imageGallery],
    services: [
      register => register(IEditorSlots, createDefaultEditorSlots()),
      register => register(IResourceService, { upload: async () => "" }),
      register => register(IOverlayBackDismiss, { Layer }),
    ],
  });
  const ref = createRef<EditorRef>(),
    host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const render = (readonly: boolean) =>
    act(async () =>
      root.render(
        <DndProvider backend={HTML5Backend}>
          <Editor
            ref={ref}
            kit={kit}
            readonly={readonly}
            initValue={[
              {
                type: "image-gallery",
                mode: EGalleryMode.Horizontal,
                images: [],
                children: [{ type: "formatted", text: "" }],
              },
            ]}
          />
        </DndProvider>
      )
    );
  try {
    await render(true);
    const editor = ref.current?.getEditor();
    if (!editor) throw new Error("编辑器未挂载");
    const target = editor.children[0];
    if (target.type !== "image-gallery") throw new Error("图库未挂载");
    const before = JSON.stringify(editor.children);
    await act(async () => imageGalleryActionsMap.get(target)?.openSettings());
    expect(dismissals.size).toBe(0);
    await render(false);
    await act(async () => imageGalleryActionsMap.get(target)?.openSettings());
    expect(dismissals.size).toBe(1);
    await act(async () => [...dismissals][0]());
    expect(dismissals.size).toBe(0);
    await act(async () => imageGalleryActionsMap.get(target)?.openSettings());
    expect(dismissals.size).toBe(1);
    await render(true);
    expect(dismissals.size).toBe(0);
    await render(false);
    expect(dismissals.size).toBe(0);
    expect(JSON.stringify(editor.children)).toBe(before);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
  expect(dismissals.size).toBe(0);
});
