import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Node, Transforms } from "slate";
import { describe, expect, it, vi } from "vitest";
import { Editor, createEditorKit, type EditorRef } from "@tau/editor";
import { createParagraph, IEditorNotifier } from "@tau/editor/api";
import { IResourceService } from "@tau/shared/host-services";
import { image, openLocalMediaPicker } from "../index";
import { createDefaultEditorSlots } from "../../slots";
import { IEditorSlots } from "../../services";

describe("原地媒体上传", () => {
  it.each(["移动后成功", "替换后成功", "替换后失败", "取消"])(
    "%s 保持原目标归属",
    async scenario => {
      let finish: (url: string) => void = () => undefined;
      let fail: (error: Error) => void = () => undefined;
      const upload = vi.fn(
        () =>
          new Promise<string>((resolve, reject) => {
            finish = resolve;
            fail = reject;
          })
      );
      const complete = vi.fn();
      const click = vi
        .spyOn(HTMLInputElement.prototype, "click")
        .mockImplementation(() => undefined);
      const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const kit = createEditorKit({
        extensions: [image],
        services: [
          register => register(IResourceService, { upload }),
          register => register(IEditorSlots, createDefaultEditorSlots()),
          register => register(IEditorNotifier, { error: vi.fn() } as never),
        ],
      });
      const ref = createRef<EditorRef>();
      const host = document.createElement("div");
      document.body.appendChild(host);
      const root = createRoot(host);
      try {
        await act(async () =>
          root.render(
            <DndProvider backend={HTML5Backend}>
              <Editor
                ref={ref}
                kit={kit}
                readonly={false}
                initValue={[
                  { type: "image", url: "", children: [{ type: "formatted", text: "" }] },
                  createParagraph(),
                ]}
              />
            </DndProvider>
          )
        );
        const editor = ref.current?.getEditor();
        if (!editor) throw new Error("编辑器未挂载");
        const target = editor.children[0];
        if (target.type !== "image") throw new Error("图片未挂载");
        openLocalMediaPicker(editor, "image", target, { onComplete: complete });
        const input = document.body.querySelector(
          'input[type="file"][accept="image/*"]'
        ) as HTMLInputElement;
        expect(click).toHaveBeenCalled();
        if (scenario === "取消") {
          await act(async () => input.dispatchEvent(new Event("cancel")));
          expect(upload).not.toHaveBeenCalled();
          expect(complete).toHaveBeenCalledTimes(1);
          return;
        }
        Object.defineProperty(input, "files", {
          configurable: true,
          value: [new File(["图片"], "a.png", { type: "image/png" })],
        });
        let task: unknown;
        await act(async () => {
          task = input.onchange?.call(input, new Event("change"));
        });
        expect(upload).toHaveBeenCalledTimes(1);
        await act(async () => {
          const prefix = createParagraph();
          prefix.children = [{ type: "formatted", text: "保留" }];
          Transforms.insertNodes(editor, prefix, { at: [0] });
          if (scenario.startsWith("替换后")) {
            Transforms.removeNodes(editor, { at: [1] });
            Transforms.insertNodes(
              editor,
              {
                type: "image",
                url: "replacement",
                children: [{ type: "formatted", text: "" }],
              },
              { at: [1] }
            );
          }
        });
        await act(async () => {
          if (scenario.endsWith("失败")) fail(new Error("上传失败"));
          else finish("uploaded");
          await task;
        });
        expect(editor.children[1]).toMatchObject({
          type: "image",
          url: scenario.startsWith("替换后") ? "replacement" : "uploaded",
        });
        expect(Node.string(editor)).toBe("保留");
        expect(complete).toHaveBeenCalledTimes(1);
        expect(editor.pathRefs().size).toBe(0);
      } finally {
        await act(async () => root.unmount());
        host.remove();
        click.mockRestore();
        error.mockRestore();
      }
    }
  );
});
