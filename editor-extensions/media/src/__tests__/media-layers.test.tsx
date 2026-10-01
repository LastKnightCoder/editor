import { act, Activity, createRef, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { expect, it } from "vitest";
import { lockBodyScroll } from "@tau/ui";
import { Editor, createEditorKit, type EditorRef } from "@tau/editor";
import { type ImageElement } from "../types/index";
import {
  defineExtension,
  type OverlayBackDismissProps,
  IOverlayBackDismiss,
} from "@tau/editor/api";
import { mediaUiExtension } from "../extensions/media-ui/index";
import { createDefaultEditorSlots } from "../services/defaultSlots";
import { IEditorSlots } from "../services/tokens";
import { useImagesOverviewStore } from "../stores/useImagesOverviewStore";
import useMediaUrlInputStore from "../stores/useMediaUrlInputStore";

it("媒体浮层仅由所属编辑器挂载，返回/隐藏/卸载释放归属与滚动锁", async () => {
  const dismissals = new Set<() => void>();
  function DismissLayer({ onDismiss }: OverlayBackDismissProps) {
    useEffect(() => {
      dismissals.add(onDismiss);
      return () => {
        dismissals.delete(onDismiss);
      };
    }, [onDismiss]);
    return null;
  }
  const kit = createEditorKit({
    extensions: [
      mediaUiExtension,
      defineExtension({
        id: "test.image",
        elements: [
          {
            type: "image",
            kind: "block",
            isVoid: true,
            render: ({ attributes, children }) => <div {...attributes}>{children}</div>,
          },
        ],
      }),
    ],
    services: [
      register => register(IEditorSlots, createDefaultEditorSlots()),
      register => register(IOverlayBackDismiss, { Layer: DismissLayer }),
    ],
  });
  const refs = [createRef<EditorRef>(), createRef<EditorRef>()];
  const images: ImageElement[] = [0, 1].map(index => ({
    type: "image",
    url: `https://example.com/${index}.png`,
    children: [{ type: "formatted", text: "" }],
  }));
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "scroll";
  const render = (hidden = false, showFirst = true, readonly = false) =>
    act(async () =>
      root.render(
        <DndProvider backend={HTML5Backend}>
          <Activity mode={hidden ? "hidden" : "visible"}>
            {refs.map(
              (ref, index) =>
                (index !== 0 || showFirst) && (
                  <Editor
                    key={index}
                    ref={ref}
                    kit={kit}
                    initValue={[images[index]]}
                    readonly={readonly}
                  />
                )
            )}
          </Activity>
        </DndProvider>
      )
    );
  const preview = () => document.body.querySelectorAll("img.cursor-zoom-out");
  try {
    await render();
    const editors = refs.map(ref => {
      const editor = ref.current?.getEditor();
      if (!editor) throw new Error("编辑器未挂载");
      return editor;
    });
    const openImage = (index: number) =>
      act(async () => {
        const editor = editors[index];
        useImagesOverviewStore
          .getState()
          .showImageOverview(editor.children[0] as ImageElement, editor);
      });
    await openImage(0);
    expect(preview()).toHaveLength(1);
    expect(dismissals.size).toBe(1);
    expect(document.body.style.overflow).toBe("hidden");
    await openImage(1);
    expect(preview()).toHaveLength(1);
    expect(preview()[0].getAttribute("src")).toBe(images[1].url);
    await render(false, false);
    expect(useImagesOverviewStore.getState().editor).toBe(editors[1]);
    expect(preview()).toHaveLength(1);
    const unlockOtherOverlay = lockBodyScroll(document);
    await act(async () => [...dismissals][0]());
    expect(preview()).toHaveLength(0);
    expect(useImagesOverviewStore.getState().editor).toBeNull();
    expect(document.body.style.overflow).toBe("hidden");
    unlockOtherOverlay();
    expect(document.body.style.overflow).toBe("scroll");
    await openImage(1);
    await render(true, false);
    expect(useImagesOverviewStore.getState().editor).toBeNull();
    expect(dismissals.size).toBe(0);
    expect(document.body.style.overflow).toBe("scroll");
    await render(false, false);
    expect(preview()).toHaveLength(0);
    await act(async () => useMediaUrlInputStore.getState().show(editors[1], "image"));
    expect(document.body.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(dismissals.size).toBe(1);
    await act(async () => [...dismissals][0]());
    expect(useMediaUrlInputStore.getState().editor).toBeNull();
    await act(async () => useMediaUrlInputStore.getState().show(editors[1], "image"));
    await render(false, false, true);
    expect(useMediaUrlInputStore.getState().editor).toBeNull();
    await openImage(1);
    expect(preview()).toHaveLength(1);
    await act(async () =>
      useImagesOverviewStore.getState().showImageOverview({ ...images[0] }, editors[1])
    );
    expect(useImagesOverviewStore.getState().editor).toBe(editors[1]);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    expect(useImagesOverviewStore.getState().editor).toBeNull();
    expect(useMediaUrlInputStore.getState().editor).toBeNull();
    expect(dismissals.size).toBe(0);
    expect(document.body.style.overflow).toBe("scroll");
    document.body.style.overflow = previousOverflow;
  }
});
