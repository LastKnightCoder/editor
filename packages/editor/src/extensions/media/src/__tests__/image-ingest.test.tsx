import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { Editor as SlateEditor, Node, Transforms } from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { describe, expect, it, vi } from "vitest";
import { Editor, createEditorKit, type EditorRef } from "@tau/editor";
import { createParagraph, IEditorNotifier, type IngestContext } from "@tau/editor/api";
import { IResourceService } from "@tau/shared/host-services";
import { mediaExtensions } from "../index";
import { IEditorSlots } from "../../services";
import { createDefaultEditorSlots } from "../../slots";
import { imageIngestSpec } from "../extensions/image/ingest";

async function mount(text: string, upload: (file: File) => Promise<string>) {
  const kit = createEditorKit({
    extensions: mediaExtensions,
    services: [
      register => register(IEditorSlots, createDefaultEditorSlots()),
      register => register(IResourceService, { upload }),
      register => register(IEditorNotifier, { error: () => undefined } as never),
    ],
  });
  const ref = createRef<EditorRef>(),
    host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const paragraph = createParagraph();
  paragraph.children = [{ type: "formatted", text }];
  const render = (readonly = false) =>
    act(async () =>
      root.render(
        <DndProvider backend={HTML5Backend}>
          <Editor ref={ref} kit={kit} readonly={readonly} initValue={[paragraph]} />
        </DndProvider>
      )
    );
  await render();
  const editor = ref.current?.getEditor();
  if (!editor) throw new Error("编辑器未挂载");
  await act(async () => Transforms.select(editor, SlateEditor.end(editor, [0])));
  const context: IngestContext = {
    editor,
    source: "paste",
    data: {} as DataTransfer,
    files: ["first.png", "second.png"].map(name => new File(["图片"], name, { type: "image/png" })),
  };
  return {
    render,
    editor,
    context,
    dispose: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

describe("图片真实装配下的多文件与异步定位", () => {
  it("批次取消后恢复编辑，不启动后续上传且释放占位忙态", async () => {
    let finish!: (url: string) => void;
    const upload = vi.fn(
      () =>
        new Promise<string>(resolve => {
          finish = resolve;
        })
    );
    const view = await mount("", upload);
    try {
      let task!: Promise<void>;
      await act(async () => {
        task = imageIngestSpec.files.run(view.context);
      });
      expect(upload).toHaveBeenCalledTimes(1);
      expect(
        view.editor.children.every(
          node => !("pasteUploading" in node) || node.pasteUploading !== true
        )
      ).toBe(true);
      await view.render(true);
      await view.render(false);
      await act(async () => {
        finish("old-result");
        await task;
      });
      expect(upload).toHaveBeenCalledTimes(1);
      expect(
        view.editor.children.filter(node => node.type === "image").every(node => node.url === "")
      ).toBe(true);
      expect(view.editor.pathRefs().size).toBe(0);
    } finally {
      await view.dispose();
    }
  });

  it.each(["drop", "paste"] as const)("%s 多文件保持块/行内落位与各自地址", async source => {
    const view = await mount(source === "drop" ? "" : "正文", async file => file.name);
    try {
      view.context.source = source;
      if (source === "drop") view.context.point = { path: [0, 0], offset: 0 };
      await act(async () => imageIngestSpec.files.run(view.context));
      const expectedType = source === "drop" ? "image" : "inline-image";
      const nodes = [
        ...SlateEditor.nodes(view.editor, { at: [], match: node => node.type === expectedType }),
      ];
      expect(nodes).toHaveLength(2);
      expect(nodes.map(([node]) => "url" in node && node.url)).toEqual(["first.png", "second.png"]);
      expect(Node.string(view.editor)).toBe(source === "drop" ? "" : "正文");
    } finally {
      await view.dispose();
    }
  });

  it("上传期间删除占位，完成后不能回填同位置的新图片", async () => {
    let finish: (url: string) => void = () => undefined;
    const view = await mount(
      "",
      () =>
        new Promise<string>(resolve => {
          finish = resolve;
        })
    );
    try {
      view.context.files = view.context.files?.slice(0, 1);
      let task: Promise<void> | undefined;
      await act(async () => {
        task = imageIngestSpec.files.run(view.context);
      });
      await act(async () => {
        Transforms.removeNodes(view.editor, { at: [0] });
        Transforms.insertNodes(
          view.editor,
          {
            type: "image",
            url: "replacement",
            children: [{ type: "formatted", text: "" }],
          },
          { at: [0] }
        );
      });
      await act(async () => {
        finish("uploaded");
        await task;
      });
      expect(view.editor.children[0]).toMatchObject({ type: "image", url: "replacement" });
    } finally {
      await view.dispose();
    }
  });
});
