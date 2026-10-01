import { act, Activity, createRef } from "react";
import { createRoot } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Transforms } from "slate";
import { expect, it, vi } from "vitest";
import { Editor, createEditorKit, type EditorRef } from "@tau/editor";
import { IResourceService } from "@tau/shared/host-services";
import { image, openLocalMediaPicker } from "../index";
import { createDefaultEditorSlots } from "../../slots";
import { IEditorSlots } from "../../services";

const scenarios = ["只读", "隐藏", "卸载", "只读后恢复", "隐藏后恢复"].flatMap(state =>
  [true, false].flatMap(target => [true, false].map(success => ({ state, target, success })))
);

it.each(scenarios)(
  "上传失效后不写入：$state target=$target success=$success",
  async ({ state, target, success }) => {
    let finish!: (url: string) => void;
    let fail!: (error: Error) => void;
    const upload = () =>
      new Promise<string>((resolve, reject) => {
        finish = resolve;
        fail = reject;
      });
    const kit = createEditorKit({
      extensions: [image],
      services: [
        register => register(IResourceService, { upload }),
        register => register(IEditorSlots, createDefaultEditorSlots()),
      ],
    });
    const ref = createRef<EditorRef>();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => undefined);
    const render = (changed: boolean) =>
      act(async () =>
        root.render(
          <DndProvider backend={HTML5Backend}>
            <Activity mode={changed && state.startsWith("隐藏") ? "hidden" : "visible"}>
              {!(changed && state === "卸载") && (
                <Editor
                  ref={ref}
                  kit={kit}
                  readonly={changed && state.startsWith("只读")}
                  initValue={[
                    ...(target
                      ? [
                          {
                            type: "image" as const,
                            url: "",
                            children: [{ type: "formatted" as const, text: "" }],
                          },
                        ]
                      : []),
                    { type: "paragraph", children: [{ type: "formatted", text: "" }] },
                  ]}
                />
              )}
            </Activity>
          </DndProvider>
        )
      );
    try {
      await render(false);
      const editor = ref.current?.getEditor();
      if (!editor) throw new Error("编辑器未挂载");
      await act(async () => Transforms.select(editor, { path: [target ? 1 : 0, 0], offset: 0 }));
      const element = editor.children[0];
      openLocalMediaPicker(
        editor,
        "image",
        target && element.type === "image" ? element : undefined
      );
      const input = document.body.querySelector<HTMLInputElement>(
        'input[type="file"][accept="image/*"]'
      );
      if (!input) throw new Error("文件选择器未挂载");
      Object.defineProperty(input, "files", {
        configurable: true,
        value: [new File(["image"], "a.png", { type: "image/png" })],
      });
      let task: unknown;
      await act(async () => {
        task = input.onchange?.call(input, new Event("change"));
      });
      const before = structuredClone(editor.children);
      await render(true);
      if (state.endsWith("恢复")) await render(false);
      await act(async () => {
        if (success) finish("uploaded");
        else fail(new Error("上传失败"));
        await task;
      });
      expect(editor.children).toEqual(before);
      expect(editor.pathRefs().size).toBe(0);
    } finally {
      click.mockRestore();
      await act(async () => root.unmount());
      host.remove();
    }
  }
);
